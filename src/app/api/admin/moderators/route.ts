import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/moderators — lista todos os moderadores com suas permissões
async function getModerators(req: NextRequest, user: any) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const moderators = await prisma.profile.findMany({
      where: { role: 'moderator' },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        avatarUrl: true,
        moderatorPermission: {
          select: {
            id: true,
            panels: true,
            games: true,
            createdAt: true,
          },
        },
      },
      orderBy: { username: 'asc' },
    });

    return NextResponse.json(moderators);
  } catch (error: any) {
    console.error('[Admin Moderators] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/moderators — promove usuário a moderador
// Body: { emailOrDiscordId: string, panels: string[], games: string[] }
async function addModerator(req: NextRequest, user: any) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { emailOrDiscordId, panels, games } = body;

    if (!emailOrDiscordId?.trim()) {
      return NextResponse.json({ error: 'emailOrDiscordId is required' }, { status: 400 });
    }
    if (!Array.isArray(panels) || panels.length === 0) {
      return NextResponse.json({ error: 'At least one panel must be selected' }, { status: 400 });
    }
    if (!Array.isArray(games) || games.length === 0) {
      return NextResponse.json({ error: 'At least one game must be selected' }, { status: 400 });
    }

    const search = emailOrDiscordId.trim();

    // Busca por e-mail exato OU Discord ID exato
    const target = await prisma.profile.findFirst({
      where: {
        OR: [
          { email: search },
          { discordId: search },
        ],
        NOT: { role: 'admin' },
      },
      select: { id: true, username: true, email: true, role: true, isBanned: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado. Use o e-mail ou Discord ID exatos.' }, { status: 404 });
    }

    if (target.isBanned) {
      return NextResponse.json({ error: 'Não é possível promover um usuário banido.' }, { status: 400 });
    }

    // Promove para moderador e cria/atualiza permissões atomicamente
    await prisma.$transaction([
      prisma.profile.update({
        where: { id: target.id },
        data: { role: 'moderator' },
      }),
      prisma.moderatorPermission.upsert({
        where: { userId: target.id },
        create: {
          userId: target.id,
          panels: JSON.stringify(panels),
          games: JSON.stringify(games),
        },
        update: {
          panels: JSON.stringify(panels),
          games: JSON.stringify(games),
        },
      }),
    ]);

    console.log(`[Admin Moderators] User ${target.id} promoted to moderator by admin ${user.id}`);

    return NextResponse.json({ success: true, userId: target.id, username: target.username });
  } catch (error: any) {
    console.error('[Admin Moderators] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => requireAuth(getModerators)(req);
export const POST = (req: NextRequest) => requireAuth(addModerator)(req);
