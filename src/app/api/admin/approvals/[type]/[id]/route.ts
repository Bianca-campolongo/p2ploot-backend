import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, AuthUser } from '@/lib/auth';

const AD_CREATION_COST = 1;
const EVENT_CREATION_COST = 5;

// POST /api/admin/approvals/[type]/[id]
// Body: { action: 'approve' | 'reject', reason?: string }
async function handleApprovalAction(
    req: NextRequest, 
    user: AuthUser,
    { params }: { params: { type: string; id: string } }
) {
    try {
        const { type, id } = params;
        const { action, reason } = await req.json();

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (type === 'market') {
            return await handleMarketApproval(id, action, user.id, reason);
        } else if (type === 'event') {
            return await handleEventApproval(id, action, user.id, reason);
        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('[Admin Action] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

async function handleMarketApproval(id: string, action: string, adminId: string, reason?: string) {
    const adId = BigInt(id);
    
    const ad = await prisma.marketAd.findUnique({
        where: { id: adId },
        select: { userId: true, status: true, title: true }
    });

    if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    if (ad.status !== 'pending') return NextResponse.json({ error: 'Ad is not pending' }, { status: 400 });

    if (action === 'approve') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours (1 day)

        const updated = await prisma.marketAd.update({
            where: { id: adId },
            data: {
                status: 'active',
                approvedAt: new Date(),
                approvedById: adminId,
                expiresAt: expiresAt
            }
        });
        return NextResponse.json({ message: 'Approved', data: { ...updated, id: updated.id.toString() } });
    } else {
        // Reject & Refund
        const result = await prisma.$transaction(async (tx) => {
            // Update status
            const updated = await tx.marketAd.update({
                where: { id: adId },
                data: {
                    status: 'rejected',
                }
            });

            // Refund Credits
            const profile = await tx.profile.findUnique({ where: { id: ad.userId } });
            if (profile) {
                const newBalance = Number(profile.credits) + AD_CREATION_COST;
                await tx.profile.update({
                    where: { id: ad.userId },
                    data: { credits: newBalance }
                });

                // Log Refund
                await tx.creditTransaction.create({
                    data: {
                        userId: ad.userId,
                        amount: AD_CREATION_COST,
                        balanceAfter: newBalance,
                        transactionType: 'credit',
                        referenceType: 'ad_rejection_refund',
                        description: `Estorno por rejeição de anúncio: ${ad.title}${reason ? ` (Motivo: ${reason})` : ''}`
                    }
                });
            }

            return updated;
        });
        return NextResponse.json({ message: 'Rejected and refunded', data: { ...result, id: result.id.toString() } });
    }
}

async function handleEventApproval(id: string, action: string, adminId: string, reason?: string) {
    const event = await prisma.event.findUnique({
        where: { id },
        select: { organizerId: true, status: true, title: true }
    });

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (event.status !== 'pending') return NextResponse.json({ error: 'Event is not pending' }, { status: 400 });

    if (action === 'approve') {
        const updated = await prisma.event.update({
            where: { id },
            data: {
                status: 'upcoming',
                approvedAt: new Date(),
                approvedById: adminId,
            }
        });
        return NextResponse.json({ message: 'Approved', data: updated });
    } else {
        // Reject & Refund
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.event.update({
                where: { id },
                data: {
                    status: 'cancelled', // Or rejected? 
                }
            });

            // Refund Credits
            const profile = await tx.profile.findUnique({ where: { id: event.organizerId } });
            if (profile) {
                const newBalance = Number(profile.credits) + EVENT_CREATION_COST;
                await tx.profile.update({
                    where: { id: event.organizerId },
                    data: { credits: newBalance }
                });

                // Log Refund
                await tx.creditTransaction.create({
                    data: {
                        userId: event.organizerId,
                        amount: EVENT_CREATION_COST,
                        balanceAfter: newBalance,
                        transactionType: 'credit',
                        referenceType: 'event_rejection_refund',
                        description: `Estorno por rejeição de evento: ${event.title}${reason ? ` (Motivo: ${reason})` : ''}`
                    }
                });
            }

            return updated;
        });
        return NextResponse.json({ message: 'Rejected and refunded', data: result });
    }
}

export const POST = requireRole(['admin'])(handleApprovalAction);
