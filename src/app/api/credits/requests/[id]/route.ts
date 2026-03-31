import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Schema for updating credit request (approve/reject)
const updateRequestSchema = z.object({
    status: z.enum(['approved', 'rejected']),
    adminNote: z.string().optional(),
});

// PUT - Approve or reject credit request (admin or moderator with 'credits' panel)
async function updateHandler(req: NextRequest, user: any) {
    try {
        // Check if user is admin or moderator with credit access
        const canManage = user.role === 'admin' || (user.role === 'moderator' && user.panels?.includes('credits'));

        if (!canManage) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin or Credit Moderator access required' },
                { status: 403 }
            );
        }

        // Extract request ID from URL
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const requestIdStr = pathParts[pathParts.indexOf('requests') + 1];
        const requestId = BigInt(requestIdStr);

        const body = await req.json();
        const data = updateRequestSchema.parse(body);

        // Find the request
        const creditRequest = await prisma.creditRequest.findUnique({
            where: { id: requestId },
            include: { user: true },
        });

        if (!creditRequest) {
            return NextResponse.json(
                { error: 'Credit request not found' },
                { status: 404 }
            );
        }

        if (creditRequest.status !== 'pending') {
            return NextResponse.json(
                { error: 'Request already processed' },
                { status: 400 }
            );
        }

        // Update request in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update the request
            const updatedRequest = await tx.creditRequest.update({
                where: { id: requestId },
                data: {
                    status: data.status,
                    reviewedBy: user.id,
                    reviewedAt: new Date(),
                    adminNote: data.adminNote,
                },
            });

            // If approved, add credits to user
            if (data.status === 'approved') {
                const currentCredits = creditRequest.user.credits.toNumber();
                const newBalance = currentCredits + creditRequest.amount.toNumber();

                await tx.profile.update({
                    where: { id: creditRequest.userId },
                    data: { credits: newBalance },
                });

                // Record transaction
                await tx.creditTransaction.create({
                    data: {
                        userId: creditRequest.userId,
                        amount: creditRequest.amount,
                        balanceAfter: newBalance,
                        transactionType: 'credit',
                        referenceType: 'credit_request',
                        referenceId: requestId,
                        description: `Credit request approved: ${creditRequest.reason?.substring(0, 100)}`,
                    },
                });
            }

            return updatedRequest;
        });

        return NextResponse.json({
            ...result,
            id: result.id.toString(),
            amount: result.amount.toString(),
        });
    } catch (error) {
        console.error('Error updating credit request:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request data', details: error.errors },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET - Get single credit request with message history
async function getHandler(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const requestIdStr = pathParts[pathParts.indexOf('requests') + 1];
        const requestId = BigInt(requestIdStr);

        // Fetch basic info first
        const creditRequest = await prisma.creditRequest.findUnique({
            where: { id: requestId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        if (!creditRequest) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        console.log(`[API] Fetching Credit Request ${requestId}: status="${creditRequest.status}"`);

        // Defensive message fetching
        let messages: any[] = [];
        try {
            // Check if messages relation exists on the model
            // @ts-ignore
            if (prisma.creditRequestMessage) {
                // @ts-ignore
                messages = await prisma.creditRequestMessage.findMany({
                    where: { creditRequestId: requestId },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                                role: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                });
            } else {
                // Raw SQL fallback
                console.warn('[API] Prisma model missing for read, using raw query');
                // @ts-ignore
                const rawMessages = await prisma.$queryRaw`
                    SELECT * FROM \`credit_request_messages\`
                    WHERE \`credit_request_id\` = ${requestId}
                    ORDER BY \`created_at\` ASC
                `;

                if (rawMessages && Array.isArray(rawMessages)) {
                    // Fetch senders manually
                    messages = await Promise.all(rawMessages.map(async (msg: any) => {
                        const sender = await prisma.profile.findUnique({
                            where: { id: msg.sender_id },
                            select: { id: true, username: true, email: true, role: true }
                        });
                        return {
                            ...msg,
                            sender,
                            creditRequestId: msg.credit_request_id, // Map snake_case to camelCase
                            senderId: msg.sender_id,
                            createdAt: msg.created_at
                        };
                    }));
                }
            }
        } catch (msgError: any) {
            console.warn(`[API] Could not fetch messages:`, msgError.message);
        }

        // Check if user is owner or privileged (admin/moderator with credit access)
        const canSeeDetailed = creditRequest.userId === user.id || 
                             user.role === 'admin' || 
                             (user.role === 'moderator' && user.panels?.includes('credits'));

        if (!canSeeDetailed) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            ...creditRequest,
            id: creditRequest.id.toString(),
            amount: creditRequest.amount.toString(),
            messages: messages.map((m: any) => ({
                ...m,
                id: m.id.toString(),
                creditRequestId: m.creditRequestId.toString(),
            })),
        });
    } catch (error) {
        console.error('Error fetching credit request:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const PUT = requireAuth(updateHandler);
export const GET = requireAuth(getHandler);
