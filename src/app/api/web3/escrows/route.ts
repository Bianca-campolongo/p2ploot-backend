import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { autoReleaseDueEscrows } from '@/lib/escrow-auto-release';
import { buildCloakPrivacyMetadata } from '@/lib/cloak-privacy';
import { ESCROW_TERMINAL_STATUSES, isAdminUser, normalizeSolanaNetwork } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const createEscrowSchema = z.object({
  conversationId: z.string().uuid(),
  network: z.string().optional(),
  programId: z.string().min(32).max(128).optional(),
  assetMint: z.string().min(32).max(128).optional(),
  currencySymbol: z.string().min(1).max(20).optional(),
  amountRaw: z.string().min(1).max(80).optional(),
  amountUi: z.union([z.string().min(1), z.number().positive()]).optional(),
  escrowPda: z.string().min(32).max(128).optional(),
  vaultAddress: z.string().min(32).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const dealInclude = {
  buyer: { select: { id: true, username: true, email: true, walletAddress: true, reputationScore: true } },
  seller: { select: { id: true, username: true, email: true, walletAddress: true, reputationScore: true } },
  createdBy: { select: { id: true, username: true, email: true } },
  ad: { select: { id: true, title: true, price: true, currency: true, game: true, server: true, region: true, deliveryWindowHours: true, cloakSellerPrivacyEnabled: true } },
  conversation: { select: { id: true, buyerId: true, sellerId: true, adId: true, isCompleted: true } },
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 25,
  },
  dispute: {
    include: {
      openedBy: { select: { id: true, username: true, email: true } },
      buyer: { select: { id: true, username: true, email: true } },
      seller: { select: { id: true, username: true, email: true } },
      resolvedBy: { select: { id: true, username: true, email: true } },
      evidence: {
        include: { uploadedBy: { select: { id: true, username: true, email: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
};

function parseOptionalAdId(value: string | null): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

async function listEscrows(req: NextRequest, user: AuthUser) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const adId = parseOptionalAdId(url.searchParams.get('adId'));

  await autoReleaseDueEscrows({ conversationId, adId });

  const deals = await prisma.escrowDeal.findMany({
    where: {
      ...(conversationId ? { conversationId } : {}),
      ...(status ? { status } : {}),
      ...(adId ? { adId } : {}),
      ...(isAdminUser(user)
        ? {}
        : {
            OR: [{ buyerId: user.id }, { sellerId: user.id }, { createdById: user.id }],
          }),
    },
    include: dealInclude,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ deals: deepSerialize(deals) });
}

async function createEscrow(req: NextRequest, user: AuthUser) {
  try {
    const body = createEscrowSchema.parse(await req.json());

    const conversation = await prisma.conversation.findUnique({
      where: { id: body.conversationId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        adId: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const admin = isAdminUser(user);
    const isBuyer = conversation.buyerId === user.id;
    const isSeller = conversation.sellerId === user.id;

    if (!admin && !isBuyer && !isSeller) {
      return NextResponse.json({ error: 'You are not part of this negotiation' }, { status: 403 });
    }

    if (!admin && !isBuyer) {
      return NextResponse.json({ error: 'Only the buyer can create the escrow draft' }, { status: 403 });
    }

    const existingActiveDeal = await prisma.escrowDeal.findFirst({
      where: {
        conversationId: conversation.id,
        status: { notIn: ESCROW_TERMINAL_STATUSES },
      },
      include: dealInclude,
      orderBy: { createdAt: 'desc' },
    });

    if (existingActiveDeal) {
      return NextResponse.json({ deal: deepSerialize(existingActiveDeal), reused: true });
    }

    const ad = conversation.adId
      ? await prisma.marketAd.findUnique({
          where: { id: conversation.adId },
          select: {
            id: true,
            title: true,
            price: true,
            currency: true,
            game: true,
            server: true,
            region: true,
            type: true,
            deliveryWindowHours: true,
            cloakSellerPrivacyEnabled: true,
          },
        })
      : null;

    const amountUi = body.amountUi !== undefined ? String(body.amountUi) : ad?.price?.toString();
    const currencySymbol = body.currencySymbol || ad?.currency || 'USDC';
    const network = normalizeSolanaNetwork(body.network);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS || 250);
    const bodyCloakPrivacy = body.metadata?.cloakPrivacy || {};
    const cloakPrivacy = buildCloakPrivacyMetadata({
      sellerRequested: Boolean(ad?.cloakSellerPrivacyEnabled || bodyCloakPrivacy.sellerRequested),
      buyerRequested: Boolean(bodyCloakPrivacy.buyerRequested),
    });

    const deal = await prisma.escrowDeal.create({
      data: {
        conversationId: conversation.id,
        adId: conversation.adId,
        buyerId: conversation.buyerId,
        sellerId: conversation.sellerId,
        createdById: user.id,
        chain: 'solana',
        network,
        programId: body.programId,
        assetMint: body.assetMint,
        currencySymbol,
        amountRaw: body.amountRaw,
        amountUi,
        escrowPda: body.escrowPda,
        vaultAddress: body.vaultAddress,
        expiresAt,
        metadata: {
          ...(body.metadata || {}),
          source: 'marketplace_conversation',
          platformFeeBps,
          adSnapshot: ad
            ? {
                id: ad.id.toString(),
                title: ad.title,
                price: ad.price?.toString(),
                currency: ad.currency,
                game: ad.game,
                server: ad.server,
                region: ad.region,
                type: ad.type,
                deliveryWindowHours: ad.deliveryWindowHours,
                cloakSellerPrivacyEnabled: ad.cloakSellerPrivacyEnabled,
              }
            : null,
          deliveryWindowHours: ad?.deliveryWindowHours || 24,
          buyerConfirmationHours: 24,
          cloakPrivacy,
        },
        events: {
          create: {
            actorId: user.id,
            type: 'created',
            statusSnapshot: 'draft',
            message: 'Escrow draft created for marketplace conversation',
            payload: {
              network,
              currencySymbol,
              amountUi,
              amountRaw: body.amountRaw,
              platformFeeBps,
              cloakPrivacy,
            },
          },
        },
      },
      include: dealInclude,
    });

    return NextResponse.json({ deal: deepSerialize(deal) }, { status: 201 });
  } catch (error) {
    console.error('Error creating escrow:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = requireAuth(listEscrows);
export const POST = requireAuth(createEscrow);
