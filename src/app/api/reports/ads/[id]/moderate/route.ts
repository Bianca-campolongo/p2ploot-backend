import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function moderateReport(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    // Permitir admin OU moderador com painel 'reports'
    if (user.role !== 'admin' && !(user.role === 'moderator' && user.panels?.includes('reports'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
            userId: true,
            game: true
          }
        }
      }
    });

    if (!report || !report.ad) {
      return NextResponse.json({ error: 'Report or ad not found' }, { status: 404 });
    }

    // Check moderator game permissions
    if (user.role === 'moderator' && !user.games?.includes('all') && report.ad.game && !user.games?.includes(report.ad.game)) {
        return NextResponse.json({ error: 'Forbidden: You do not have permission for this game' }, { status: 403 });
    }

    const sellerId = report.ad.userId;
    const adId = report.ad.id;

    // 2. Perform actions based on selection

    // IMPORTANTE: Marcar report como resolvido ANTES de deletar o anúncio,
    // pois o delete do anúncio faz cascade delete no report (pelo schema Prisma).
    await prisma.adReport.update({
      where: { id: reportId },
      data: { 
        status: 'resolved',
        moderatorNote: moderatorNote || reason
      }
    });

    if (action.includes('reset_reputation')) {
      await prisma.profile.update({
        where: { id: sellerId },
        data: { reputationScore: 0 }
      });
    }

    if (action.includes('ban_user')) {
      const reason = body.reason || 'Violação dos Termos de Uso';
      await prisma.profile.update({
        where: { id: sellerId },
        data: {
          isBanned: true,
          banReason: reason,
          bannedAt: new Date(),
        },
      });
      console.log(`[Moderation] User ${sellerId} banned. Reason: ${reason}`);
    }

    if (action.includes('delete_ad')) {
      await prisma.marketAd.delete({
        where: { id: adId }
      });
    }


    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Moderation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) => requireAuth(moderateReport)(req, context);
