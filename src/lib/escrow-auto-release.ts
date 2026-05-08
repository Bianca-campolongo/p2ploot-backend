import { prisma } from '@/lib/prisma';
import {
  buildLocalDevnetDemoFallback,
  executeDevnetDemoEscrowTransfer,
  isDevnetDemoEnabled,
} from '@/lib/solana-devnet-demo';
import {
  executeAnchorEscrowDemoAction,
  isAnchorEscrowDemoEnabled,
} from '@/lib/solana-anchor-escrow-demo';

const BUYER_CONFIRMATION_HOURS = Number(process.env.ESCROW_BUYER_CONFIRMATION_HOURS || 24);
const AUTO_RELEASE_BATCH_SIZE = 20;

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function getAutoReleaseCutoff(now = new Date()) {
  return new Date(now.getTime() - BUYER_CONFIRMATION_HOURS * 60 * 60 * 1000);
}

export async function autoReleaseDueEscrows(scope: { conversationId?: string; adId?: bigint } = {}) {
  const now = new Date();
  const cutoff = getAutoReleaseCutoff(now);

  const deals = await prisma.escrowDeal.findMany({
    where: {
      status: 'seller_confirmed',
      sellerConfirmedAt: { lte: cutoff },
      ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
      ...(scope.adId ? { adId: scope.adId } : {}),
    },
    include: {
      conversation: { select: { id: true, isCompleted: true } },
    },
    orderBy: { sellerConfirmedAt: 'asc' },
    take: AUTO_RELEASE_BATCH_SIZE,
  });

  for (const deal of deals) {
    let devnetDemoTx: any = null;

    if (!isDevnetDemoEnabled(deal.network)) {
      continue;
    }

    try {
      if (isAnchorEscrowDemoEnabled(deal.network)) {
        devnetDemoTx = await executeAnchorEscrowDemoAction(deal, 'release');
      } else {
        devnetDemoTx = await executeDevnetDemoEscrowTransfer(deal, 'release');
      }
    } catch (error) {
      if (process.env.SOLANA_DEVNET_DEMO_FALLBACK_TO_LOCAL === 'false') {
        console.error('Auto release failed without local fallback:', error);
        continue;
      }
      devnetDemoTx = buildLocalDevnetDemoFallback(deal, 'release', error);
    }

    const txSignature = devnetDemoTx?.signature;
    if (!txSignature) {
      console.error(`Auto release skipped for escrow ${deal.id}: missing tx signature`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.escrowDeal.findUnique({
        where: { id: deal.id },
        include: { conversation: { select: { id: true, isCompleted: true } } },
      });

      if (!current || current.status !== 'seller_confirmed') return;

      await tx.escrowDeal.update({
        where: { id: current.id },
        data: {
          status: 'released',
          releaseTx: txSignature,
          releasedAt: now,
          metadata: {
            ...asRecord(current.metadata),
            autoReleased: true,
            autoReleasedAt: now.toISOString(),
            buyerConfirmationHours: BUYER_CONFIRMATION_HOURS,
          },
          events: {
            create: {
              actorId: null,
              type: 'auto_released',
              statusSnapshot: 'released',
              txSignature,
              message: `Auto release after ${BUYER_CONFIRMATION_HOURS}h without buyer dispute`,
              payload: {
                autoRelease: true,
                buyerConfirmationHours: BUYER_CONFIRMATION_HOURS,
                devnetDemoTx,
              },
            },
          },
        },
      });

      if (current.conversationId) {
        await tx.conversation.update({
          where: { id: current.conversationId },
          data: {
            buyerConfirmed: true,
            sellerConfirmed: true,
            isCompleted: true,
          },
        });
      }

      if (!current.conversation?.isCompleted) {
        await tx.profile.update({
          where: { id: current.buyerId },
          data: { reputationScore: { increment: 1 } },
        });
        await tx.profile.update({
          where: { id: current.sellerId },
          data: { reputationScore: { increment: 1 } },
        });
      }
    });
  }
}
