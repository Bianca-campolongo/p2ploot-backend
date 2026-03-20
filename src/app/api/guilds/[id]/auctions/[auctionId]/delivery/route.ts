import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
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

        // Check user is member of guild with manage permissions
        const member = await prisma.guildMember.findFirst({
            where: {
                guildId: BigInt(guildId),
                memberId: user.id
            }
        });

        // Also check if user is the guild owner
        const guild = await prisma.guild.findUnique({
            where: { id: BigInt(guildId) },
            select: { ownerId: true }
        });

        const isOwner = guild?.ownerId === user.id;

        if (!isOwner && (!member || !['owner', 'officer'].includes(member.role))) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        // Update the delivered flag (not the status)
        const auction = await prisma.guildAuction.update({
            where: { id: auctionId },
            data: { delivered }
        });

        return NextResponse.json({
            success: true,
            auction: {
                id: auction.id.toString(),
                delivered: auction.delivered
            }
        });

    } catch (error: any) {
        console.error('[API] Error toggling delivery:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export const PATCH = (req: NextRequest) => requireAuth(toggleDelivery)(req);
