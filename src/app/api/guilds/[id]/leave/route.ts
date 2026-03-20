import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: any) {
    try {
        // Extract guild ID from URL
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const guildIdStr = pathParts[pathParts.indexOf('guilds') + 1];
        const guildId = BigInt(guildIdStr);

        // Check if guild exists
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true }
        });

        if (!guild) {
            return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
        }

        // Prevent owner from leaving
        if (guild.ownerId === user.id) {
            return NextResponse.json({
                error: 'Owner cannot leave the guild. Transfer leadership or delete the guild first.'
            }, { status: 400 });
        }

        // Delete membership
        const deleted = await prisma.guildMember.deleteMany({
            where: {
                guildId: guildId,
                memberId: user.id
            }
        });

        if (deleted.count === 0) {
            return NextResponse.json({ error: 'Not a member of this guild' }, { status: 400 });
        }

        return NextResponse.json({ message: 'Successfully left the guild' });
    } catch (error) {
        console.error('Error leaving guild:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = requireAuth(handler);
