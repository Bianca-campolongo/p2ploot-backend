import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateRefreshToken, generateToken } from '@/lib/auth';
import { getPrivyClient } from '@/lib/privy';
import { isSolanaAddressLike, normalizeSolanaNetwork } from '@/lib/web3';
import { deepSerialize } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

const privyLoginSchema = z.object({
  accessToken: z.string().min(20),
  walletAddress: z.string().min(32).max(128).optional().nullable(),
  walletType: z.string().max(50).optional().nullable(),
  network: z.string().optional().nullable(),
});

type LinkedAccount = {
  type?: string;
  address?: string;
  chain_type?: string;
  connector_type?: string;
  email?: string | null;
  subject?: string;
  username?: string | null;
};

function accountEmail(account: LinkedAccount | undefined) {
  if (!account) return null;
  return account.type === 'email' ? account.address || null : account.email || null;
}

function chooseSolanaWallet(accounts: LinkedAccount[]) {
  const embedded = accounts.find((account) =>
    account.type === 'wallet' &&
    account.chain_type === 'solana' &&
    account.connector_type === 'embedded' &&
    account.address &&
    isSolanaAddressLike(account.address)
  );

  const linked = accounts.find((account) =>
    account.type === 'wallet' &&
    account.chain_type === 'solana' &&
    account.address &&
    isSolanaAddressLike(account.address)
  );

  const address = embedded?.address || linked?.address || null;
  const walletType = embedded ? 'embedded' : linked?.connector_type || (address ? 'linked' : null);

  return { address, walletType };
}

export async function POST(request: NextRequest) {
  try {
    const body = privyLoginSchema.parse(await request.json());
    const privy = getPrivyClient();
    const verified = await privy.utils().auth().verifyAccessToken(body.accessToken);
    const privyUser = await privy.users()._get(verified.user_id);
    const linkedAccounts = (privyUser.linked_accounts || []) as LinkedAccount[];

    const emailAccount = linkedAccounts.find((account) => account.type === 'email' || account.email);
    const discordAccount = linkedAccounts.find((account) => account.type === 'discord_oauth');
    const email = accountEmail(emailAccount);
    const { address: walletAddress, walletType } = chooseSolanaWallet(linkedAccounts);
    const network = normalizeSolanaNetwork(body.network || process.env.SOLANA_NETWORK || 'devnet');
    const now = new Date();

    let profile = await prisma.profile.findUnique({
      where: { privyId: privyUser.id },
    });

    if (!profile && email) {
      profile = await prisma.profile.findUnique({
        where: { email },
      });
    }

    if (!profile && walletAddress) {
      profile = await prisma.profile.findUnique({
        where: { walletAddress },
      });
    }

    if (profile?.privyId && profile.privyId !== privyUser.id) {
      return NextResponse.json({ error: 'Profile already linked to another Privy user' }, { status: 409 });
    }

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          email,
          username: discordAccount?.username || (email ? email.split('@')[0] : null),
          walletAddress,
          walletLinkedAt: walletAddress ? now : null,
          primaryAuthMethod: 'privy',
          privyId: privyUser.id,
          privyLinkedAt: now,
          discordId: discordAccount?.subject || null,
          discordUsername: discordAccount?.username || null,
          credits: 10.00,
        },
      });
    } else {
      const walletOwner = walletAddress
        ? await prisma.profile.findFirst({
            where: {
              walletAddress,
              NOT: { id: profile.id },
            },
            select: { id: true },
          })
        : null;

      profile = await prisma.profile.update({
        where: { id: profile.id },
        data: {
          privyId: profile.privyId || privyUser.id,
          privyLinkedAt: profile.privyLinkedAt || now,
          email: profile.email || email,
          username: profile.username || discordAccount?.username || (email ? email.split('@')[0] : undefined),
          walletAddress: walletAddress && !walletOwner ? walletAddress : undefined,
          walletLinkedAt: walletAddress && !walletOwner ? now : undefined,
          primaryAuthMethod: 'privy',
          discordId: profile.discordId || discordAccount?.subject,
          discordUsername: profile.discordUsername || discordAccount?.username,
        },
      });
    }

    let web3Wallet = null;
    if (walletAddress) {
      const existingWallet = await prisma.web3Wallet.findFirst({
        where: { chain: 'solana', network, address: walletAddress },
        select: { id: true, userId: true },
      });

      if (!existingWallet || existingWallet.userId === profile.id) {
        web3Wallet = await prisma.$transaction(async (tx) => {
          await tx.web3Wallet.updateMany({
            where: { userId: profile.id, chain: 'solana', network },
            data: { isPrimary: false },
          });

          const wallet = existingWallet
            ? await tx.web3Wallet.update({
                where: { id: existingWallet.id },
                data: {
                  provider: 'privy',
                  providerUserId: privyUser.id,
                  walletType: body.walletType || walletType || 'privy',
                  isPrimary: true,
                  lastSeenAt: now,
                },
              })
            : await tx.web3Wallet.create({
                data: {
                  userId: profile.id,
                  chain: 'solana',
                  network,
                  address: walletAddress,
                  provider: 'privy',
                  providerUserId: privyUser.id,
                  walletType: body.walletType || walletType || 'privy',
                  isPrimary: true,
                  lastSeenAt: now,
                },
              });

          await tx.walletLogin.upsert({
            where: { walletAddress },
            update: {
              userId: profile.id,
              lastLoginAt: now,
            },
            create: {
              walletAddress,
              userId: profile.id,
              createdAt: now,
              lastLoginAt: now,
            },
          });

          return wallet;
        });
      }
    }

    const tokenPayload = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      walletAddress: profile.walletAddress,
    };

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        role: profile.role,
        walletAddress: profile.walletAddress,
        privyId: profile.privyId,
      },
      web3Wallet: web3Wallet ? deepSerialize(web3Wallet) : null,
      token: generateToken(tokenPayload),
      refreshToken: generateRefreshToken(tokenPayload),
    });
  } catch (error) {
    console.error('Privy login error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Privy authentication failed' }, { status: 401 });
  }
}
