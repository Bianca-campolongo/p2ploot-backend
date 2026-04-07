import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGuildManager } from '@/lib/guildAuth';
import { z } from 'zod';

const deliverySchema = z.object({
    delivered: z.boolean()
});

async function toggleDelivery(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        // URL: /api/guilds/[id]/auctions/[auctionId]/delivery
        const guildIdIndex = pathParts.indexOf('guilds') + 1;
        const auctionIdIndex = pathParts.indexOf('auctions') + 1;

        const guildId = pathParts[guildIdIndex];
        const auctionId = pathParts[auctionIdIndex];

        if (!guildId || !auctionId) {
            return NextResponse.json({ error: 'Guild ID and Auction ID required' }, { status: 400 });
        }

        const body = await req.json();
        const validation = deliverySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const { delivered } = validation.data;

        // Check permissions — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(BigInt(guildId), user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        // Verify the auction belongs to the specified guild
        const auction = await prisma.guildAuction.findUnique({
            where: { id: auctionId },
            select: { id: true, guildId: true }
        });

        if (!auction || auction.guildId.toString() !== guildId) {
            return NextResponse.json({ error: 'Auction not found in this guild' }, { status: 404 });
        }

        // Update the delivered flag (not the status)
        const updated = await prisma.guildAuction.update({
            where: { id: auctionId },
            data: { delivered }
        });

        return NextResponse.json({
            success: true,
            auction: {
                id: updated.id.toString(),
                delivered: updated.delivered
            }
        });

    } catch (error: any) {
        console.error('[API] Error toggling delivery:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const PATCH = (req: NextRequest) => requireAuth(toggleDelivery)(req);
