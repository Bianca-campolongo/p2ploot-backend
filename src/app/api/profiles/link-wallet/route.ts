import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  walletAddress: z.string().min(1),
});

async function handler(req: NextRequest, user: any) {
  try {
    const body = await req.json();
    const { walletAddress } = schema.parse(body);

    // Verificar se wallet já está vinculada a outro usuário
    const existingWallet = await prisma.walletLogin.findUnique({
      where: { walletAddress },
    });

    if (existingWallet && existingWallet.userId !== user.id) {
      return Response.json(
        { error: 'Wallet já vinculada a outro usuário' },
        { status: 400 }
      );
    }

    // Atualizar profile
    await prisma.profile.update({
      where: { id: user.id },
      data: {
        walletAddress,
        walletLinkedAt: new Date(),
        primaryAuthMethod: user.email ? 'both' : 'wallet',
      },
    });

    // Inserir ou atualizar wallet_logins
    await prisma.walletLogin.upsert({
      where: { walletAddress },
      update: {
        userId: user.id,
        lastLoginAt: new Date(),
      },
      create: {
        walletAddress,
        userId: user.id,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error linking wallet:', error);
    
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = requireAuth(handler);
