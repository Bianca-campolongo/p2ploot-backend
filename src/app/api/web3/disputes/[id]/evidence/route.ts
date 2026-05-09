import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { disputeInclude } from '@/lib/escrow-disputes';
import { isAdminUser } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const evidenceItemSchema = z.object({
  kind: z.enum(['text', 'image', 'video', 'file', 'link']),
  label: z.string().max(255).optional(),
  url: z.string().url().max(1000).optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  text: z.string().max(4000).optional(),
  metadata: z.record(z.any()).optional(),
}).refine((value) => value.text || value.url, {
  message: 'Evidence needs text or url',
});

const evidenceSchema = z.object({
  items: z.array(evidenceItemSchema).min(1).max(10).optional(),
}).passthrough();

function normalizeEvidenceItems(body: unknown) {
  const parsed = evidenceSchema.parse(body);
  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }
  return [evidenceItemSchema.parse(parsed)];
}

async function addEvidence(req: NextRequest, user: AuthUser, context?: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing dispute id' }, { status: 400 });
    }

    const body = await req.json();
    const items = normalizeEvidenceItems(body);

    const dispute = await prisma.escrowDispute.findUnique({
      where: { id },
      select: { id: true, escrowDealId: true, buyerId: true, sellerId: true, openedById: true, status: true },
    });

    if (!dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    const admin = isAdminUser(user);
    const participant = dispute.buyerId === user.id || dispute.sellerId === user.id || dispute.openedById === user.id;
    if (!admin && !participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nextStatus =
      dispute.status === 'awaiting_seller_evidence' && dispute.sellerId === user.id
        ? 'under_review'
        : dispute.status === 'awaiting_buyer_evidence' && dispute.buyerId === user.id
          ? 'under_review'
          : dispute.status;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.escrowDisputeEvidence.createMany({
        data: items.map((item) => ({
          disputeId: id,
          uploadedById: user.id,
          kind: item.kind,
          label: item.label,
          url: item.url,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          text: item.text,
          metadata: item.metadata || {},
        })),
      });

      await tx.escrowDispute.update({
        where: { id },
        data: { status: nextStatus },
      });

      await tx.escrowEvent.create({
        data: {
          dealId: dispute.escrowDealId,
          actorId: user.id,
          type: 'dispute_evidence_added',
          statusSnapshot: 'disputed',
          message: `${items.length} evidence item(s) added`,
          payload: {
            disputeId: id,
            evidenceKinds: items.map((item) => item.kind),
          },
        },
      });

      return tx.escrowDispute.findUnique({
        where: { id },
        include: disputeInclude,
      });
    });

    return NextResponse.json({ dispute: deepSerialize(updated) });
  } catch (error) {
    console.error('Error adding dispute evidence:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = requireAuth(addEvidence);
