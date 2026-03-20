import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthUser } from '@/lib/auth';

// POST /api/games/[id]/comments/[commentId]/vote - Vote on a comment
async function postHandler(
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string; commentId: string }> }
) {
    try {
        const { commentId } = await context.params;
        const body = await req.json();
        const { voteType } = body; // 'like' or 'dislike'

        if (!voteType || !['like', 'dislike'].includes(voteType)) {
            return NextResponse.json({ error: 'Invalid vote type' }, { status: 400 });
        }

        // Check if comment exists
        const comment = await prisma.gameComment.findUnique({
            where: { id: commentId }
        });

        if (!comment) {
            return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
        }

        // Check if user already voted
        const existingVote = await prisma.gameCommentVote.findUnique({
            where: {
                commentId_userId: {
                    commentId,
                    userId: user.id
                }
            }
        });

        if (existingVote) {
            if (existingVote.voteType === voteType) {
                // Same vote - remove it (toggle off)
                await prisma.$transaction([
                    prisma.gameCommentVote.delete({
                        where: { id: existingVote.id }
                    }),
                    prisma.gameComment.update({
                        where: { id: commentId },
                        data: {
                            [voteType === 'like' ? 'likes' : 'dislikes']: { decrement: 1 }
                        }
                    })
                ]);

                return NextResponse.json({
                    message: 'Vote removed',
                    action: 'removed',
                    voteType: null
                });
            } else {
                // Different vote - switch it
                await prisma.$transaction([
                    prisma.gameCommentVote.update({
                        where: { id: existingVote.id },
                        data: { voteType }
                    }),
                    prisma.gameComment.update({
                        where: { id: commentId },
                        data: {
                            [voteType === 'like' ? 'likes' : 'dislikes']: { increment: 1 },
                            [voteType === 'like' ? 'dislikes' : 'likes']: { decrement: 1 }
                        }
                    })
                ]);

                return NextResponse.json({
                    message: 'Vote changed',
                    action: 'changed',
                    voteType
                });
            }
        } else {
            // New vote
            await prisma.$transaction([
                prisma.gameCommentVote.create({
                    data: {
                        commentId,
                        userId: user.id,
                        voteType
                    }
                }),
                prisma.gameComment.update({
                    where: { id: commentId },
                    data: {
                        [voteType === 'like' ? 'likes' : 'dislikes']: { increment: 1 }
                    }
                })
            ]);

            return NextResponse.json({
                message: 'Vote added',
                action: 'added',
                voteType
            }, { status: 201 });
        }
    } catch (error) {
        console.error('Error voting on comment:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = requireAuth(postHandler);
