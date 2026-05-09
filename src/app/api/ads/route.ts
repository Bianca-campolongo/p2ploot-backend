import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';
import { calculateReputation } from '@/lib/reputation';

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
                        discordCreatedAt: true,
                        guildMembers: {
                            select: {
                                role: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const serializedAds = ads.map(ad => {
            const base = deepSerialize(ad);
            const userReputation = calculateReputation(ad.user);
            
            return {
                ...base,
                user: {
                    ...base.user,
                    reputationScore: userReputation.score
                },
                // Ensure snake_case fields for frontend compatibility
                expires_at: base.expiresAt,
                created_at: base.createdAt,
                image_url: base.imageUrl,
                user_id: base.userId,
                seller_address: base.sellerAddress,
                delivery_window_hours: base.deliveryWindowHours,
                cloak_seller_privacy_enabled: base.cloakSellerPrivacyEnabled,
                images: base.imageUrl ? [base.imageUrl] : []
            };
        });

        return NextResponse.json(deepSerialize(serializedAds));
    } catch (error: any) {
        console.error('Error fetching ads:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    deliveryWindowHours: z.coerce.number().int().min(1).max(72).optional(),
    delivery_window_hours: z.coerce.number().int().min(1).max(72).optional(),
    cloakSellerPrivacyEnabled: z.coerce.boolean().optional(),
    cloak_seller_privacy_enabled: z.coerce.boolean().optional(),
    status: z.string().optional(),
    expires_at: z.string().optional(),
    last_renewed_at: z.string().optional()
});

async function createAd(req: NextRequest, user: any) {
    const AD_CREATION_COST = 0;
    try {
        const body = await req.json();
        const data = createAdSchema.parse(body);

        if (AD_CREATION_COST <= 0) {
            const deliveryWindowHours = data.deliveryWindowHours ?? data.delivery_window_hours ?? 24;
            const cloakSellerPrivacyEnabled = data.cloakSellerPrivacyEnabled ?? data.cloak_seller_privacy_enabled ?? false;
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
                    deliveryWindowHours,
                    cloakSellerPrivacyEnabled,
                    status: 'pending',
                    sellerAddress: user.walletAddress,
                    expiresAt: null,
                    lastRenewedAt: new Date(),
                }
            });

            const base = deepSerialize(ad);
            return NextResponse.json(deepSerialize({
                ...base,
                image_url: base.imageUrl,
                user_id: base.userId,
                delivery_window_hours: base.deliveryWindowHours,
                cloak_seller_privacy_enabled: base.cloakSellerPrivacyEnabled,
                images: base.imageUrl ? [base.imageUrl] : []
            }));
        }

        // Transaction: Debit credits AND Create Ad
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check & Debit Credits
            const profile = await tx.profile.findUnique({
                where: { id: user.id }
            });

            if (!profile) throw new Error('User not found');
            if (Number(profile.credits) < AD_CREATION_COST) {
                throw new Error('Insufficient credits');
            }

            // Debit
            const newBalance = Number(profile.credits) - AD_CREATION_COST;
            await tx.profile.update({
                where: { id: user.id },
                data: { credits: newBalance }
            });

            // Log Transaction
            await tx.creditTransaction.create({
                data: {
                    userId: user.id,
                    amount: -AD_CREATION_COST,
                    balanceAfter: newBalance,
                    transactionType: 'debit',
                    referenceType: 'ad_creation',
                    description: `Criação de anúncio: ${data.title}`
                }
            });

            // 2. Create Ad
            const deliveryWindowHours = data.deliveryWindowHours ?? data.delivery_window_hours ?? 24;
            const cloakSellerPrivacyEnabled = data.cloakSellerPrivacyEnabled ?? data.cloak_seller_privacy_enabled ?? false;
            const ad = await tx.marketAd.create({
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
                    deliveryWindowHours,
                    cloakSellerPrivacyEnabled,
                    status: 'pending',
                    sellerAddress: user.walletAddress,
                    expiresAt: null, // Only set upon approval
                    lastRenewedAt: new Date(),
                }
            });

            return ad;
        });

        const base = deepSerialize(result);
        return NextResponse.json(deepSerialize({
            ...base,
            image_url: base.imageUrl,
            user_id: base.userId,
            delivery_window_hours: base.deliveryWindowHours,
            cloak_seller_privacy_enabled: base.cloakSellerPrivacyEnabled,
            images: base.imageUrl ? [base.imageUrl] : []
        }));
    } catch (error: any) {
        console.error('Error creating ad:', error);
        if (error.message === 'Insufficient credits') {
            return NextResponse.json({ error: 'Saldo insuficiente para criar anúncio.' }, { status: 402 });
        }
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(createAd)(req);


