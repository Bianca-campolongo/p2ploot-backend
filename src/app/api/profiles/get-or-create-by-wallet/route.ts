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

    // Buscar wallet já vinculada
    const walletLogin = await prisma.walletLogin.findUnique({
      where: { walletAddress },
      include: { user: true },
    });

    if (walletLogin) {
      // Atualizar last_login
      await prisma.walletLogin.update({
        where: { walletAddress },
        data: { lastLoginAt: new Date() },
      });

      return Response.json({ userId: walletLogin.userId });
    }

    // Verificar se profile já existe com essa wallet
    let profile = await prisma.profile.findUnique({
      where: { walletAddress },
    });

    if (profile) {
      // Criar registro em wallet_logins
      await prisma.walletLogin.create({
        data: {
          walletAddress,
          userId: profile.id,
        },
      });

      return Response.json({ userId: profile.id });
    }

    // Criar novo profile
    profile = await prisma.profile.create({
      data: {
        walletAddress,
        primaryAuthMethod: 'wallet',
        walletLinkedAt: new Date(),
        credits: 10.00,
      },
    });

    // Registrar wallet login
    await prisma.walletLogin.create({
      data: {
        walletAddress,
        userId: profile.id,
      },
    });

    return Response.json({ userId: profile.id });
  } catch (error) {
    console.error('Error in get-or-create-by-wallet:', error);
    
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
