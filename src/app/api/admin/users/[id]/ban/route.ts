import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

async function banUserHandler(
  req: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetUserId = params.id;
    const body = await req.json();
    const { reason } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Impede que um admin bana a si mesmo
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 });
    }

    const targetUser = await prisma.profile.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isBanned: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Impede banimento de outros admins
    if (targetUser.role === 'admin') {
      return NextResponse.json({ error: 'Cannot ban an admin user' }, { status: 403 });
    }

    await prisma.profile.update({
      where: { id: targetUserId },
      data: {
        isBanned: true,
        banReason: reason || 'Violação dos Termos de Uso',
        bannedAt: new Date(),
      },
    });

    console.log(`[Admin Ban] User ${targetUserId} banned by admin ${user.id}. Reason: ${reason}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Ban] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const PATCH = (req: NextRequest, context: { params: { id: string } }) =>
  requireAuth(banUserHandler)(req, context);
