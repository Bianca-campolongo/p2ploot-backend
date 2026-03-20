import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: any) {
    try {
        // Check Admin
        const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { role: true },
        });

        if (profile?.role !== 'admin' && profile?.role !== 'moderator') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');

        const where: any = {};
        if (status && status !== 'all') {
            where.status = status;
        }

        const tickets = await prisma.supportTicket.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                user: {
                    select: { username: true, email: true }
                },
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
        console.error('Error fetching admin tickets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = requireAuth(handler);
