import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getFavoritesHandler(req: NextRequest, user: any) {
  try {
    const favorites = await prisma.userItemFavorite.findMany({
      where: { userId: user.id },
      select: { itemId: true }
    });
    
    return Response.json({
      favorites: favorites.map(f => f.itemId)
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function toggleFavoriteHandler(req: NextRequest, user: any) {
  try {
    const body = await req.json();
    const { itemId } = body;
    
    if (!itemId) {
      return Response.json({ error: 'itemId is required' }, { status: 400 });
    }
    
    const existing = await prisma.userItemFavorite.findUnique({
      where: {
        userId_itemId: {
          userId: user.id,
          itemId
        }
      }
    });

    if (existing) {
      await prisma.userItemFavorite.delete({
        where: { id: existing.id }
      });
      return Response.json({ status: 'removed', itemId });
    } else {
      await prisma.userItemFavorite.create({
        data: {
          userId: user.id,
          itemId
        }
      });
      return Response.json({ status: 'added', itemId });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = requireAuth(getFavoritesHandler);
export const POST = requireAuth(toggleFavoriteHandler);
