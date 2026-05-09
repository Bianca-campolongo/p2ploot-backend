import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { disputeInclude } from '@/lib/escrow-disputes';
import { isAdminUser } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const updateDisputeSchema = z.object({
  action: z.enum([
    'mark_under_review',
    'request_seller_evidence',
    'request_buyer_evidence',
    'resolve_seller',
    'resolve_buyer',
    'close',
  ]),
  adminNotes: z.string().max(4000).optional(),
  resolution: z.string().max(80).optional(),
});

function statusForAction(action: z.infer<typeof updateDisputeSchema>['action']): string {
  switch (action) {
    case 'request_seller_evidence':
      return 'awaiting_seller_evidence';
    case 'request_buyer_evidence':
      return 'awaiting_buyer_evidence';
    case 'resolve_seller':
      return 'resolved_seller';
    case 'resolve_buyer':
      return 'resolved_buyer';
    case 'close':
      return 'closed';
    default:
      return 'under_review';
  }
}

async function getDispute(_req: NextRequest, user: AuthUser, context?: { params: { id: string } }) {
  const id = context?.params?.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing dispute id' }, { status: 400 });
  }

  const dispute = await prisma.escrowDispute.findUnique({
    where: { id },
    include: disputeInclude,
  });

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  if (!isAdminUser(user) && dispute.buyerId !== user.id && dispute.sellerId !== user.id && dispute.openedById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ dispute: deepSerialize(dispute) });
}

async function updateDispute(req: NextRequest, user: AuthUser, context?: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing dispute id' }, { status: 400 });
    }

    if (!isAdminUser(user)) {
      return NextResponse.json({ error: 'Only admins can resolve disputes' }, { status: 403 });
    }

    const body = updateDisputeSchema.parse(await req.json());
    const nextStatus = statusForAction(body.action);
    const now = new Date();
    const resolved = ['resolved_seller', 'resolved_buyer', 'closed'].includes(nextStatus);

    const dispute = await prisma.$transaction(async (tx) => {
      const existing = await tx.escrowDispute.findUnique({
        where: { id },
        select: { id: true, escrowDealId: true },
      });

      if (!existing) {
        throw new Error('DISPUTE_NOT_FOUND');
      }

      const updated = await tx.escrowDispute.update({
        where: { id },
        data: {
          status: nextStatus,
          adminNotes: body.adminNotes,
          resolution: body.resolution || (resolved ? body.action : undefined),
          resolvedById: resolved ? user.id : undefined,
          resolvedAt: resolved ? now : undefined,
        },
        include: disputeInclude,
      });

      await tx.escrowEvent.create({
        data: {
          dealId: existing.escrowDealId,
          actorId: user.id,
          type: 'dispute_admin_action',
          statusSnapshot: updated.escrowDeal.status,
          message: body.adminNotes,
          payload: {
            disputeId: id,
            action: body.action,
            disputeStatus: nextStatus,
            resolution: body.resolution,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ dispute: deepSerialize(dispute) });
  } catch (error) {
    console.error('Error updating dispute:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    if (error instanceof Error && error.message === 'DISPUTE_NOT_FOUND') {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = requireAuth(getDispute);
export const PATCH = requireAuth(updateDispute);
