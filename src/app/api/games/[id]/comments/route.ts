import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthUser, getAuthUser } from '@/lib/auth';

// Helper to serialize a comment
const serializeComment = (c: any, userVotesMap: Map<string, string>) => ({
    id: c.id,
    content: c.content,
    likes: c.likes,
    dislikes: c.dislikes,
    parent_id: c.parentId,
    created_at: c.createdAt,
    user: {
        id: c.user.id,
        username: c.user.username || 'Usuário',
        avatar_url: c.user.avatarUrl
    },
    user_vote: userVotesMap.get(c.id) || null,
    replies: c.replies?.map((r: any) => serializeComment(r, userVotesMap)) || []
});

// GET /api/games/[id]/comments - List comments for a game
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const gameId = parseInt(id, 10);

        if (isNaN(gameId)) {
            return NextResponse.json({ error: 'Invalid game ID' }, { status: 400 });
        }

        // Get current user (optional - for vote status)
        const user = await getAuthUser(req);

        // Fetch top-level comments (no parentId) with replies
        const comments = await prisma.gameComment.findMany({
            where: {
                gameId,
                parentId: null // Only top-level comments
            },
            orderBy: [
                { likes: 'desc' },
                { createdAt: 'desc' }
            ],
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true
                    }
                },
                replies: {
                    orderBy: [
                        { likes: 'desc' },
                        { createdAt: 'asc' }
                    ],
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true
                            }
                        }
                    }
                }
            }
        });

        // Get user's votes if logged in
        let userVotesMap = new Map<string, string>();
        if (user) {
            const allCommentIds = comments.flatMap(c => [c.id, ...c.replies.map(r => r.id)]);
            const userVotes = await prisma.gameCommentVote.findMany({
                where: {
                    userId: user.id,
                    commentId: { in: allCommentIds }
                }
            });
            userVotes.forEach(v => userVotesMap.set(v.commentId, v.voteType));
        }

        const serialized = comments.map(c => serializeComment(c, userVotesMap));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Error fetching game comments:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/games/[id]/comments - Add a comment or reply (authenticated)
async function postHandler(
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const gameId = parseInt(id, 10);

        if (isNaN(gameId)) {
            return NextResponse.json({ error: 'Invalid game ID' }, { status: 400 });
        }

        const body = await req.json();
        const { content, parentId } = body;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        if (content.length > 1000) {
            return NextResponse.json({ error: 'Comment too long (max 1000 characters)' }, { status: 400 });
        }

        // Verify game exists
        const game = await prisma.game.findUnique({ where: { id: gameId } });
        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        // If parentId is provided, verify parent comment exists and belongs to same game
        if (parentId) {
            const parentComment = await prisma.gameComment.findUnique({
                where: { id: parentId }
            });
            if (!parentComment || parentComment.gameId !== BigInt(gameId)) {
                return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
            }
        }

        const comment = await prisma.gameComment.create({
            data: {
                gameId,
                userId: user.id,
                content: content.trim(),
                parentId: parentId || null
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true
                    }
                }
            }
        });

        return NextResponse.json({
            id: comment.id,
            content: comment.content,
            likes: comment.likes,
            dislikes: comment.dislikes,
            parent_id: comment.parentId,
            created_at: comment.createdAt,
            user: {
                id: comment.user.id,
                username: comment.user.username || 'Usuário',
                avatar_url: comment.user.avatarUrl
            },
            user_vote: null,
            replies: []
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating game comment:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = requireAuth(postHandler);

