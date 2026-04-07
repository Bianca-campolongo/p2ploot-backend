import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGuildManager } from '@/lib/guildAuth';
import { z } from 'zod';

// Schema for Distribution
const distributeSchema = z.object({
    entries: z.array(z.object({
        memberId: z.string().uuid(),
        amount: z.number().refine(n => !isNaN(n), { message: "Amount must be a valid number" }),
        eventTypeId: z.string().uuid().optional().nullable().or(z.literal('')),
        description: z.string(),
    })),
});

// GET - Get DKP History (Ledger)
async function getHistory(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const memberId = searchParams.get('memberId');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Verify caller is a member or owner of the guild
        const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true, ownerAddress: true } });
        const callerIsOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        if (!callerIsOwner) {
            const callerMember = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: user.id } }
            });
            if (!callerMember) {
                return NextResponse.json({ error: 'Forbidden: not a guild member' }, { status: 403 });
            }
        }

        const where: any = { guildId };
        if (memberId) {
            where.memberId = memberId;
        }

        const [history, total] = await Promise.all([
            prisma.guildDkpLedger.findMany({
                where,
                include: {
                    member: {
                        select: {
                            id: true,
                            username: true,
                            avatarUrl: true,
                        }
                    },
                    eventType: true
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.guildDkpLedger.count({ where })
        ]);

        const serialized = history.map((entry: any) => ({
            ...entry,
            id: entry.id,
            guildId: entry.guildId.toString(),
            eventType: entry.eventType ? {
                ...entry.eventType,
                name: entry.eventType.eventName, // Map for frontend
                guildId: entry.eventType.guildId.toString()
            } : null
        }));

        return NextResponse.json({
            history: serialized,
            total,
            limit,
            offset
        });
    } catch (error) {
        console.error('Error fetching DKP history:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Distribute DKP
async function distribute(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();

        const { entries } = distributeSchema.parse(body);

        if (entries.length === 0) {
            return NextResponse.json({ success: true, count: 0 });
        }

        // Check permissions (Owner/Admin) — also works for pilots with admin permissions
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Transaction: Insert Ledger + Update Balances
        await prisma.$transaction(async (tx) => {
            // 1. Create Ledger Entries
            await tx.guildDkpLedger.createMany({
                data: entries.map(e => ({
                    guildId,
                    memberId: e.memberId,
                    eventTypeId: e.eventTypeId === '' ? null : e.eventTypeId,
                    amount: e.amount,
                    description: e.description,
                    createdBy: user.id
                }))
            });

            // 2. Update Member Balances using parameterized queries to prevent SQL injection
            for (const entry of entries) {
                await tx.$executeRaw`UPDATE guild_members SET dkp_balance = dkp_balance + ${entry.amount} WHERE guild_id = ${guildId} AND member_id = ${entry.memberId}`;
            }
        });

        return NextResponse.json({ success: true, count: entries.length });

    } catch (error: any) {
        console.error('Error distributing DKP:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data: ' + error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => getHistory(r, user, context.params))(req);

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => distribute(r, user, context.params))(req);
