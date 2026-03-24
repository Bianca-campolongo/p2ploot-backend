import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// GET /api/ads/[id] - Get ad details
async function getAd(req: NextRequest, user: any, params: { id: string }) {
    try {
        const adId = BigInt(params.id);

        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            include: {
                user: {
                    select: { id: true, username: true }
                }
            }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        return NextResponse.json({
            ad: {
                ...ad,
                id: String(ad.id),
                price: ad.price ? Number(ad.price) : null,
                expiresAt: ad.expiresAt?.toISOString() || null,
                createdAt: ad.createdAt.toISOString(),
                updatedAt: ad.updatedAt.toISOString(),
                // snake_case for frontend
                expires_at: ad.expiresAt?.toISOString() || null,
                created_at: ad.createdAt.toISOString(),
                image_url: ad.imageUrl,
                user_id: ad.userId,
                seller_address: ad.sellerAddress,
            }
        });
    } catch (error) {
        console.error('Error fetching ad:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT /api/ads/[id] - Update ad
const updateAdSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    currency: z.string().optional(),
    game: z.string().optional(),
    server: z.string().optional(),
    region: z.string().optional(),
    type: z.string().optional(),
    images: z.array(z.string()).optional(),
});

async function updateAd(req: NextRequest, user: any, params: { id: string }) {
    try {
        const adId = BigInt(params.id);
        const body = await req.json();
        const data = updateAdSchema.parse(body);

        // Verify ownership
        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            select: { userId: true, status: true }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        if (ad.userId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const isPending = ad.status === 'pending';

        // Build update object
        const updateData: any = {};
        
        // Fields allowed ALWAYS (Predefined system fields or Price)
        if (data.price !== undefined) updateData.price = data.price;
        if (data.currency !== undefined) updateData.currency = data.currency;
        if (data.game !== undefined) updateData.game = data.game;
        if (data.server !== undefined) updateData.server = data.server;
        if (data.region !== undefined) updateData.region = data.region;
        if (data.type !== undefined) updateData.type = data.type;

        // Fields allowed ONLY if pending (Freestyle text or images)
        if (isPending) {
            if (data.title !== undefined) updateData.title = data.title;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.images !== undefined) {
                updateData.imageUrl = data.images[0] || null;
            }
        }

        await prisma.marketAd.update({
            where: { id: adId },
            data: updateData
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating ad:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/ads/[id] - Delete ad
async function deleteAd(req: NextRequest, user: any, params: { id: string }) {
    try {
        const adId = BigInt(params.id);

        // Fetch user role
        const requester = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { role: true }
        });

        // Verify ownership
        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            select: { userId: true }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        const isAdmin = requester?.role === 'admin';
        if (ad.userId !== user.id && !isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.marketAd.delete({
            where: { id: adId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting ad:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => getAd(r, user, context.params))(req);

export const PUT = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateAd(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteAd(r, user, context.params))(req);
