import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// POST - Start Auction Now
async function startAuction(req: NextRequest, user: any, params: { id: string, auctionId: string }) {
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

        const now = new Date(); // Start time

        // Calculate new End Time based on duration? 
        // Logic from frontend was just `start_auction_now` RPC.
        // If it was 'upcoming', it had a duration (endTime - startTime). We should preserve that duration.
        // If it was 'warehouse', we need a default duration? Or require it to be upcoming?
        // Frontend `handleStartAuction` calls `rpc('start_auction_now')`.
        // Let's assume preservation of duration if dates set, otherwise default 24h?

        let newEndTime = auction.endTime ? new Date(auction.endTime) : new Date(now.getTime() + 24 * 60 * 60 * 1000);

        if (auction.startTime && auction.endTime) {
            // Shift the window
            const originalStart = new Date(auction.startTime);
            const originalEnd = new Date(auction.endTime);
            const duration = originalEnd.getTime() - originalStart.getTime();
            if (duration > 0) {
                newEndTime = new Date(now.getTime() + duration);
            }
        }

        await prisma.guildAuction.update({
            where: { id: auctionId },
            data: {
                status: 'active',
                startTime: now,
                endTime: newEndTime
            }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error starting auction:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string, auctionId: string } }) =>
    requireAuth((r: NextRequest, user: any) => startAuction(r, user, context.params))(req);
