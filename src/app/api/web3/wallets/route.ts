import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { isSolanaAddressLike, normalizeSolanaNetwork } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const walletSchema = z.object({
  chain: z.string().optional(),
  network: z.string().optional(),
  address: z.string().min(32).max(128),
  provider: z.string().min(1).max(50).optional(),
  providerUserId: z.string().max(255).optional().nullable(),
  walletType: z.string().max(50).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

async function listWallets(_req: NextRequest, user: AuthUser) {
  const wallets = await prisma.web3Wallet.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json({ wallets: deepSerialize(wallets) });
}

async function upsertWallet(req: NextRequest, user: AuthUser) {
  try {
    const body = walletSchema.parse(await req.json());
    const chain = (body.chain || 'solana').trim().toLowerCase();
    const network = normalizeSolanaNetwork(body.network);
    const address = body.address.trim();
    const provider = (body.provider || 'privy').trim().toLowerCase();

    if (chain !== 'solana') {
      return NextResponse.json({ error: 'Only Solana wallets are supported in this baseline' }, { status: 400 });
    }

    if (!isSolanaAddressLike(address)) {
      return NextResponse.json({ error: 'Invalid Solana wallet address format' }, { status: 400 });
    }

    const [existingWallet, existingLegacyWallet, existingProfileWallet, hasWalletForNetwork] = await Promise.all([
      prisma.web3Wallet.findFirst({
        where: { chain, network, address },
        select: { id: true, userId: true },
      }),
      prisma.walletLogin.findUnique({
        where: { walletAddress: address },
        select: { userId: true },
      }),
      prisma.profile.findFirst({
        where: {
          walletAddress: address,
          NOT: { id: user.id },
        },
        select: { id: true },
      }),
      prisma.web3Wallet.findFirst({
        where: { userId: user.id, chain, network },
        select: { id: true },
      }),
    ]);

    if (existingWallet && existingWallet.userId !== user.id) {
      return NextResponse.json({ error: 'Wallet already linked to another user' }, { status: 409 });
    }

    if (existingLegacyWallet && existingLegacyWallet.userId !== user.id) {
      return NextResponse.json({ error: 'Wallet already linked to another user' }, { status: 409 });
    }

    if (existingProfileWallet) {
      return NextResponse.json({ error: 'Wallet already linked to another user' }, { status: 409 });
    }

    const shouldBePrimary = body.isPrimary ?? !hasWalletForNetwork;
    const now = new Date();

    const wallet = await prisma.$transaction(async (tx) => {
      if (shouldBePrimary) {
        await tx.web3Wallet.updateMany({
          where: { userId: user.id, chain, network },
          data: { isPrimary: false },
        });
      }

      const savedWallet = existingWallet
        ? await tx.web3Wallet.update({
            where: { id: existingWallet.id },
            data: {
              provider,
              providerUserId: body.providerUserId || null,
              walletType: body.walletType || null,
              isPrimary: shouldBePrimary,
              lastSeenAt: now,
            },
          })
        : await tx.web3Wallet.create({
            data: {
              userId: user.id,
              chain,
              network,
              address,
              provider,
              providerUserId: body.providerUserId || null,
              walletType: body.walletType || null,
              isPrimary: shouldBePrimary,
              lastSeenAt: now,
            },
          });

      await tx.profile.update({
        where: { id: user.id },
        data: {
          walletAddress: address,
          walletLinkedAt: now,
          primaryAuthMethod: user.email ? 'both' : 'wallet',
        },
      });

      await tx.walletLogin.upsert({
        where: { walletAddress: address },
        update: {
          userId: user.id,
          lastLoginAt: now,
        },
        create: {
          walletAddress: address,
          userId: user.id,
          createdAt: now,
          lastLoginAt: now,
        },
      });

      return savedWallet;
    });

    return NextResponse.json({ wallet: deepSerialize(wallet) }, { status: existingWallet ? 200 : 201 });
  } catch (error) {
    console.error('Error linking Web3 wallet:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = requireAuth(listWallets);
export const POST = requireAuth(upsertWallet);
