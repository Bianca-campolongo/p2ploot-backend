import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: any, context: { params: { id: string } }) {
    try {
        const guildId = BigInt(context.params.id);

        // Check if guild exists
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            include: {
                members: {
                    where: { memberId: user.id }
                },
                requests: {
                    where: { userId: user.id, status: 'pending' }
                }
            }
        });

        if (!guild) {
            return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
        }

        // Check if already member
        if (guild.members.length > 0) {
            return NextResponse.json({ error: 'Already a member' }, { status: 400 });
        }

        // Check if already requested and is pending
        const existingRequest = await prisma.guildRequest.findUnique({
            where: {
                guildId_userId: {
                    guildId: guildId,
                    userId: user.id
                }
            }
        });

        if (existingRequest && existingRequest.status === 'pending') {
            return NextResponse.json({ error: 'Request already pending' }, { status: 400 });
        }

        // Parse body
        const body = await req.json();
        const { characterName, customValues } = body;

        // Upsert request (create if not exists, update if exists and not pending)
        await prisma.guildRequest.upsert({
            where: {
                guildId_userId: {
                    guildId: guildId,
                    userId: user.id
                }
            },
            create: {
                guildId: guildId,
                userId: user.id,
                status: 'pending',
                characterName: characterName,
                customValues: customValues || {}
            },
            update: {
                status: 'pending',
                characterName: characterName,
                customValues: customValues || {},
                createdAt: new Date()
            }
        });

        return NextResponse.json({ message: 'Join request sent' });
    } catch (error: any) {
        console.error('Error joining guild:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = requireAuth(handler);
