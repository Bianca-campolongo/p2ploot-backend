import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { isAdminUser } from '@/lib/web3';
import { disputeInclude } from '@/lib/escrow-disputes';

export const dynamic = 'force-dynamic';

async function listDisputes(req: NextRequest, user: AuthUser) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const escrowDealId = url.searchParams.get('escrowDealId') || undefined;
  const admin = isAdminUser(user);

  const disputes = await prisma.escrowDispute.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(escrowDealId ? { escrowDealId } : {}),
      ...(admin
        ? {}
        : {
            OR: [{ buyerId: user.id }, { sellerId: user.id }, { openedById: user.id }],
          }),
    },
    include: disputeInclude,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ disputes: deepSerialize(disputes) });
}

export const GET = requireAuth(listDisputes);
