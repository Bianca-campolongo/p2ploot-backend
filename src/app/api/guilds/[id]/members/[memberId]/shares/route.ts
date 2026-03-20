import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// GET - List shares for a member
async function listShares(req: NextRequest, params: { id: string; memberId: string }) {
    try {
        const guildId = BigInt(params.id);
        const memberId = params.memberId;

        // Verify member exists
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId } },
            select: { id: true }
        });

        if (!member) {
            return NextResponse.json({ error: 'Member not found' }, { status: 404 });
        }

        // guildMemberId in shares table refers to Profile.id (memberId), not GuildMember.id
        const shares = await prisma.guildCharacterShare.findMany({
            where: { guildMemberId: memberId },
            include: {
                pilot: {
                    select: { id: true, username: true, email: true }
                }
            }
        });

        const serializedShares = shares.map(share => ({
            ...share,
            guildId: share.guildId ? share.guildId.toString() : null
        }));

        return NextResponse.json({ shares: serializedShares });
    } catch (error) {
        console.error('Error fetching shares:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Add share
const shareSchema = z.object({
    email: z.string().email(),
});

async function addShare(req: NextRequest, user: any, params: { id: string; memberId: string }) {
    try {
        const guildId = BigInt(params.id);
        const memberId = params.memberId;  // This is the Profile.id of the character owner
        const body = await req.json();
        const { email } = shareSchema.parse(body);

        // Only owner or self can share
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });
        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isSelf = user.id === memberId;

        if (!isOwner && !isSelf) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Verify the member exists in this guild
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId } },
            select: { id: true, memberId: true }
        });

        if (!member) {
            return NextResponse.json({ error: 'Member not found' }, { status: 404 });
        }

        // Find target user by email
        const targetUser = await prisma.profile.findUnique({
            where: { email }
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found with this email' }, { status: 404 });
        }

        if (targetUser.id === memberId) {
            return NextResponse.json({ error: 'Cannot share with yourself' }, { status: 400 });
        }

        // Check if already shared - use Profile.id (memberId), not GuildMember.id
        const existing = await prisma.guildCharacterShare.findFirst({
            where: { guildMemberId: memberId, sharedWithUserId: targetUser.id }
        });

        if (existing) {
            return NextResponse.json({ error: 'Already shared with this user' }, { status: 409 });
        }

        // Create share - guildMemberId is Profile.id according to schema relation
        const share = await prisma.guildCharacterShare.create({
            data: {
                guildMemberId: memberId,  // This is the Profile.id of the owner
                sharedWithUserId: targetUser.id,
                guildId: guildId,  // Required for leader lookup
                status: 'pending'  // Requires leader approval
            }
        });

        const serializedShare = {
            ...share,
            guildId: share.guildId ? share.guildId.toString() : null
        };

        return NextResponse.json({ success: true, share: serializedShare });
    } catch (error: any) {
        console.error('Error adding share:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Remove share
async function removeShare(req: NextRequest, user: any, params: { id: string; memberId: string }) {
    try {
        const guildId = BigInt(params.id);
        const memberId = params.memberId;
        const { searchParams } = new URL(req.url);
        const shareId = searchParams.get('shareId');

        if (!shareId) {
            return NextResponse.json({ error: 'Share ID required' }, { status: 400 });
        }

        // Permission check
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });
        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isSelf = user.id === memberId;

        if (!isOwner && !isSelf) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.guildCharacterShare.delete({
            where: { id: shareId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing share:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest, context: { params: { id: string; memberId: string } }) {
    return listShares(req, context.params);
}

export const POST = (req: NextRequest, context: { params: { id: string; memberId: string } }) =>
    requireAuth((r: NextRequest, user: any) => addShare(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string; memberId: string } }) =>
    requireAuth((r: NextRequest, user: any) => removeShare(r, user, context.params))(req);
