import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

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

        // Serialize BigInt if necessary (MarketAd has BigInt ID)
        const serializedAds = pendingAds.map(ad => ({
            ...ad,
            id: ad.id.toString(),
            price: ad.price ? Number(ad.price) : null,
            type: 'market_ad'
        }));

        const serializedEvents = pendingEvents.map(event => ({
            ...event,
            type: 'event'
        }));

        return NextResponse.json({
            marketAds: serializedAds,
            events: serializedEvents
        });
    } catch (error: any) {
        console.error('[Admin Approvals] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const GET = requireRole(['admin'])(getPendingApprovals);
