import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const renewSchema = z.object({
    days: z.number().int().min(1).max(365)
});

async function renewAd(req: NextRequest, user: any) {
    try {
        // Extract ID from URL since requireAuth doesn't pass context
        // URL format: /api/ads/[id]/renew
        const urlParts = req.nextUrl.pathname.split('/');
        // parts: ['', 'api', 'ads', '123', 'renew']
        const adId = urlParts[urlParts.length - 2];
        const body = await req.json();

        const validation = renewSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const { days } = validation.data;
        const cleanAdId = adId.replace('db-', '');

        // 1. Find the ad and verify ownership
        const ad = await prisma.marketAd.findUnique({
            where: { id: BigInt(cleanAdId) }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Anúncio não encontrado' }, { status: 404 });
        }

        if (ad.userId !== user.id) {
            return NextResponse.json({ error: 'Você não tem permissão para renovar este anúncio' }, { status: 403 });
        }

        // 2. Calculate cost
        const RENEWAL_COST_PER_DAY = 0;
        const cost = days * RENEWAL_COST_PER_DAY;

        if (cost <= 0) {
            const now = new Date();
            let newExpiresAt = new Date(ad.expiresAt || now);

            if (newExpiresAt < now) {
                newExpiresAt = now;
            }

            newExpiresAt.setDate(newExpiresAt.getDate() + days);

            const result = await prisma.marketAd.update({
                where: { id: ad.id },
                data: {
                    expiresAt: newExpiresAt,
                    lastRenewedAt: now,
                    status: 'active'
                }
            });

            return NextResponse.json({
                success: true,
                ad: {
                    ...result,
                    id: result.id.toString(),
                    expiresAt: result.expiresAt?.toISOString(),
                    lastRenewedAt: result.lastRenewedAt?.toISOString()
                },
                message: `Anuncio renovado por ${days} dias.`
            });
        }

        // 3. Transaction: Check balance, debit, update ad
        const result = await prisma.$transaction(async (tx) => {
            // Check Profile Balance
            const profile = await tx.profile.findUnique({
                where: { id: user.id }
            });

            if (!profile || Number(profile.credits) < cost) {
                throw new Error('Insufficient credits');
            }

            // Debit Credits
            const newBalance = Number(profile.credits) - cost;
            await tx.profile.update({
                where: { id: user.id },
                data: { credits: newBalance }
            });

            // Log Transaction
            await tx.creditTransaction.create({
                data: {
                    userId: user.id,
                    amount: -cost,
                    balanceAfter: newBalance,
                    transactionType: 'debit',
                    referenceType: 'ad_renewal',
                    description: `Renovação de anúncio (${days} dias): ${ad.title}`
                }
            });

            // Update Ad Expiration
            // If expired, start from now. If active, add to current expiresAt.
            const now = new Date();
            let newExpiresAt = new Date(ad.expiresAt || now);

            if (newExpiresAt < now) {
                newExpiresAt = now;
            }

            newExpiresAt.setDate(newExpiresAt.getDate() + days);

            const updatedAd = await tx.marketAd.update({
                where: { id: ad.id },
                data: {
                    expiresAt: newExpiresAt,
                    lastRenewedAt: now,
                    status: 'active' // Reactivate if it was expired/inactive
                }
            });

            return updatedAd;
        });

        return NextResponse.json({
            success: true,
            ad: {
                ...result,
                id: result.id.toString(),
                expiresAt: result.expiresAt?.toISOString(),
                lastRenewedAt: result.lastRenewedAt?.toISOString()
            },
            message: `Anúncio renovado por ${days} dias.`
        });

    } catch (error: any) {
        console.error('[API] Error renewing ad:', error);
        if (error.message === 'Insufficient credits') {
            return NextResponse.json({ error: 'Saldo insuficiente para renovar anúncio.' }, { status: 402 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(renewAd)(req);
