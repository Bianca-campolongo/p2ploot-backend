import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { calculateReputation } from '@/lib/reputation';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: any) {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        walletAddress: true,
        primaryAuthMethod: true,
        privyId: true,
        privyLinkedAt: true,
        role: true,
        credits: true,
        bio: true,
        avatarUrl: true,
        isPrivate: true,
        discordId: true,
        discordUsername: true,
        discordGlobalName: true,
        discordCreatedAt: true,
        reputationScore: true,
        createdAt: true,
        updatedAt: true,
        moderatorPermission: true,
        guildMembers: {
          include: {
            guild: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      },
    });

    if (!profile) {
      return Response.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const reputation = calculateReputation(profile);

    const serialized = {
      ...profile,
      reputation,
      // Map camelCase to snake_case for frontend
      is_private: profile.isPrivate,
      avatar_url: profile.avatarUrl,
      wallet_address: profile.walletAddress,
      primary_auth_method: profile.primaryAuthMethod,
      privy_id: profile.privyId,
      privy_linked_at: profile.privyLinkedAt,
      discord_id: profile.discordId,
      discord_username: profile.discordUsername,
      discord_global_name: profile.discordGlobalName,
      created_at: profile.createdAt,
      credits: profile.credits ? profile.credits.toString() : '0',
    };

    return Response.json(serialized);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateHandler(req: NextRequest, user: any) {
  try {
    const body = await req.json();
    // Simple validation (can use zod later)
    const { username, bio, isPrivate } = body;

    if (username && username.length < 3) {
      return Response.json({ error: 'Username too short' }, { status: 400 });
    }

    // Check availability if username changes
    if (username) {
      const existing = await prisma.profile.findFirst({
        where: {
          username,
          NOT: { id: user.id }
        }
      });
      if (existing) {
        return Response.json({ error: 'Username taken' }, { status: 409 });
      }
    }

    const updated = await prisma.profile.update({
      where: { id: user.id },
      data: {
        username,
        bio,
        isPrivate: typeof isPrivate === 'boolean' ? isPrivate : undefined,
      }
    });

    const serialized = {
      ...updated,
      is_private: updated.isPrivate,
      avatar_url: updated.avatarUrl,
      wallet_address: updated.walletAddress,
      primary_auth_method: updated.primaryAuthMethod,
      discord_id: updated.discordId,
      discord_username: updated.discordUsername,
      discord_global_name: updated.discordGlobalName,
      created_at: updated.createdAt,
      credits: updated.credits ? updated.credits.toString() : '0',
    };

    return Response.json(serialized);
  } catch (error) {
    console.error('Error updating profile:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = requireAuth(handler);
export const PUT = requireAuth(updateHandler);
