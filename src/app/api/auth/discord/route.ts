import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken, generateRefreshToken } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const discordLoginSchema = z.object({
  discordId: z.string().min(1),
  discordUsername: z.string().optional(),
  discordGlobalName: z.string().optional(),
  email: z.string().email().optional(),
  avatar: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = discordLoginSchema.parse(body);

    // Buscar usuário existente por Discord ID
    let user = await prisma.profile.findFirst({
      where: { discordId: data.discordId },
    });

    // Se não encontrou, criar novo perfil
    if (!user) {
      // Verificar se email já existe (para vincular contas)
      if (data.email) {
        const existingUser = await prisma.profile.findUnique({
          where: { email: data.email },
        });

        if (existingUser) {
          // Vincular Discord ao perfil existente
          user = await prisma.profile.update({
            where: { id: existingUser.id },
            data: {
              discordId: data.discordId,
              discordUsername: data.discordUsername || null,
              discordGlobalName: data.discordGlobalName || null,
              primaryAuthMethod: existingUser.walletAddress ? 'both' : 'discord',
              avatarUrl: data.avatar || existingUser.avatarUrl,
            },
          });
        }
      }

      // Se ainda não tem usuário, criar novo
      if (!user) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const isAdmin = data.email && adminEmail && data.email === adminEmail;

        user = await prisma.profile.create({
          data: {
            email: data.email || null,
            username: data.discordGlobalName || data.discordUsername || 'Discord User',
            discordId: data.discordId,
            discordUsername: data.discordUsername || null,
            discordGlobalName: data.discordGlobalName || null,
            primaryAuthMethod: 'discord',
            avatarUrl: data.avatar || null,
            credits: 10.00,
            role: isAdmin ? 'admin' : 'user',
          },
        });
      }
    } else {
      // Atualizar informações do Discord se mudaram
      const adminEmail = process.env.ADMIN_EMAIL;
      const isAdmin = data.email && adminEmail && data.email === adminEmail;

      user = await prisma.profile.update({
        where: { id: user.id },
        data: {
          discordUsername: data.discordUsername || user.discordUsername,
          discordGlobalName: data.discordGlobalName || user.discordGlobalName,
          avatarUrl: data.avatar || user.avatarUrl,
          email: data.email || user.email,
          ...(isAdmin && { role: 'admin' })
        },
      });
    }

    // Gerar tokens
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
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        avatarUrl: user.avatarUrl,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Discord login error:', error);
    
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
