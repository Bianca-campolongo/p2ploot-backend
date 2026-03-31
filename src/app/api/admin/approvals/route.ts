import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePanel, getModeratorGameFilter } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';

// GET /api/admin/approvals - List all pending content (filtered by moderator permission)
async function getPendingApprovals(req: NextRequest, user: any) {
    try {
        const gameFilter = getModeratorGameFilter(user);

        const [pendingAds, pendingEvents] = await Promise.all([
            prisma.marketAd.findMany({
                where: { 
                    status: 'pending',
                    game: gameFilter // If admin/all, this is undefined (no filter). If restricted, { in: [...] }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatarUrl: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.event.findMany({
                where: { 
                    status: 'pending',
                    game: gameFilter
                },
                include: {
                    organizer: {
                        select: {
                            id: true,
                            username: true,
                            avatarUrl: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })
        ]);

        return NextResponse.json(deepSerialize({
            marketAds: pendingAds.map(ad => ({ ...ad, type: 'market_ad' })),
            events: pendingEvents.map(event => ({ ...event, type: 'event' }))
        }));
    } catch (error: any) {
        console.error('[Admin Approvals] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const GET = requirePanel('approvals')(getPendingApprovals);
