import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// DELETE /api/conversations/[id] - Delete a conversation
async function deleteConversation(req: NextRequest, user: any, params: { id: string }) {
    try {
        const conversationId = params.id;

        // Verify ownership (must be buyer or seller)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { buyerId: true, sellerId: true }
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Delete conversation (cascade deletes messages)
        await prisma.conversation.delete({
            where: { id: conversationId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteConversation(r, user, context.params))(req);
