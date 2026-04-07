import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGuildManager } from '@/lib/guildAuth';
import { z } from 'zod';

const patchSchema = z.object({
    status: z.enum(['accepted', 'rejected']),
    characterName: z.string().optional(),
});

async function handler(req: NextRequest, user: any, params: { id: string; requestId: string }) {
    try {
        const guildId = BigInt(params.id);
        const requestId = params.requestId;
        const body = await req.json();
        const { status, characterName } = patchSchema.parse(body);

        // Permission check — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const request = await prisma.guildRequest.findUnique({
            where: { id: requestId },
            include: { user: true }
        });

        if (!request || request.guildId !== guildId) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        if (request.status !== 'pending') {
            return NextResponse.json({ error: 'Request already processed' }, { status: 400 });
        }

        if (status === 'accepted') {
            await prisma.$transaction(async (tx) => {
                // 1. Update request
                await tx.guildRequest.update({
                    where: { id: requestId },
                    data: { status: 'accepted' }
                });

                // 2. Create member
                await tx.guildMember.create({
                    data: {
                        guildId: guildId,
                        memberId: request.userId,
                        role: 'member',
                        characterName: request.characterName || characterName || request.user.username || 'Novo Membro',
                        customValues: request.customValues || {}
                    }
                });

                // 3. Increment guild member count
                await tx.guild.update({
                    where: { id: guildId },
                    data: { membersCount: { increment: 1 } }
                });
            });
        } else {
            await prisma.guildRequest.update({
                where: { id: requestId },
                data: { status: 'rejected' }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error processing guild request:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const PATCH = (req: NextRequest, context: { params: { id: string; requestId: string } }) =>
    requireAuth((r: NextRequest, user: any) => handler(r, user, context.params))(req);
