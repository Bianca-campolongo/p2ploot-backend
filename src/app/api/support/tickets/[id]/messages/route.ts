import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({
    content: z.string().min(1, "Message empty"),
});

async function postHandler(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        // path is /api/support/tickets/[id]/messages
        const pathParts = url.pathname.split('/');
        const ticketId = pathParts[pathParts.length - 2];

        const body = await req.json();
        const data = messageSchema.parse(body);

        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

        // Check permissions
        let isAdmin = false;
        if (ticket.userId !== user.id) {
            const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { role: true } });
            if (profile?.role !== 'admin' && profile?.role !== 'moderator') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
            isAdmin = true;
        }

        // Create Message
        const message = await prisma.supportTicketMessage.create({
            data: {
                supportTicketId: ticketId,
                senderId: user.id,
                content: data.content,
                isInternal: false // For now defaulting to public
            },
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
        });

        // If admin replies, maybe update status to 'in_progress' or 'resolved'? 
        // If user replies, maybe update to 'open'?
        // Keeping simple for now, relying on explicit status changes.

        return NextResponse.json({
            ...message,
            support_ticket_id: message.supportTicketId,
            sender_id: message.senderId,
            is_internal: message.isInternal,
            created_at: message.createdAt,
            sender: {
                ...message.sender,
                avatar_url: message.sender.avatarUrl
            }
        });

    } catch (error) {
        console.error('Error sending message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = requireAuth(postHandler);
