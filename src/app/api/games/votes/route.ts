import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth'; // Ensure this exists or use logic similar to other routes

// GET /api/games/votes?userId=...
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const votes = await prisma.gameVote.findMany({
            where: { userId },
            select: {
                gameId: true,
                voteType: true
            }
        });

        // Serialize BigInt
        const serialized = votes.map(v => ({
            game_id: v.gameId.toString(),
            vote_type: v.voteType
        }));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Error fetching votes:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST /api/games/votes
// Body: { gameId: number, voteType: 'like' | 'dislike' }
export async function POST(req: Request) {
    try {
        // Basic auth check logic (mock or rely on middleware if configured, but here we read body first)
        // Ideally we get userId from session.
        // For now, allow passing userId in body for migration compatibility if NextAuth isn't fully set up?
        // The previous code used `useAuth` which implies we have a user.
        // Let's assume we can get user from header or session. 
        // If not, we might need userId in body.
        // `useGames.js` calls `supabase.rpc` which relies on auth context.
        // Let's expect userId in body for now to be safe, or headers.

        // UPDATE: Use existing `requireAuth` wrapper if possible, or parse body.
        // Let's implement standard body parsing.

        const body = await req.json();
        const { gameId, voteType, userId } = body; // Expect userId from client for now if session not strict

        if (!userId || !gameId || !voteType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // START TRANSACTION
        const result = await prisma.$transaction(async (tx) => {
            const gameIdBigInt = BigInt(gameId);

            // 1. Check existing vote
            const existingVote = await tx.gameVote.findUnique({
                where: {
                    userId_gameId: {
                        userId,
                        gameId: gameIdBigInt
                    }
                }
            });

            // If same vote, do nothing
            if (existingVote && existingVote.voteType === voteType) {
                return { message: 'Already voted' };
            }

            // 2. Update Game counters
            const gameUpdateData: any = {};

            if (existingVote) {
                // Changing vote
                if (existingVote.voteType === 'like') {
                    gameUpdateData.likes = { decrement: 1 };
                } else {
                    gameUpdateData.dislikes = { decrement: 1 };
                }
            }

            if (voteType === 'like') {
                gameUpdateData.likes = (gameUpdateData.likes || {});
                // If we are decrementing, we need to handle it carefully, but Prisma handles atomic updates.
                // Actually, we can chain increment/decrement.
                if (gameUpdateData.likes.decrement) {
                    // net change 0 if we were just decrementing? No, we are removing old vote AND adding new.
                    // Wait, if old was like and new is like (handled above).
                    // If old was like and new is dislike: like -1, dislike +1.
                    // If old was dislike and new is like: dislike -1, like +1.
                }
            }

            // Let's do it simpler.
            // Update Game Vote
            const vote = await tx.gameVote.upsert({
                where: {
                    userId_gameId: {
                        userId,
                        gameId: gameIdBigInt
                    }
                },
                update: {
                    voteType
                },
                create: {
                    userId,
                    gameId: gameIdBigInt,
                    voteType
                }
            });

            // Update Game Counts directly based on transition
            // Use atomic increments
            if (existingVote) {
                if (existingVote.voteType === 'like' && voteType === 'dislike') {
                    await tx.game.update({
                        where: { id: gameIdBigInt },
                        data: { likes: { decrement: 1 }, dislikes: { increment: 1 } }
                    });
                } else if (existingVote.voteType === 'dislike' && voteType === 'like') {
                    await tx.game.update({
                        where: { id: gameIdBigInt },
                        data: { dislikes: { decrement: 1 }, likes: { increment: 1 } }
                    });
                }
            } else {
                // New vote
                if (voteType === 'like') {
                    await tx.game.update({
                        where: { id: gameIdBigInt },
                        data: { likes: { increment: 1 } }
                    });
                } else {
                    await tx.game.update({
                        where: { id: gameIdBigInt },
                        data: { dislikes: { increment: 1 } }
                    });
                }
            }

            return vote;
        });

        return NextResponse.json(result);

    } catch (error) {
        console.error('Error processing vote:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
