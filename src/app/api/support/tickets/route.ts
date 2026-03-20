import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Validation Scnema for Creating Ticket
const createTicketSchema = z.object({
    title: z.string().min(5, "Title too short").max(255),
    category: z.enum(['bug', 'account', 'billing', 'other']),
    message: z.string().min(10, "Message too short"), // Initial message
});

// GET - List My Tickets
async function getHandler(req: NextRequest, user: any) {
    try {
        const tickets = await prisma.supportTicket.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: {
                    select: { messages: true }
                }
            }
        });

        const serialized = tickets.map(ticket => ({
            ...ticket,
            user_id: ticket.userId,
            created_at: ticket.createdAt,
            updated_at: ticket.updatedAt,
            message_count: ticket._count.messages
        }));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create New Ticket
async function postHandler(req: NextRequest, user: any) {
    try {
        const body = await req.json();
        const data = createTicketSchema.parse(body);

        const ticket = await prisma.$transaction(async (tx) => {
            // Create Ticket
            const newTicket = await tx.supportTicket.create({
                data: {
                    userId: user.id,
                    title: data.title,
                    category: data.category,
                    status: 'open',
                }
            });

            // Create Initial Message
            await tx.supportTicketMessage.create({
                data: {
                    supportTicketId: newTicket.id,
                    senderId: user.id,
                    content: data.message,
                }
            });

            return newTicket;
        });

        return NextResponse.json({
            ...ticket,
            user_id: ticket.userId,
            created_at: ticket.createdAt,
            updated_at: ticket.updatedAt
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating ticket:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = requireAuth(getHandler);
export const POST = requireAuth(postHandler);
