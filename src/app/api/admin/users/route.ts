import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function searchUsers(req: NextRequest, user: any) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('search')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const users = await prisma.profile.findMany({
      where: {
        OR: [
          { username: { contains: query } },
          { email: { contains: query } },
        ],
        NOT: { role: 'admin' }, // não mostra outros admins
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        isBanned: true,
        banReason: true,
        bannedAt: true,
        reputationScore: true,
      },
      take: 10,
      orderBy: { username: 'asc' },
    });

    return NextResponse.json(users);
  } catch (error: any) {
    console.error('[Admin] Error searching users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => requireAuth(searchUsers)(req);
