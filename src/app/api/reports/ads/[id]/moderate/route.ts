import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function moderateReport(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reportId = params.id;
    const body = await req.json();
    const { action, reason, moderatorNote } = body;

    // 1. Get the report to find ad and seller
    const report = await prisma.adReport.findUnique({
      where: { id: reportId },
      include: { 
        ad: {
          select: {
            id: true,
            userId: true
          }
        }
      }
    });

    if (!report || !report.ad) {
      return NextResponse.json({ error: 'Report or ad not found' }, { status: 404 });
    }

    const sellerId = report.ad.userId;
    const adId = report.ad.id;

    // 2. Perform actions based on selection
    if (action.includes('delete_ad')) {
      await prisma.marketAd.delete({
        where: { id: adId }
      });
    }

    if (action.includes('reset_reputation')) {
      await prisma.profile.update({
        where: { id: sellerId },
        data: { reputationScore: 0 }
      });
    }

    // 3. Mark report as resolved
    await prisma.adReport.update({
      where: { id: reportId },
      data: { 
        status: 'resolved',
        moderatorNote: moderatorNote || reason
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Moderation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) => requireAuth(moderateReport)(req, context);
