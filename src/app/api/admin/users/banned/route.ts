import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function getBannedUsers(req: NextRequest, user: any) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bannedUsers = await prisma.profile.findMany({
      where: { isBanned: true },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        bannedAt: true,
        banReason: true,
        avatarUrl: true,
        reputationScore: true,
      },
      orderBy: { bannedAt: 'desc' },
    });

    return NextResponse.json(bannedUsers);
  } catch (error: any) {
    console.error('[Admin] Error fetching banned users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => requireAuth(getBannedUsers)(req);
