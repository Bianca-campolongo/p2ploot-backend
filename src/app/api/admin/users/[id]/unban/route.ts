import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function unbanUserHandler(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.profile.update({
      where: { id: params.id },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
      },
    });

    console.log(`[Admin Unban] User ${params.id} unbanned by admin ${user.id}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Unban] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const PATCH = (req: NextRequest, context: { params: { id: string } }) =>
  requireAuth(unbanUserHandler)(req, context);
