import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// DELETE - Delete a closed auction (History cleanup)
async function deleteAuctionHistory(req: NextRequest, user: any, params: { id: string, auctionId: string }) {
    try {
        const guildId = BigInt(params.id);
        const auctionId = params.auctionId;

        // Check permissions (Owner/Admin)
        const callingMember = await prisma.guildMember.findUnique({
            where: {
                guildId_memberId: {
                    guildId,
                    memberId: user.id
                }
            }
        });

        const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true, ownerAddress: true } });
        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);

        if (!callingMember && !isOwner) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (callingMember && !['owner', 'admin'].includes(callingMember.role) && !isOwner) {
            return NextResponse.json({ error: 'Unauthorized. Only admins can delete auction history.' }, { status: 403 });
        }

        // Get auction
        const auction = await prisma.guildAuction.findUnique({
            where: { id: auctionId }
        });

        if (!auction || auction.guildId !== guildId) {
            return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
        }

        if (auction.status !== 'closed') {
            return NextResponse.json({ error: 'Only closed auctions can be deleted from history' }, { status: 400 });
        }

        // Delete all associated bids first, then delete the auction
        await prisma.$transaction(async (tx) => {
            await tx.guildBid.deleteMany({
                where: { auctionId }
            });

            await tx.guildAuction.delete({
                where: { id: auctionId }
            });
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error deleting auction history:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const DELETE = (req: NextRequest, context: { params: { id: string, auctionId: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteAuctionHistory(r, user, context.params))(req);
