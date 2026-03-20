import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/profiles/me/ads - Get current user's market ads
async function getMyAds(req: NextRequest, user: any) {
    try {
        const ads = await prisma.marketAd.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        // Convert BigInt to string and format dates for JSON serialization
        const serializedAds = ads.map(ad => ({
            // Original camelCase
            ...ad,
            id: String(ad.id),
            price: ad.price ? Number(ad.price) : null,
            expiresAt: ad.expiresAt ? ad.expiresAt.toISOString() : null,
            createdAt: ad.createdAt ? ad.createdAt.toISOString() : null,
            updatedAt: ad.updatedAt ? ad.updatedAt.toISOString() : null,
            lastRenewedAt: ad.lastRenewedAt ? ad.lastRenewedAt.toISOString() : null,
            // Also include snake_case for frontend compatibility
            expires_at: ad.expiresAt ? ad.expiresAt.toISOString() : null,
            created_at: ad.createdAt ? ad.createdAt.toISOString() : null,
            image_url: ad.imageUrl,
            seller_address: ad.sellerAddress,
            user_id: ad.userId,
        }));

        return NextResponse.json({ ads: serializedAds });
    } catch (error) {
        console.error('Error fetching user ads:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest) => requireAuth(getMyAds)(req);
