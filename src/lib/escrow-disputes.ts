import type { AuthUser } from './auth';
import { isAdminUser } from './web3';

export const disputeInclude = {
  openedBy: { select: { id: true, username: true, email: true } },
  buyer: { select: { id: true, username: true, email: true, walletAddress: true } },
  seller: { select: { id: true, username: true, email: true, walletAddress: true } },
  resolvedBy: { select: { id: true, username: true, email: true } },
  evidence: {
    include: { uploadedBy: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  escrowDeal: {
    include: {
      ad: { select: { id: true, title: true, price: true, currency: true, game: true, server: true, region: true } },
      conversation: {
        include: {
          messages: {
            include: { sender: { select: { id: true, username: true, email: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
        },
      },
      events: {
        orderBy: { createdAt: 'desc' as const },
        take: 25,
      },
    },
  },
};

type EvidenceLike = {
  uploadedById?: string | null;
  uploadedBy?: { id?: string | null } | null;
  [key: string]: any;
};

type DisputeLike = {
  buyerId?: string | null;
  sellerId?: string | null;
  evidence?: EvidenceLike[] | null;
  [key: string]: any;
};

function evidenceUserId(item: EvidenceLike): string | null {
  return item.uploadedById || item.uploadedBy?.id || null;
}

function visibleEvidenceForUser(dispute: DisputeLike, user: AuthUser, evidence: EvidenceLike[]): EvidenceLike[] {
  if (isAdminUser(user)) return evidence;
  return evidence.filter((item) => evidenceUserId(item) === user.id);
}

export function shapeDisputeForViewer<T extends DisputeLike | null | undefined>(dispute: T, user: AuthUser): T {
  if (!dispute) return dispute;

  const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
  const buyerEvidence = evidence.filter((item) => evidenceUserId(item) === dispute.buyerId);
  const sellerEvidence = evidence.filter((item) => evidenceUserId(item) === dispute.sellerId);
  const admin = isAdminUser(user);
  const visibleEvidence = visibleEvidenceForUser(dispute, user, evidence);
  const isBuyer = dispute.buyerId === user.id;
  const isSeller = dispute.sellerId === user.id;

  return {
    ...dispute,
    evidence: visibleEvidence,
    buyerEvidence: admin || isBuyer ? buyerEvidence : [],
    sellerEvidence: admin || isSeller ? sellerEvidence : [],
    evidenceSummary: {
      total: evidence.length,
      buyer: {
        count: buyerEvidence.length,
        visibleCount: admin || isBuyer ? buyerEvidence.length : 0,
      },
      seller: {
        count: sellerEvidence.length,
        visibleCount: admin || isSeller ? sellerEvidence.length : 0,
      },
    },
  } as T;
}

export function shapeEscrowDealForViewer<T extends Record<string, any> | null | undefined>(deal: T, user: AuthUser): T {
  if (!deal?.dispute) return deal;

  return {
    ...deal,
    dispute: shapeDisputeForViewer(deal.dispute, user),
  } as T;
}

export function shapeEscrowDealsForViewer<T extends Record<string, any>>(deals: T[], user: AuthUser): T[] {
  return deals.map((deal) => shapeEscrowDealForViewer(deal, user));
}
