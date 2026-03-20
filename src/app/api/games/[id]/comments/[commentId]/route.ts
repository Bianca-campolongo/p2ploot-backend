import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthUser } from '@/lib/auth';

// DELETE /api/games/[id]/comments/[commentId] - Delete a comment
async function deleteHandler(
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string; commentId: string }> }
) {
    try {
        const { commentId } = await context.params;

        // Find the comment
        const comment = await prisma.gameComment.findUnique({
            where: { id: commentId }
        });

        if (!comment) {
            return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
        }

        // Check if user is owner or admin
        const isOwner = comment.userId === user.id;
        const isAdmin = user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: 'Not authorized to delete this comment' }, { status: 403 });
        }

        // Delete the comment (cascades to replies and votes)
        await prisma.gameComment.delete({
            where: { id: commentId }
        });

        return NextResponse.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const DELETE = requireAuth(deleteHandler);
