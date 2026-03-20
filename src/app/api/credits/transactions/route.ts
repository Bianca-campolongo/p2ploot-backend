import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function listHandler(req: NextRequest, user: any) {
    try {
        const transactions = await prisma.creditTransaction.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                userId: true,
                amount: true,
                transactionType: true,
                description: true,
                balanceAfter: true,
                referenceType: true,
                referenceId: true,
                createdAt: true,
            }
        });

        // Serialize BigInt and Decimal carefully
        const serialized = transactions.map(t => ({
            id: t.id.toString(),
            userId: t.userId,
            amount: t.amount.toString(),
            transaction_type: t.transactionType,
            transactionType: t.transactionType,
            description: t.description,
            balance_after: t.balanceAfter.toString(),
            balanceAfter: t.balanceAfter.toString(),
            reference_id: t.referenceId ? t.referenceId.toString() : null,
            referenceId: t.referenceId ? t.referenceId.toString() : null,
            created_at: t.createdAt.toISOString(),
            createdAt: t.createdAt,
        }));

        console.log(`[GET /api/credits/transactions] Returning ${serialized.length} transactions`);
        return Response.json(serialized);
    } catch (error: any) {
        console.error('Error fetching credit transactions:', error);
        return Response.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

export const GET = requireAuth(listHandler);
