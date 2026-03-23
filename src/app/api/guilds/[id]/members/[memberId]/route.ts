import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// PUT - Update member profile
const updateSchema = z.object({
    characterName: z.string().optional(),
    customValues: z.record(z.any()).optional(),
    role: z.enum(['member', 'admin', 'premium']).optional(),
});

async function updateMember(req: NextRequest, user: any, params: { id: string; memberId: string }) {
    try {
        const guildId = BigInt(params.id);
        const targetMemberId = params.memberId;
        const body = await req.json();
        const data = updateSchema.parse(body);

        // Permission check: Owner, Admin, or Self
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });
        const callingMember = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });

        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isAdmin = callingMember?.role === 'admin';
        const isSelf = user.id === targetMemberId;

        let isPilot = false;
        if (!isOwner && !isAdmin && !isSelf) {
            // Check if user is an approved pilot for targetMemberId
            const pilotShare = await prisma.guildCharacterShare.findFirst({
                where: {
                    guildMemberId: targetMemberId, // The member being edited
                    sharedWithUserId: user.id,     // The pilot trying to edit
                    guildId: guildId,
                    status: 'approved'
                }
            });
            if (pilotShare) {
                isPilot = true;
            }
        }

        // Role changes require owner
        if (data.role && !isOwner) {
            return NextResponse.json({ error: 'Only owner can change roles' }, { status: 403 });
        }

        // Profile edits require owner/admin/self/pilot
        if (!isOwner && !isAdmin && !isSelf && !isPilot) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const updateData: any = {};
        if (data.characterName !== undefined) updateData.characterName = data.characterName;
        if (data.customValues !== undefined) updateData.customValues = data.customValues;
        if (data.role !== undefined) updateData.role = data.role;

        await prisma.guildMember.update({
            where: { guildId_memberId: { guildId, memberId: targetMemberId } },
            data: updateData
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating member:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Kick member
async function kickMember(req: NextRequest, user: any, params: { id: string; memberId: string }) {
    try {
        const guildId = BigInt(params.id);
        const targetMemberId = params.memberId;

        // Only owner or admin can kick (admin cannot kick other admins/owners)
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        const callingMember = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });

        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isAdmin = callingMember?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: 'Only owner and admins can kick members' }, { status: 403 });
        }

        if (isAdmin && !isOwner) {
            const targetMember = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: targetMemberId } }
            });
            if (targetMember?.role === 'admin' || targetMember?.role === 'owner' || guild?.ownerId === targetMemberId) {
                return NextResponse.json({ error: 'Admins cannot kick owners or other admins' }, { status: 403 });
            }
        }

        // Can't kick self
        if (user.id === targetMemberId) {
            return NextResponse.json({ error: 'Cannot kick yourself' }, { status: 400 });
        }

        await prisma.guildMember.delete({
            where: { guildId_memberId: { guildId, memberId: targetMemberId } }
        });

        // Update member count
        await prisma.guild.update({
            where: { id: guildId },
            data: { membersCount: { decrement: 1 } }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error kicking member:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const PUT = (req: NextRequest, context: { params: { id: string; memberId: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateMember(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string; memberId: string } }) =>
    requireAuth((r: NextRequest, user: any) => kickMember(r, user, context.params))(req);
