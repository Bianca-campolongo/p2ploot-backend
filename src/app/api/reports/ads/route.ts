import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

// POST /api/reports/ads - Create ad report
const reportSchema = z.object({
    adId: z.string().min(1),
    reason: z.string().min(1),
    details: z.string().optional()
});

async function createReport(req: NextRequest, user: any) {
    try {
        const body = await req.json();
        const data = reportSchema.parse(body);
        const adId = BigInt(data.adId);

        // Check if ad exists
        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            select: { id: true }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        const report = await prisma.adReport.create({
            data: {
                adId,
                reporterId: user.id,
                reason: data.reason,
                details: data.details
            }
        });

        return NextResponse.json({
            success: true,
            id: report.id
        });
    } catch (error: any) {
        console.error('Error creating report:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/reports/ads - List reports (Admin)
async function getReports(req: NextRequest, user: any) {
    try {
        // TODO: specific admin check. For now, authenticated users.
        const reports = await prisma.adReport.findMany({
            include: {
                ad: {
                    select: {
                        id: true,
                        title: true,
                        price: true,
                        imageUrl: true,
                        userId: true
                    }
                },
                reporter: {
                    select: { id: true, username: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(deepSerialize(reports));
    } catch (error) {
        console.error('Error fetching reports:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(createReport)(req);
export const GET = (req: NextRequest) => requireAuth(getReports)(req);
