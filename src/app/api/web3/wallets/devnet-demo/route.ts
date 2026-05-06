import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, type AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import {
  ensureDevnetDemoFunds,
  getOrCreateUserDevnetDemoKeypair,
  isDevnetDemoEnabled,
} from '@/lib/solana-devnet-demo';

export const dynamic = 'force-dynamic';

async function createDevnetDemoWallet(_req: NextRequest, user: AuthUser) {
  try {
    const network = process.env.SOLANA_NETWORK || 'devnet';
    if (!isDevnetDemoEnabled(network)) {
      return NextResponse.json({ error: 'Solana devnet demo wallet is disabled' }, { status: 403 });
    }

    const keypair = getOrCreateUserDevnetDemoKeypair(user.id);
    const address = keypair.publicKey.toBase58();
    const now = new Date();

    const wallet = await prisma.$transaction(async (tx) => {
      await tx.web3Wallet.updateMany({
        where: { userId: user.id, chain: 'solana', network },
        data: { isPrimary: false },
      });

      const savedWallet = await tx.web3Wallet.upsert({
        where: {
          chain_network_address: {
            chain: 'solana',
            network,
            address,
          },
        },
        update: {
          provider: 'p2ploot-devnet-demo',
          walletType: 'custodial_demo',
          isPrimary: true,
          lastSeenAt: now,
        },
        create: {
          userId: user.id,
          chain: 'solana',
          network,
          address,
          provider: 'p2ploot-devnet-demo',
          walletType: 'custodial_demo',
          isPrimary: true,
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

    let funding: { balance: number; airdropSignature: string | null } | null = null;
    let fundingError: string | null = null;

    if (process.env.SOLANA_DEVNET_DEMO_AUTO_AIRDROP === 'true') {
      try {
        funding = await ensureDevnetDemoFunds(keypair.publicKey);
      } catch (error) {
        fundingError = error instanceof Error ? error.message : 'Devnet airdrop failed';
      }
    }

    return NextResponse.json({
      wallet: deepSerialize(wallet),
      funding,
      fundingError,
      mode: 'solana_devnet_system_transfer_demo',
    });
  } catch (error) {
    console.error('Error creating Solana devnet demo wallet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = requireAuth(createDevnetDemoWallet);
