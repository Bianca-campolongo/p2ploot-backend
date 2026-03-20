import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/events/[id] - Get event details
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const event = await prisma.event.findUnique({
            where: { id: params.id },
            include: {
                organizer: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                        reputationScore: true,
                    }
                }
            }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Error fetching event:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Handler para DELETE
async function deleteEventHandler(
    req: NextRequest,
    user: AuthUser,
    context: { params: { id: string } }
) {
    try {
        const { id } = context.params;

        const event = await prisma.event.findUnique({
            where: { id },
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Check ownership (only organizer or admin can delete)
        if (event.organizerId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.event.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting event:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Handler para PUT (Edit Event)
async function updateEventHandler(
    req: NextRequest,
    user: AuthUser,
    context: { params: { id: string } }
) {
    try {
        const { id } = context.params;
        const data = await req.json();

        const event = await prisma.event.findUnique({
            where: { id },
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Check ownership (only organizer or admin can edit)
        if (event.organizerId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { title, description, game, eventDate, location, prizePool, imageUrl, status } = data;

        const updated = await prisma.event.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(description && { description }),
                ...(game && { game }),
                ...(eventDate && { eventDate: new Date(eventDate) }),
                ...(location !== undefined && { location }),
                ...(prizePool !== undefined && { prizePool }),
                ...(imageUrl !== undefined && { imageUrl }),
                ...(status && { status }),
            },
            include: {
                organizer: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    }
                }
            }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Export handlers
export const DELETE = requireAuth(deleteEventHandler);
export const PUT = requireAuth(updateEventHandler);
