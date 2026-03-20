import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken, generateRefreshToken } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  walletAddress: z.string().optional(),
  email: z.string().email().optional(),
  discordId: z.string().optional(),
}).refine(data => data.walletAddress || data.email || data.discordId, {
  message: "Must provide walletAddress, email, or discordId",
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);

    let user = null;

    // Buscar por wallet
    if (data.walletAddress) {
      user = await prisma.profile.findUnique({
        where: { walletAddress: data.walletAddress },
      });

      // Se não encontrou, criar novo perfil
      if (!user) {
        user = await prisma.profile.create({
          data: {
            walletAddress: data.walletAddress,
            primaryAuthMethod: 'wallet',
            walletLinkedAt: new Date(),
            credits: 10.00,
          },
        });

        // Criar registro em wallet_logins
        await prisma.walletLogin.create({
          data: {
            walletAddress: data.walletAddress,
            userId: user.id,
          },
        });
      } else {
        // Atualizar last_login_at
        await prisma.walletLogin.updateMany({
          where: { walletAddress: data.walletAddress },
          data: { lastLoginAt: new Date() },
        });
      }
    }
    // Buscar por email
    else if (data.email) {
      user = await prisma.profile.findUnique({
        where: { email: data.email },
      });
    }
    // Buscar por Discord ID
    else if (data.discordId) {
      user = await prisma.profile.findFirst({
        where: { discordId: data.discordId },
      });
    }

    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        walletAddress: user.walletAddress,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    
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
