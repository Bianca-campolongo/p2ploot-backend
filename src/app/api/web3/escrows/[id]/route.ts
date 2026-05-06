import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import {
  buildLocalDevnetDemoFallback,
  executeDevnetDemoEscrowTransfer,
  isDevnetDemoAction,
  isDevnetDemoEnabled,
  type DevnetDemoTxResult,
} from '@/lib/solana-devnet-demo';
import { shouldValidateSolanaTxSignatures, validateSolanaSignature, type SolanaSignatureValidation } from '@/lib/solana-rpc';
import { canReadEscrow, hasTerminalEscrowStatus, isAdminUser } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const updateEscrowSchema = z.object({
  action: z.enum([
    'record_deposit',
    'seller_confirm',
    'release',
    'request_refund',
    'record_refund',
    'open_dispute',
    'cancel',
  ]),
  txSignature: z.string().min(8).max(128).optional(),
  programId: z.string().min(32).max(128).optional(),
  escrowPda: z.string().min(32).max(128).optional(),
  vaultAddress: z.string().min(32).max(128).optional(),
  message: z.string().max(1000).optional(),
  payload: z.record(z.any()).optional(),
});

const dealInclude = {
  buyer: { select: { id: true, username: true, email: true, walletAddress: true, reputationScore: true } },
  seller: { select: { id: true, username: true, email: true, walletAddress: true, reputationScore: true } },
  createdBy: { select: { id: true, username: true, email: true } },
  ad: { select: { id: true, title: true, price: true, currency: true, game: true, server: true, region: true } },
  conversation: { select: { id: true, buyerId: true, sellerId: true, adId: true, isCompleted: true } },
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 25,
  },
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

function requireTxSignature(action: string, txSignature?: string): string {
  if (!txSignature) {
    fail(400, `${action} requires txSignature`);
  }
  return txSignature;
}

async function getEscrow(_req: NextRequest, user: AuthUser, context?: { params: { id: string } }) {
  const id = context?.params?.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing escrow id' }, { status: 400 });
  }

  const deal = await prisma.escrowDeal.findUnique({
    where: { id },
    include: dealInclude,
  });

  if (!deal) {
    return NextResponse.json({ error: 'Escrow not found' }, { status: 404 });
  }

  if (!canReadEscrow(deal, user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ deal: deepSerialize(deal) });
}

