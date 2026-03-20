import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const adSchema = z.object({
    user_id: z.string().min(1, "User ID is required"),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().optional(),
    game: z.string().optional(),
    region: z.string().optional(),
    type: z.string().optional(),
    server: z.string().optional(),
    seller_address: z.string().optional(),
    image_url: z.string().nullable().optional(),
    images: z.array(z.string()).optional(),
    expires_at: z.string().optional(),
    last_renewed_at: z.string().optional(),
});

function serializeAd(ad: any) {
    return {
        ...ad,
        id: ad.id.toString(),
        adId: ad.adId ? ad.adId.toString() : undefined, // if related to other tables
        price: ad.price ? Number(ad.price) : null,
        // Include user if fetched
        user: ad.user ? {
            id: ad.user.id,
            username: ad.user.username,
            avatar_url: ad.user.avatarUrl
        } : undefined
    };
}

export async function GET() {
    try {
        const ads = await prisma.marketAd.findMany({
            where: {
                status: 'active',
                expiresAt: { gt: new Date() }
            },
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true
                    }
                }
            }
        });

        const serializedAds = ads.map(serializeAd);
        return NextResponse.json(serializedAds);
    } catch (error: any) {
        console.error('[API] Error fetching market ads:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[API] Creating Market Ad:', body);

        const validation = adSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;
        const AD_CREATION_COST = 1;

        // Transaction: Debit credits AND Create Ad
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check & Debit Credits
            const user = await tx.profile.findUnique({
                where: { id: data.user_id }
            });

            if (!user) throw new Error('User not found');
            if (Number(user.credits) < AD_CREATION_COST) {
                throw new Error('Insufficient credits');
            }

            // Debit
            const newBalance = Number(user.credits) - AD_CREATION_COST;
            await tx.profile.update({
                where: { id: data.user_id },
                data: { credits: newBalance }
            });

            // Log Transaction (optional but recommended)
            await tx.creditTransaction.create({
                data: {
                    userId: data.user_id,
                    amount: -AD_CREATION_COST,
                    balanceAfter: newBalance,
                    transactionType: 'debit',
                    referenceType: 'ad_creation',
                    description: `Criação de anúncio: ${data.title}`
                }
            });

            // 2. Create Ad
            const newAd = await tx.marketAd.create({
                data: {
                    userId: data.user_id,
                    title: data.title,
                    description: data.description,
                    price: data.price,
                    currency: data.currency,
                    game: data.game,
                    region: data.region,
                    type: data.type,
                    server: data.server,
                    imageUrl: data.image_url || null,
                    sellerAddress: data.seller_address || data.user_id, // Default to user_id if generic
                    status: 'active',
                    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
                    lastRenewedAt: data.last_renewed_at ? new Date(data.last_renewed_at) : undefined,
                    // Note: MarketAd model in schema might not have 'images' or 'imageUrl' fields exactly as passed? 
                    // Checking schema: imageUrl and images (no images array column in schema, only imageUrl?)
                    // Schema check: MarketAd has NO image_url or images column! 
                    // WAIT: I saw schema earlier. Let me double check schema usage in frontend.
                    // Frontend uses: images: [coverImage], image_url: coverImage.
                    // Schema `model MarketAd` has `userId`, `title`, ..., `sellerAddress`. 
                    // IT DOES NOT HAVE IMAGE FIELDS IN THE SCHEMA I SAW EARLIER!
                    // I need to check schema again or ignore image for now/add it. 
                    // Let's assume schema needs update or I missed it.
                    // RE-READING SCHEMA FROM CONTEXT:
                    /*
                    model MarketAd {
                      id            BigInt    @id @default(autoincrement())
                      ...
                      // NO IMAGE FIELD!
                    }
                    */
                    // Ok, I need to add image field to MarketAd or use 'description' to store it? 
                    // Or creates mismatch.
                    // For now, I will omit image saving to DB to avoid crash, OR I should add it to schema.
                    // The user wants it to work. I should probably add imageUrl to MarketAd schema.
                    // BUT modifying schema requires restart. 
                    // Let's check if I can piggyback on description or if I should do schema push again.
                    // The user just did a schema push for GAMES. 
                    // If I fail here due to schema, valuable time lost.
                    // I'll proceed without image persistence in DB column for this step, or check if I can add it quickly.
                    // Actually, let's look at `GameItem` or others.
                    // Wait, frontend `CreateAdModal` sends `images` and `image_url`.
                    // If I don't save it, images won't show.
                    // I will verify schema one more time in next step before finalizing this file.
                }
            });

            return newAd;
        });

        return NextResponse.json(serializeAd(result), { status: 201 });

    } catch (error: any) {
        console.error('[API] Error creating market ad:', error);
        if (error.message === 'Insufficient credits') {
            return NextResponse.json({ error: 'Saldo insuficiente para criar anúncio.' }, { status: 402 });
        }
        return NextResponse.json({ error: `Internal Server Error: ${error.message} \nStack: ${error.stack}` }, { status: 500 });
    }
}
