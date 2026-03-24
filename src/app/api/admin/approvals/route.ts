import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';

// GET /api/admin/approvals - List all pending content
async function getPendingApprovals(req: NextRequest) {
    try {
        const [pendingAds, pendingEvents] = await Promise.all([
            prisma.marketAd.findMany({
                where: { status: 'pending' },
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
                where: { status: 'pending' },
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

export const GET = requireRole(['admin'])(getPendingApprovals);
