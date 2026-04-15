import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// POST - Create Giveaway and Roll Winner
const giveawaySchema = z.object({
    prizeDescription: z.string().min(1),
    filterDescription: z.string().optional(),
    eligibleMemberIds: z.array(z.string().uuid()).optional().default([]),
    manualNames: z.array(z.string()).optional().default([]), // New: Manual names for list-mode
    warehouseItemId: z.string().uuid().optional().nullable(),
    winnerId: z.string().uuid().optional(),
});

async function createGiveaway(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const data = giveawaySchema.parse(body);

        if (data.eligibleMemberIds.length === 0 && data.manualNames.length === 0) {
            return NextResponse.json({ error: 'No eligible members or names' }, { status: 400 });
        }

        // Check permissions
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isAdmin = member?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        let finalWinnerId: string | null = null;
        let finalWinnerName = 'Desconhecido';
        let metadata: any = {};

        // 1. Logic for Manual Names List
        if (data.manualNames.length > 0 && data.eligibleMemberIds.length === 0) {
            const winnerIdx = Math.floor(Math.random() * data.manualNames.length);
            finalWinnerName = data.manualNames[winnerIdx];
            metadata = { manualWinnerName: finalWinnerName, isManualList: true };
        } 
        // 2. Logic for Registered Members
        else {
            finalWinnerId = data.winnerId || null;
            if (!finalWinnerId || !data.eligibleMemberIds.includes(finalWinnerId)) {
                const winnerIdx = Math.floor(Math.random() * data.eligibleMemberIds.length);
                finalWinnerId = data.eligibleMemberIds[winnerIdx];
            }

            // Get winner details
            const winnerMember = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: finalWinnerId } },
                include: { member: { select: { username: true } } }
            });
            finalWinnerName = winnerMember?.characterName || winnerMember?.member?.username || 'Unknown';
        }

        // Create giveaway record
        const giveaway = await prisma.guildGiveaway.create({
            data: {
                guildId,
                title: data.prizeDescription,
                description: data.filterDescription,
                winnerId: finalWinnerId,
                filters: metadata,
                status: 'completed',
                completedAt: new Date()
            }
        });

        // If from warehouse, mark item as used
        if (data.warehouseItemId && finalWinnerId) {
            await prisma.guildAuction.update({
                where: { id: data.warehouseItemId },
                data: {
                    status: 'closed',
                    winnerId: finalWinnerId,
                    endTime: new Date(),
                    requirements: { is_giveaway: true }
                }
            });
        }

        return NextResponse.json({
            success: true,
            giveaway: {
                id: giveaway.id,
                winnerId: finalWinnerId,
                winnerName: finalWinnerName,
                prize: data.prizeDescription
            }
        });

    } catch (error: any) {
        console.error('Error creating giveaway:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET - List Giveaway History
async function listGiveaways(req: NextRequest, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);

        const giveaways = await prisma.guildGiveaway.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        // Fetch winner details
        const winnerIds = Array.from(new Set(giveaways.map(g => g.winnerId).filter(Boolean))) as string[];
        const members = await prisma.guildMember.findMany({
            where: { guildId, memberId: { in: winnerIds } },
            include: { member: { select: { username: true } } }
        });
        const memberMap = new Map(members.map(m => [m.memberId, m]));

        const serialized = giveaways.map((g: any) => {
            const member = g.winnerId ? memberMap.get(g.winnerId) : null;
            let name = member?.characterName || member?.member?.username;
            
            // If no registered member, check the manual metadata
            if (!name && g.filters && typeof g.filters === 'object') {
                name = (g.filters as any).manualWinnerName;
            }

            if (!name) name = 'Desconhecido';

            return {
                ...g,
                guildId: g.guildId.toString(),
                prizeDescription: g.title,
                filterDescription: g.description,
                winnerName: name,
                winner_name: name
            };
        });

        return NextResponse.json({ giveaways: serialized });
    } catch (error) {
        console.error('Error fetching giveaways:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
    return listGiveaways(req, context.params);
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => createGiveaway(r, user, context.params))(req);
