import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const actionSchema = z.object({
    action: z.enum(['approve', 'reject']),
});

// PATCH - Approve or reject a pilot share (leader only)
async function handleAction(req: NextRequest, user: any, params: { id: string; shareId: string }) {
    try {
        const guildId = BigInt(params.id);
        const shareId = params.shareId;
        const body = await req.json();
        const { action } = actionSchema.parse(body);

        // Check if user is guild owner
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        if (!guild) {
            return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
        }

        const callingMember = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        const isOwner = guild.ownerId === user.id || guild.ownerAddress === user.id;
        const isAdmin = callingMember?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: 'Only guild leader and admins can approve pilots' }, { status: 403 });
        }

        // Find the share
        const share = await prisma.guildCharacterShare.findUnique({
            where: { id: shareId },
            include: {
                pilot: { select: { username: true } },
                owner: { select: { username: true } }
            }
        });

        if (!share) {
            return NextResponse.json({ error: 'Share not found' }, { status: 404 });
        }

        if (share.guildId?.toString() !== guildId.toString()) {
            return NextResponse.json({ error: 'Share not in this guild' }, { status: 400 });
        }

        if (action === 'approve') {
            await prisma.guildCharacterShare.update({
                where: { id: shareId },
                data: {
                    status: 'approved',
                    approvedAt: new Date()
                }
            });

            return NextResponse.json({
                success: true,
                message: `Piloto ${share.pilot.username} aprovado para personagem de ${share.owner.username}`
            });
        } else {
            // Reject = delete the share
            await prisma.guildCharacterShare.delete({
                where: { id: shareId }
            });

            return NextResponse.json({
                success: true,
                message: `Piloto ${share.pilot.username} rejeitado`
            });
        }
    } catch (error: any) {
        console.error('Error handling pilot action:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const PATCH = (req: NextRequest, context: { params: { id: string; shareId: string } }) =>
    requireAuth((r: NextRequest, user: any) => handleAction(r, user, context.params))(req);
