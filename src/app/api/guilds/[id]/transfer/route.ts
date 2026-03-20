import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const transferSchema = z.object({
    newOwnerId: z.string().uuid(),
});

async function handler(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const { newOwnerId } = transferSchema.parse(body);

        // Permission check: Must be current owner
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        if (!guild) {
            return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
        }

        const isOwner = (guild.ownerId === user.id || guild.ownerAddress === user.id);
        if (!isOwner) {
            return NextResponse.json({ error: 'Only the current owner can transfer leadership' }, { status: 403 });
        }

        if (user.id === newOwnerId) {
            return NextResponse.json({ error: 'You are already the owner' }, { status: 400 });
        }

        // Check if new owner is a member
        const newOwnerMember = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: newOwnerId } },
            include: { member: true }
        });

        if (!newOwnerMember) {
            return NextResponse.json({ error: 'Target user must be a member of the guild' }, { status: 400 });
        }

        // Transfer leadership in transaction
        await prisma.$transaction(async (tx) => {
            // 1. Update guild owner
            await tx.guild.update({
                where: { id: guildId },
                data: {
                    ownerId: newOwnerId,
                    ownerAddress: newOwnerMember.member.walletAddress || newOwnerId
                }
            });

            // 2. Demote old owner (optional, or keep as admin)
            await tx.guildMember.update({
                where: { guildId_memberId: { guildId, memberId: user.id } },
                data: { role: 'admin' }
            });

            // 3. Promote new owner
            await tx.guildMember.update({
                where: { guildId_memberId: { guildId, memberId: newOwnerId } },
                data: { role: 'owner' }
            });
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error transferring leadership:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => handler(r, user, context.params))(req);
