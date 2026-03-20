import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const reactivateSchema = z.object({
    durationMonths: z.number().int().min(1).max(12),
});

const BASE_PRICE = 39.90;
const PLANS = [
    { months: 1, discount: 0 },
    { months: 3, discount: 0.10 },
    { months: 6, discount: 0.15 },
    { months: 12, discount: 0.17 }
];

async function reactivateGuild(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const { durationMonths } = reactivateSchema.parse(body);

        // Calculate Cost
        const plan = PLANS.find(p => p.months === durationMonths);
        if (!plan) return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });

        const rawTotal = BASE_PRICE * plan.months;
        const discountAmount = rawTotal * plan.discount;
        const totalCost = Number((rawTotal - discountAmount).toFixed(2));

        // Transaction: Check Balance -> Deduct -> Update Guild -> Record Transaction
        await prisma.$transaction(async (tx) => {
            // 1. Get Profile (for fresh credits)
            const profile = await tx.profile.findUnique({
                where: { id: user.id }
            });

            if (!profile) throw new Error('User profile not found');
            const currentCredits = Number(profile.credits);

            if (currentCredits < totalCost) throw new Error('Insufficient credits');

            // 2. Get Guild
            const guild = await tx.guild.findUnique({
                where: { id: guildId },
                select: { ownerId: true, accessExpiresAt: true }
            });

            if (!guild) throw new Error('Guild not found');
            if (guild.ownerId !== user.id) throw new Error('Not authorized');

            // 3. Deduct Credits
            const newBalance = currentCredits - totalCost;

            await tx.profile.update({
                where: { id: user.id },
                data: {
                    credits: newBalance
                }
            });

            // 4. Update Guild Expiry
            const now = new Date();
            const currentExpiry = guild.accessExpiresAt ? new Date(guild.accessExpiresAt) : now;
            const baseDate = currentExpiry > now ? currentExpiry : now;
            const newExpiry = new Date(baseDate);
            newExpiry.setMonth(newExpiry.getMonth() + durationMonths);

            await tx.guild.update({
                where: { id: guildId },
                data: {
                    accessExpiresAt: newExpiry
                }
            });

            // 5. Create Transaction Record
            await tx.creditTransaction.create({
                data: {
                    amount: -totalCost,
                    balanceAfter: newBalance,
                    transactionType: 'PURCHASE',
                    referenceType: 'GUILD_REACTIVATION',
                    referenceId: guildId,
                    description: `Guild Premium Activation (${durationMonths} months)`,
                    userId: user.id
                }
            });
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error reactivating guild:', error);
        const msg = error.message || 'Internal server error';
        if (msg === 'Insufficient credits' || msg === 'Invalid duration') return NextResponse.json({ error: msg }, { status: 400 });
        if (msg === 'Not authorized') return NextResponse.json({ error: msg }, { status: 403 });
        if (msg === 'Guild not found') return NextResponse.json({ error: msg }, { status: 404 });

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => reactivateGuild(r, user, context.params))(req);
