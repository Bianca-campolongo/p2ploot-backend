import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const publishSchema = z.object({
    auctionIds: z.array(z.string()),
    startPrice: z.number().min(0),
    minInc: z.number().min(0),
    antiSnipe: z.number().int().min(0),
    startTime: z.string().optional(), // ISO string
    startNow: z.boolean().optional(),
    durationMinutes: z.number().positive(),
    requirements: z.any().optional()
});

async function publishAuctions(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const data = publishSchema.parse(body);

        // Permissions
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        if (!member) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

        const now = new Date();
        let startAt = now;
        let status = 'active';

        if (!data.startNow && data.startTime) {
            startAt = new Date(data.startTime);
            if (startAt > now) {
                status = 'upcoming';
            }
        }

        const endAt = new Date(startAt.getTime() + data.durationMinutes * 60 * 1000);

        // Update all auctions
        await prisma.guildAuction.updateMany({
            where: {
                id: { in: data.auctionIds },
                guildId: guildId // Security check
            },
            data: {
                status: status,
                startingBid: data.startPrice,
                currentBid: data.startPrice,
                minBidIncrement: data.minInc,
                antiSnipeDuration: data.antiSnipe,
                startTime: startAt,
                endTime: endAt,
                requirements: data.requirements ?? {},
            }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error publishing:', error);
        return NextResponse.json({ error: error.message || error.toString() || 'Error publishing', details: error }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => publishAuctions(r, user, context.params))(req);
