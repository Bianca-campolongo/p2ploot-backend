import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// PATCH /api/admin/moderators/[id] — atualiza painéis e jogos de um moderador
async function updateModerator(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { panels, games } = body;

    if (!Array.isArray(panels) || panels.length === 0) {
      return NextResponse.json({ error: 'At least one panel must be selected' }, { status: 400 });
    }
    if (!Array.isArray(games) || games.length === 0) {
      return NextResponse.json({ error: 'At least one game must be selected' }, { status: 400 });
    }

    // Verifica se o alvo é realmente um moderador
    const target = await prisma.profile.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target || target.role !== 'moderator') {
      return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
    }

    await prisma.moderatorPermission.upsert({
      where: { userId: id },
      create: {
        userId: id,
        panels: JSON.stringify(panels),
        games: JSON.stringify(games),
      },
      update: {
        panels: JSON.stringify(panels),
        games: JSON.stringify(games),
      },
    });

    console.log(`[Admin Moderators] Permissions updated for user ${id} by admin ${user.id}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Moderators] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/admin/moderators/[id] — remove cargo de moderador
// Não deleta dados — apenas reverte role para 'user' e apaga a permissão
async function removeModerator(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const target = await prisma.profile.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target || target.role !== 'moderator') {
      return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
    }

    // Reverte role e remove permissões atomicamente
    await prisma.$transaction([
      prisma.profile.update({
        where: { id },
        data: { role: 'user' },
      }),
      prisma.moderatorPermission.deleteMany({
        where: { userId: id },
      }),
    ]);

    console.log(`[Admin Moderators] User ${id} demoted from moderator by admin ${user.id}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Moderators] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const PATCH = (req: NextRequest, context: { params: { id: string } }) =>
  requireAuth(updateModerator)(req, context);

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
  requireAuth(removeModerator)(req, context);
