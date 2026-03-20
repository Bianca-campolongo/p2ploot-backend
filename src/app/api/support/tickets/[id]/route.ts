import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateStatusSchema = z.object({
    status: z.enum(['open', 'closed', 'resolved']),
});

// GET - Ticket Details
async function getHandler(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        const id = url.pathname.split('/').slice(-1)[0];

        const ticket = await prisma.supportTicket.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true
                    }
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                role: true,
                                avatarUrl: true
                            }
                        }
                    }
                }
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Check ownership (or admin)
        // Note: Admin check would require fetching user role from DB if not in `user` object properly, assuming `user` has role or we fetch it.
        // Ideally requireAuth populates user role or we check DB.
        // For now assuming user.id matching is enough for "my tickets".
        if (ticket.userId !== user.id) {
            // Check if admin (fetching profile to be safe)
            const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { role: true } });
            if (profile?.role !== 'admin' && profile?.role !== 'moderator') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const serialized = {
            ...ticket,
            user_id: ticket.userId,
            created_at: ticket.createdAt,
            updated_at: ticket.updatedAt,
            user: {
                ...ticket.user,
                avatar_url: ticket.user.avatarUrl
            },
            messages: ticket.messages.map(msg => ({
                ...msg,
                support_ticket_id: msg.supportTicketId,
                sender_id: msg.senderId,
                is_internal: msg.isInternal,
                created_at: msg.createdAt,
                sender: {
                    ...msg.sender,
                    avatar_url: msg.sender.avatarUrl
                }
            }))
        };

        return NextResponse.json(serialized);

    } catch (error) {
        console.error('Error fetching ticket:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH - Update Status (User can close, Admin can do all)
async function patchHandler(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        const id = url.pathname.split('/').slice(-1)[0];
        const body = await req.json();
        const data = updateStatusSchema.parse(body);

        const ticket = await prisma.supportTicket.findUnique({ where: { id } });
        if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

        // Auth check
        if (ticket.userId !== user.id) {
            // Admin check
            const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { role: true } });
            if (profile?.role !== 'admin' && profile?.role !== 'moderator') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const updated = await prisma.supportTicket.update({
            where: { id },
            data: { status: data.status }
        });

        return NextResponse.json({ success: true, status: updated.status });

    } catch (error) {
        console.error('Error updating ticket:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = requireAuth(getHandler);
export const PATCH = requireAuth(patchHandler);
