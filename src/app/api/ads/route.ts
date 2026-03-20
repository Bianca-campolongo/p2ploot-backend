import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

// GET /api/ads - List ads with filters
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const game = searchParams.get('game');
        const region = searchParams.get('region');
        const server = searchParams.get('server');
        const type = searchParams.get('type');
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        const search = searchParams.get('search');
        const sellerId = searchParams.get('sellerId');

        const where: any = {
            status: 'active',
            expiresAt: { gt: new Date() }
        };

        if (game) where.game = game;
        if (region) where.region = region;
        if (server) where.server = server;
        if (type) where.type = type;
        if (sellerId) where.userId = sellerId;

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = Number(minPrice);
            if (maxPrice) where.price.lte = Number(maxPrice);
        }

        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } }
            ];
        }

        const ads = await prisma.marketAd.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                        reputationScore: true,
                        discordCreatedAt: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const serializedAds = ads.map(ad => {
            const base = deepSerialize(ad);
            return {
                ...base,
                // Ensure snake_case fields for frontend compatibility
                expires_at: base.expiresAt,
                created_at: base.createdAt,
                image_url: base.imageUrl,
                user_id: base.userId,
                seller_address: base.sellerAddress,
                images: base.imageUrl ? [base.imageUrl] : []
            };
        });

        return NextResponse.json(serializedAds);
    } catch (error: any) {
        console.error('Error fetching ads:', error);
        return NextResponse.json(
            { error: 'Internal server error' }, 
            { status: 500 }
        );
    }
}

// POST /api/ads - Create new ad
const createAdSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    currency: z.string().optional(),
    game: z.string().optional(),
    server: z.string().optional(),
    region: z.string().optional(),
    type: z.string().optional(),
    images: z.array(z.string()).optional(),
    imageUrl: z.string().optional().nullable(),
    status: z.string().optional(),
    expires_at: z.string().optional(),
    last_renewed_at: z.string().optional()
});

async function createAd(req: NextRequest, user: any) {
    try {
        const body = await req.json();
        const data = createAdSchema.parse(body);

        // Calculate expiration if not provided (default 30 days)
        const expiresAt = data.expires_at ? new Date(data.expires_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const ad = await prisma.marketAd.create({
            data: {
                userId: user.id,
                title: data.title,
                description: data.description || '',
                price: data.price,
                currency: data.currency,
                game: data.game,
                server: data.server,
                region: data.region,
                type: data.type,
                imageUrl: data.images?.[0] || data.imageUrl || null,
                status: 'active',
                sellerAddress: user.walletAddress,
                expiresAt,
                lastRenewedAt: new Date(),
            }
        });

        const base = deepSerialize(ad);
        return NextResponse.json({
            ...base,
            image_url: base.imageUrl,
            user_id: base.userId,
            images: base.imageUrl ? [base.imageUrl] : []
        });
    } catch (error: any) {
        console.error('Error creating ad:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(createAd)(req);


