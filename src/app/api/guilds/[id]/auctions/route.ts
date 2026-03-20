import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

// GET - List Auctions for a guild
async function listAuctions(req: NextRequest, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status'); // 'warehouse', 'active', 'upcoming', 'closed'

        const where: any = { guildId };
        if (status) {
            where.status = status;
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

        const auctions = await prisma.guildAuction.findMany({
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
                    take: 10,
                    include: {
                        bidder: {
                            select: { id: true, username: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(deepSerialize({ auctions }));
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
            // Verify pilot permission
            const pilotShare = await prisma.guildCharacterShare.findFirst({
                where: {
                    guildMemberId: actingMemberId, // The owner
                    sharedWithUserId: user.id,     // The pilot
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

        if (!auction || auction.guildId !== guildId) {
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
                await tx.$executeRawUnsafe(
                    `UPDATE guild_members SET dkp_balance = dkp_balance + ${prevBid} WHERE guild_id = ${guildId} AND member_id = '${auction.winnerId}'`
                );

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

            // 2. Deduct from bidder using raw SQL
            await tx.$executeRawUnsafe(
                `UPDATE guild_members SET dkp_balance = dkp_balance - ${amount} WHERE guild_id = ${guildId} AND member_id = '${bidderId}'`
            );

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

