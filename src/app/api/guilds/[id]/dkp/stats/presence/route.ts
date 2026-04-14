import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

/**
 * GET - Calculate presence statistics for guild members
 * Simple grouping by exact timestamp and description (identifies bulk batches)
 */
async function getPresenceStats(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);

        const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true, ownerAddress: true } });
        if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
        
        const callerIsOwner = guild.ownerId === user.id || guild.ownerAddress === user.id;
        if (!callerIsOwner) {
            const member = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: user.id } }
            });
            if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const period = req.nextUrl.searchParams.get('period') || 'all';
        let createdAtFilter = undefined;
        
        const now = new Date();
        if (period === 'week') {
            createdAtFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        } else if (period === 'month') {
            createdAtFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        } else if (period === 'quarter') {
            createdAtFilter = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
        }

        const whereClause: any = {
            guildId,
            amount: { gt: 0 },
            NOT: [
                { description: { contains: 'Decay' } },
                { description: { contains: '[Ignorar Presença]' } }
            ]
        };

        if (createdAtFilter) {
            whereClause.createdAt = createdAtFilter;
        }

        const ledgerEntries = await prisma.guildDkpLedger.findMany({
            where: whereClause,
            select: {
                id: true,
                memberId: true,
                description: true,
                createdAt: true,
                createdBy: true,
                eventTypeId: true
            }
        });

        if (ledgerEntries.length === 0) {
            return NextResponse.json({ totalEvents: 0, memberStats: {} });
        }

        const events = new Map<string, Set<string>>();

        ledgerEntries.forEach(entry => {
            // Group by description + createdBy + Minute
            // This ensures manual additions using the exact same time join the batch
            const timeKey = entry.createdAt.toISOString().substring(0, 16); 
            const eventKey = `${entry.description || 'no-desc'}|${entry.createdBy || 'system'}|${timeKey}`;
            
            if (!events.has(eventKey)) {
                events.set(eventKey, new Set());
            }
            events.get(eventKey)?.add(entry.memberId);
        });

        const totalEvents = events.size;
        const memberPresenceCount: Record<string, number> = {};

        events.forEach((memberIds) => {
            memberIds.forEach(memberId => {
                memberPresenceCount[memberId] = (memberPresenceCount[memberId] || 0) + 1;
            });
        });

        return NextResponse.json({
            totalEvents,
            memberStats: memberPresenceCount
        });

    } catch (error) {
        console.error('Error calculating presence stats:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => getPresenceStats(r, user, context.params))(req);
