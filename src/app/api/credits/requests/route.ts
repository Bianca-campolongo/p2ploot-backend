import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Schema for creating credit request
const createRequestSchema = z.object({
    amount: z.number().positive().max(1000),
    reason: z.string().min(5, 'O motivo deve ter no mínimo 5 caracteres').max(1000),
});

// POST - Create new credit request
async function createHandler(req: NextRequest, user: any) {
    try {
        const body = await req.json();
        const data = createRequestSchema.parse(body);

        const request = await prisma.creditRequest.create({
            data: {
                userId: user.id,
                amount: data.amount,
                reason: data.reason,
                status: 'pending',
            },
        });

        return NextResponse.json({
            ...request,
            id: request.id.toString(),
            amount: request.amount.toString(),
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating credit request:', error);

        if (error instanceof z.ZodError) {
            const errorMessages = error.errors.map(e => e.message).join(', ');
            return NextResponse.json(
                { error: errorMessages || 'Dados inválidos' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET - List credit requests (admin/moderator with 'credits' panel sees all, user sees their own)
async function listHandler(req: NextRequest, user: any) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');

        // Check if user is admin or moderator with credit access
        const canSeeAll = user.role === 'admin' || (user.role === 'moderator' && user.panels?.includes('credits'));

        const where: any = {};

        // Non-privileged users can only see their own requests
        if (!canSeeAll) {
            where.userId = user.id;
        }

        // Filter by status if provided (admin/moderator usually filter by pending)
        if (status) {
            where.status = status;
        }

        const requests = await prisma.creditRequest.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Serialize BigInt
        const serialized = requests.map(r => ({
            ...r,
            id: r.id.toString(),
            userId: r.userId,
            amount: r.amount.toString(),
            created_at: r.createdAt.toISOString(),
        }));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Error listing credit requests:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export const POST = requireAuth(createHandler);
export const GET = requireAuth(listHandler);