async function updateEscrow(req: NextRequest, user: AuthUser, context?: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing escrow id' }, { status: 400 });
    }

    const body = updateEscrowSchema.parse(await req.json());
    const admin = isAdminUser(user);
    const now = new Date();
    let effectiveTxSignature = body.txSignature;
    let solanaValidation: SolanaSignatureValidation | null = null;
    let devnetDemoTx: DevnetDemoTxResult | null = null;

    if (!effectiveTxSignature && isDevnetDemoAction(body.action)) {
      const preflightDeal = await prisma.escrowDeal.findUnique({
        where: { id },
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          createdById: true,
          status: true,
          network: true,
          vaultAddress: true,
        },
      });

      if (!preflightDeal) {
        return NextResponse.json({ error: 'Escrow not found' }, { status: 404 });
      }

      if (!canReadEscrow(preflightDeal, user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (hasTerminalEscrowStatus(preflightDeal.status)) {
        return NextResponse.json({ error: `Escrow is already ${preflightDeal.status}` }, { status: 409 });
      }

      const isBuyer = preflightDeal.buyerId === user.id;

      if (body.action === 'record_deposit' && !admin && !isBuyer) {
        return NextResponse.json({ error: 'Only buyer can record deposit' }, { status: 403 });
      }

      if (body.action === 'release' && !admin && !isBuyer) {
        return NextResponse.json({ error: 'Only buyer can release escrow' }, { status: 403 });
      }

      if (body.action === 'record_refund' && !admin && !isBuyer) {
        return NextResponse.json({ error: 'Only buyer or admin can record refund' }, { status: 403 });
      }

      const statusAllowed =
        (body.action === 'record_deposit' && ['draft', 'initialized'].includes(preflightDeal.status)) ||
        (body.action === 'release' && ['funded', 'seller_confirmed'].includes(preflightDeal.status)) ||
        (body.action === 'record_refund' && ['funded', 'seller_confirmed', 'refund_requested', 'disputed'].includes(preflightDeal.status));

      if (!statusAllowed) {
        return NextResponse.json(
          { error: `Cannot ${body.action} from status ${preflightDeal.status}` },
          { status: 409 }
        );
      }

      if (isDevnetDemoEnabled(preflightDeal.network)) {
        try {
          devnetDemoTx = await executeDevnetDemoEscrowTransfer(preflightDeal, body.action);
        } catch (error) {
          if (process.env.SOLANA_DEVNET_DEMO_FALLBACK_TO_LOCAL === 'false') {
            throw error;
          }
          devnetDemoTx = buildLocalDevnetDemoFallback(preflightDeal, body.action, error);
        }
        if (!devnetDemoTx.signature) {
          devnetDemoTx = buildLocalDevnetDemoFallback(preflightDeal, body.action, new Error('Devnet transaction did not return a signature'));
        }
        effectiveTxSignature = devnetDemoTx.signature;
      }
    }

    if (effectiveTxSignature && shouldValidateSolanaTxSignatures()) {
      solanaValidation = await validateSolanaSignature(effectiveTxSignature);
      if (!solanaValidation.valid) {
        return NextResponse.json(
          { error: solanaValidation.error || 'Invalid Solana transaction signature', solanaValidation },
          { status: 400 }
        );
      }
    }

    const updatedDeal = await prisma.$transaction(async (tx) => {
      const deal = await tx.escrowDeal.findUnique({
        where: { id },
        include: {
          conversation: { select: { id: true, isCompleted: true } },
        },
      });

      if (!deal) {
        fail(404, 'Escrow not found');
      }

      if (!canReadEscrow(deal, user)) {
        fail(403, 'Forbidden');
      }

      const isBuyer = deal.buyerId === user.id;
      const isSeller = deal.sellerId === user.id;
      const isCreator = deal.createdById === user.id;

      if (hasTerminalEscrowStatus(deal.status)) {
        fail(409, `Escrow is already ${deal.status}`);
      }

      const data: Record<string, unknown> = {};
      let eventType: string = body.action;
      let nextStatus = deal.status;
      let txSignature = effectiveTxSignature;

      switch (body.action) {
        case 'record_deposit': {
          if (!admin && !isBuyer) fail(403, 'Only buyer can record deposit');
          if (!['draft', 'initialized'].includes(deal.status)) {
            fail(409, `Cannot record deposit from status ${deal.status}`);
          }
          txSignature = requireTxSignature(body.action, effectiveTxSignature);
          nextStatus = 'funded';
          Object.assign(data, {
            status: nextStatus,
            depositTx: txSignature,
            programId: body.programId || deal.programId,
            escrowPda: body.escrowPda || deal.escrowPda,
            vaultAddress: body.vaultAddress || devnetDemoTx?.vaultAddress || deal.vaultAddress,
            fundedAt: now,
          });
          eventType = 'deposit_recorded';
          break;
        }

        case 'seller_confirm': {
          if (!admin && !isSeller) fail(403, 'Only seller can confirm delivery');
          if (deal.status !== 'funded') {
            fail(409, `Cannot confirm seller delivery from status ${deal.status}`);
          }
          nextStatus = 'seller_confirmed';
          Object.assign(data, {
            status: nextStatus,
            sellerConfirmTx: txSignature || null,
            sellerConfirmedAt: now,
          });
          eventType = 'seller_confirmed';
          break;
        }

        case 'release': {
          if (!admin && !isBuyer) fail(403, 'Only buyer can release escrow');
          if (!['funded', 'seller_confirmed'].includes(deal.status)) {
            fail(409, `Cannot release escrow from status ${deal.status}`);
          }
          txSignature = requireTxSignature(body.action, effectiveTxSignature);
          nextStatus = 'released';
          Object.assign(data, {
            status: nextStatus,
            releaseTx: txSignature,
            releasedAt: now,
          });
          eventType = 'released';
          break;
        }

        case 'request_refund': {
          if (!admin && !isBuyer && !isSeller) fail(403, 'Only participants can request refund');
          if (!['funded', 'seller_confirmed'].includes(deal.status)) {
            fail(409, `Cannot request refund from status ${deal.status}`);
          }
          nextStatus = 'refund_requested';
          Object.assign(data, {
            status: nextStatus,
          });
          eventType = 'refund_requested';
          break;
        }

        case 'record_refund': {
          if (!admin && !isBuyer) fail(403, 'Only buyer or admin can record refund');
          if (!['funded', 'seller_confirmed', 'refund_requested', 'disputed'].includes(deal.status)) {
            fail(409, `Cannot record refund from status ${deal.status}`);
          }
          txSignature = requireTxSignature(body.action, effectiveTxSignature);
          nextStatus = 'refunded';
          Object.assign(data, {
            status: nextStatus,
            refundTx: txSignature,
            refundedAt: now,
          });
          eventType = 'refunded';
          break;
        }

        case 'open_dispute': {
          if (!admin && !isBuyer && !isSeller) fail(403, 'Only participants can open dispute');
          if (!['funded', 'seller_confirmed', 'refund_requested'].includes(deal.status)) {
            fail(409, `Cannot open dispute from status ${deal.status}`);
          }
          nextStatus = 'disputed';
          Object.assign(data, {
            status: nextStatus,
            disputedAt: now,
          });
          eventType = 'disputed';
          break;
        }

        case 'cancel': {
          if (!admin && !isCreator && !isBuyer) fail(403, 'Only buyer, creator, or admin can cancel draft');
          if (!['draft', 'initialized'].includes(deal.status)) {
            fail(409, `Cannot cancel escrow from status ${deal.status}`);
          }
          nextStatus = 'cancelled';
          Object.assign(data, {
            status: nextStatus,
            cancelTx: txSignature || null,
            cancelledAt: now,
          });
          eventType = 'cancelled';
          break;
        }
      }

      const updated = await tx.escrowDeal.update({
        where: { id },
        data: {
          ...data,
          events: {
            create: {
              actorId: user.id,
              type: eventType,
              statusSnapshot: nextStatus,
              txSignature,
              message: body.message,
              payload: {
                ...(body.payload || {}),
                ...(devnetDemoTx ? { devnetDemoTx } : {}),
                ...(solanaValidation ? { solanaValidation } : {}),
              } as any,
            },
          },
        },
        include: dealInclude,
      });

      if (body.action === 'release') {
        if (deal.conversationId) {
          await tx.conversation.update({
            where: { id: deal.conversationId },
            data: {
              buyerConfirmed: true,
              sellerConfirmed: true,
              isCompleted: true,
            },
          });
        }

        if (!deal.conversation?.isCompleted) {
          await tx.profile.update({
            where: { id: deal.buyerId },
            data: { reputationScore: { increment: 1 } },
          });
          await tx.profile.update({
            where: { id: deal.sellerId },
            data: { reputationScore: { increment: 1 } },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({ deal: deepSerialize(updatedDeal) });
  } catch (error) {
    console.error('Error updating escrow:', error);

    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = requireAuth(getEscrow);
export const PATCH = requireAuth(updateEscrow);
