import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function getAdminNotifications(req: NextRequest, user: any) {
    try {
        // Admin check: either database role OR match with environment ADMIN_EMAIL
        const adminEmail = process.env.ADMIN_EMAIL;
        const isAdmin = user.role === 'admin' || (user.email && adminEmail && user.email === adminEmail);

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized. Admin only.' }, { status: 403 });
        }

        // 1. Pending Content Approvals (MarketAds)
        const pendingAds = await prisma.marketAd.count({
            where: { status: 'pending' }
        });

        // 2. Pending Content Approvals (Events)
        const pendingEvents = await prisma.event.count({
            where: { status: 'pending' }
        });

        // 3. Pending Reports
        const pendingReports = await prisma.adReport.count({
            where: { status: 'pending' }
        });

        // 4. Pending Credit Requests
        const pendingCredits = await prisma.creditRequest.count({
            where: { status: 'pending' }
        });

        // 5. Pending Support Tickets (Open or In Progress)
        const pendingTickets = await prisma.supportTicket.count({
            where: { 
                status: {
                    in: ['open', 'in_progress']
                }
            }
        });

        return NextResponse.json({
            success: true,
            counts: {
                ads: pendingAds,
                events: pendingEvents,
                reports: pendingReports,
                credits: pendingCredits,
                tickets: pendingTickets,
                total: pendingAds + pendingEvents + pendingReports + pendingCredits + pendingTickets
            }
        });

    } catch (error: any) {
        console.error('[API] Error fetching admin notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest) => requireAuth(getAdminNotifications)(req);
