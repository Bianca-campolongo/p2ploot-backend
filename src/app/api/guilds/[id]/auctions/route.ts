import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getAuthUser } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

// GET - List Auctions for a guild
async function listAuctions(req: NextRequest, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status'); // 'warehouse', 'active', 'upcoming', 'closed'
        const page = parseInt(searchParams.get('page') || '1');
        const requestedLimit = parseInt(searchParams.get('limit') || '20');
        const limit = Math.min(Math.max(requestedLimit || 20, 1), 50);
        const favoritesOnly = searchParams.get('favoritesOnly') === 'true';
        const search = searchParams.get('search');
        const delivered = searchParams.get('delivered');
        const rarity = searchParams.get('rarity');
        const itemType = searchParams.get('itemType');
        const isNft = searchParams.get('isNft');
        const skip = (page - 1) * limit;

        const where: any = { guildId };
        if (status) {
            where.status = status;
        }

        if (delivered === 'true') where.delivered = true;
        if (delivered === 'false') where.delivered = false;

        // Item-related filters
        const itemFilters: any = {};
        if (rarity && rarity !== 'all') {
            itemFilters.rarity = rarity;
        }
        if (itemType && itemType !== 'all') {
            itemFilters.itemType = itemType;
        }
        if (isNft && isNft !== 'all') {
            itemFilters.isNft = isNft === 'true';
        }

        if (Object.keys(itemFilters).length > 0) {
            where.item = itemFilters;
        }

        if (search) {
            where.OR = [
                { item: { name: { contains: search } } }
            ];
            const memberMatches = await prisma.guildMember.findMany({
                where: { guildId, characterName: { contains: search } },
                select: { memberId: true }
            });
            if (memberMatches.length > 0) {
                where.OR.push({ winnerId: { in: memberMatches.map(m => m.memberId) } });
            }
        }

        if (favoritesOnly) {
            const user = await getAuthUser(req);
            if (user) {
                const favorites = await prisma.userItemFavorite.findMany({
                    where: { userId: user.id },
                    select: { itemId: true }
                });
                where.itemId = { in: favorites.map(f => f.itemId) };
            }
        }

        // Auto-update statuses before fetching
        const now = new Date();

        // 1. Start upcoming auctions
        await prisma.guildAuction.updateMany({
            where: {
                guildId,
                status: 'upcoming',
                startTime: { lte: now }
            },
            data: { status: 'active' }
        });

        // 2a. Close ended active auctions WITH winner
        await prisma.guildAuction.updateMany({
            where: {
                guildId,
                status: 'active',
                endTime: { lte: now },
                winnerId: { not: null }
            },
            data: { status: 'closed' }
        });

        // 2b. Return ended active auctions WITHOUT winner to warehouse
        await prisma.guildAuction.updateMany({
            where: {
                guildId,
                status: 'active',
                endTime: { lte: now },
                winnerId: null
            },
            data: {
                status: 'warehouse',
                startTime: null,
                endTime: null,
                startingBid: 0,
                currentBid: 0
            }
        });

        const [totalItems, auctions] = await Promise.all([
            prisma.guildAuction.count({ where }),
            prisma.guildAuction.findMany({
                where,
                include: {
                    item: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            imageUrl: true,
                            isNft: true,
                            itemType: true,
                            rarity: true
                        }
                    },
                    winner: {
                        select: {
                            id: true,
                            username: true,
                        }
                    },
                    bids: {
                        orderBy: { createdAt: 'desc' },
                        include: {
                            bidder: {
                                select: { id: true, username: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            })
        ]);

        // Resolve character names instead of global usernames
        const userIdsToFetch = new Set<string>();
        auctions.forEach((a: any) => {
            if (a.winnerId) userIdsToFetch.add(a.winnerId);
            a.bids.forEach((b: any) => {
                if (b.bidderId) userIdsToFetch.add(b.bidderId);
            });
        });

        const members = await prisma.guildMember.findMany({
            where: { guildId, memberId: { in: Array.from(userIdsToFetch) } },
            include: { member: { select: { username: true } } }
        });
        const memberMap = new Map(members.map((m: any) => [m.memberId, m]));

        const formattedAuctions = auctions.map((a: any) => {
            const winnerMember = a.winnerId ? memberMap.get(a.winnerId) : null;
            const winnerName = winnerMember?.characterName || winnerMember?.member?.username || a.winner?.username || 'Desconhecido';

            return {
                ...a,
                winnerName: winnerName,
                winner_name: winnerName,
                winner: a.winner ? { ...a.winner, username: winnerName } : null,
                bids: a.bids.map((b: any) => {
                    const bidderMember = b.bidderId ? memberMap.get(b.bidderId) : null;
                    const bidderName = bidderMember?.characterName || bidderMember?.member?.username || b.bidder?.username || 'Desconhecido';
                    return {
                        ...b,
                        bidderName: bidderName,
                        bidder_name: bidderName,
                        bidder: b.bidder ? {
                            ...b.bidder,
                            username: bidderName
                        } : null
                    };
                })
            };
        });

        return NextResponse.json(deepSerialize({ 
            auctions: formattedAuctions,
            pagination: {
                total: totalItems,
                page,
                limit,
                totalPages: Math.ceil(totalItems / limit)
            }
        }));
    } catch (error) {
        console.error('Error fetching auctions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Place a bid
const bidSchema = z.object({
    auctionId: z.string().uuid(),
    amount: z.number().positive(),
    actingMemberId: z.string().optional(), // For pilots
});

async function placeBid(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const { auctionId, amount, actingMemberId } = bidSchema.parse(body);

        // Determine who is bidding
        let bidderId = user.id;

        // If acting as another member (Pilot Mode)
        if (actingMemberId && actingMemberId !== user.id) {
            // GuildCharacterShare.guildMemberId = Profile.id of the character owner (per schema)
            // actingMemberId = Profile.id of the character owner the pilot is acting as
            const pilotShare = await prisma.guildCharacterShare.findFirst({
                where: {
                    guildMemberId: actingMemberId, // Profile.id of the owner
                    sharedWithUserId: user.id,     // Profile.id of the pilot
                    guildId: guildId,
                    status: 'approved'
                }
            });

            if (!pilotShare) {
                return NextResponse.json({ error: 'Unauthorized pilot action' }, { status: 403 });
            }
            bidderId = actingMemberId;
        }

        // Get auction
        const auction = await prisma.guildAuction.findUnique({
            where: { id: auctionId },
            include: { item: true }
        });

        if (!auction || auction.guildId.toString() !== guildId.toString()) {
            return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
        }

        if (auction.status !== 'active') {
            return NextResponse.json({ error: 'Auction is not active' }, { status: 400 });
        }

        // Validate bid amount
        const currentBid = Number(auction.currentBid) || 0;
        const minIncrement = Number(auction.minBidIncrement) || 0;

        // Match frontend rounding logic (Precision fix)
        const minAdded = Math.round(((currentBid * minIncrement / 100) + Number.EPSILON) * 100) / 100;
        const minRequired = currentBid + minAdded;
        const EPSILON = 0.0001;

        if (amount < minRequired - EPSILON) {
            return NextResponse.json({ error: `Minimum bid is ${minRequired.toFixed(2)}` }, { status: 400 });
        }

        // Check user DKP Balance
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: bidderId } }
        });

        if (!member) {
            return NextResponse.json({ error: 'Member not found in this guild' }, { status: 403 });
        }

        const currentBidValue = Number(auction.currentBid) || 0;
        const balance = Number(member.dkpBalance) || 0;

        // If the bidder is the current winner, they only need the difference in their liquid balance
        const effectiveCost = bidderId === auction.winnerId ? amount - currentBidValue : amount;

        if (balance < effectiveCost - EPSILON) {
            return NextResponse.json({ error: 'Insufficient DKP balance' }, { status: 400 });
        }

        // Transaction: Deduct DKP, Record Bid, Update Auction
        await prisma.$transaction(async (tx) => {
            // 1. Refund previous highest bidder if exists (even if it's the same user)
            if (auction.winnerId) {
                const prevBid = Number(auction.currentBid);
                // Use parameterized query to prevent SQL injection
                await tx.$executeRaw`UPDATE guild_members SET dkp_balance = dkp_balance + ${prevBid} WHERE guild_id = ${guildId} AND member_id = ${auction.winnerId}`;

                // Log refund
                await tx.guildDkpLedger.create({
                    data: {
                        guildId,
                        memberId: auction.winnerId,
                        amount: prevBid,
                        description: `Estorno de lance superado: ${auction.item.name}`,
                        eventTypeId: null,
                        createdBy: user.id
                    }
                });
            }

            // 2. Deduct from bidder — parameterized to prevent SQL injection
            await tx.$executeRaw`UPDATE guild_members SET dkp_balance = dkp_balance - ${amount} WHERE guild_id = ${guildId} AND member_id = ${bidderId}`;

            // Record new bid
            await tx.guildBid.create({
                data: {
                    auctionId,
                    bidderId: bidderId,
                    amount
                }
            });

            // Log deduction
            await tx.guildDkpLedger.create({
                data: {
                    guildId,
                    memberId: bidderId,
                    amount: -amount,
                    description: `Lance: ${auction.item.name}${actingMemberId ? ' (Via Piloto)' : ''}`,
                    createdBy: user.id
                }
            });

            // Update auction
            const updateData: any = {
                currentBid: amount,
                winnerId: bidderId
            };

            // Anti-snipe extension
            if (auction.antiSnipeDuration && auction.endTime) {
                const remaining = new Date(auction.endTime).getTime() - Date.now();
                const antiSnipeMs = auction.antiSnipeDuration * 60 * 1000;
                if (remaining < antiSnipeMs) {
                    updateData.endTime = new Date(Date.now() + antiSnipeMs);
                }
            }

            await tx.guildAuction.update({
                where: { id: auctionId },
                data: updateData
            });
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error placing bid:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
    return listAuctions(req, context.params);
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => placeBid(r, user, context.params))(req);

