import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// POST - Cancel Auction
async function cancelAuction(req: NextRequest, user: any, params: { id: string, auctionId: string }) {
    try {
        const guildId = BigInt(params.id);
        const { auctionId } = params;

        // Permissions
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        if (!member) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

        // Get Auction
        const auction = await prisma.guildAuction.findUnique({
            where: { id: auctionId }
        });

        if (!auction || auction.guildId !== guildId) {
            return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
        }

        // Transaction
        await prisma.$transaction(async (tx) => {
            // 1. If Item is in Warehouse -> Permanently Delete
            if (auction.status === 'warehouse') {
                await tx.guildAuction.delete({
                    where: { id: auctionId }
                });
                return; // Exit transaction
            }

            // 2. Refund Current Winner if Active/Closed and has bids
            if (auction.status === 'active' || auction.status === 'closed') {
                if (auction.winnerId && Number(auction.currentBid) > 0) {
                    const amount = Number(auction.currentBid);
                    await tx.$executeRawUnsafe(
                        `UPDATE guild_members SET dkp_balance = dkp_balance + ${amount} WHERE guild_id = ${guildId} AND member_id = '${auction.winnerId}'`
                    );

                    // Log Refund
                    await tx.guildDkpLedger.create({
                        data: {
                            guildId,
                            memberId: auction.winnerId,
                            amount,
                            description: `Reembolso: Leilão Cancelado via Admin`,
                            createdBy: user.id
                        }
                    });
                }
            }

            // 3. Reset Auction to Warehouse
            await tx.guildAuction.update({
                where: { id: auctionId },
                data: {
                    status: 'warehouse',
                    startingBid: 0,
                    currentBid: 0,
                    winnerId: null,
                    startTime: null,
                    endTime: null,
                }
            });

            // 4. Delete Bids
            await tx.guildBid.deleteMany({
                where: { auctionId }
            });
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error cancelling auction:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string, auctionId: string } }) =>
    requireAuth((r: NextRequest, user: any) => cancelAuction(r, user, context.params))(req);
