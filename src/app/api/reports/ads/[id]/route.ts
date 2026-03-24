import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const updateSchema = z.object({
    status: z.enum(['pending', 'resolved', 'dismissed', 'rejected']),
    moderatorNote: z.string().optional()
});

async function updateReport(req: NextRequest, user: any, params: { id: string }) {
    try {
        const reportId = params.id;
        const body = await req.json();
        const data = updateSchema.parse(body);

        const report = await prisma.adReport.update({
            where: { id: reportId },
            data: { 
                status: data.status,
                moderatorNote: data.moderatorNote
            }
        });

        return NextResponse.json({ success: true, status: report.status });
    } catch (error) {
        console.error('Error updating report:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const PUT = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateReport(r, user, context.params))(req);
