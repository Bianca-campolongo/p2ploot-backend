import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAuth, AuthUser } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

// GET /api/events - List all upcoming events
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const game = searchParams.get('game');
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

        console.log('[API] Fetching events...');

        const whereClause: any = {
            status: { in: ['upcoming', 'ongoing'] },
            approvedAt: { not: null },
            eventDate: {
                gte: new Date(),
            }
        };

        if (game && game !== 'all') {
            whereClause.game = game;
        }

        const events = await prisma.event.findMany({
            where: whereClause,
            orderBy: {
                eventDate: 'asc',
            },
            take: limit,
            include: {
                organizer: {
                    select: {
                        username: true,
                        avatarUrl: true,
                        reputationScore: true,
                    }
                }
            }
        });

        return NextResponse.json(deepSerialize(events));
    } catch (error: any) {
        console.error('Error fetching events:', error);
        return NextResponse.json({
            error: 'Internal Server Error'
        }, { status: 500 });
    }
}

// Handler para POST (Create Event)
async function createEventHandler(req: NextRequest, user: AuthUser) {
    const EVENT_COST = 5;

    try {
        const data = await req.json();
        const { title, description, game, category, eventMode, eventDate, location, prizePool, imageUrl } = data;

        console.log('[API] Creating event for user:', user.id);

        if (!title || !eventDate || !game) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check user credits
        const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { credits: true }
        });

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const currentCredits = Number(profile.credits);
        if (currentCredits < EVENT_COST) {
            return NextResponse.json({
                error: 'Insufficient credits',
                message: `Você precisa de ${EVENT_COST} créditos para criar um evento. Saldo atual: ${currentCredits} créditos.`,
                required: EVENT_COST,
                current: currentCredits
            }, { status: 402 });
        }

        // Use transaction to create event and deduct credits
        const result = await prisma.$transaction(async (tx) => {
            // Deduct credits
            await tx.profile.update({
                where: { id: user.id },
                data: { credits: { decrement: EVENT_COST } }
            });

            // Create event
            const event = await tx.event.create({
                data: {
                    title,
                    description,
                    game,
                    category: category || 'other',
                    eventMode: eventMode || 'online',
                    eventDate: new Date(eventDate),
                    location,
                    prizePool,
                    imageUrl,
                    organizerId: user.id,
                    status: 'pending'
                },
            });

            return event;
        });

        return NextResponse.json(deepSerialize(result), { status: 201 });
    } catch (error: any) {
        console.error('Error creating event:', error);
        return NextResponse.json({
            error: 'Internal Server Error'
        }, { status: 500 });
    }
}

// Export POST wrapped with requireAuth
export const POST = requireAuth(createEventHandler);
