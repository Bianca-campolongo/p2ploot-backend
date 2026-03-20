import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// GET /api/conversations/[id]/messages - Get messages for a conversation
async function getMessages(req: NextRequest, user: any, params: { id: string }) {
    try {
        const conversationId = params.id;

        // Verify user is part of this conversation
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

        // Get messages
        const messages = await prisma.message.findMany({
            where: { conversationId },
            include: {
                sender: {
                    select: { id: true, username: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        const serializedMessages = messages.map(msg => ({
            id: msg.id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            content: msg.content,
            createdAt: msg.createdAt.toISOString(),
            // snake_case for frontend
            conversation_id: msg.conversationId,
            sender_id: msg.senderId,
            created_at: msg.createdAt.toISOString(),
            sender: msg.sender
        }));

        return NextResponse.json({ messages: serializedMessages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/conversations/[id]/messages - Send a message
const sendMessageSchema = z.object({
    content: z.string().min(1).max(5000)
});

async function sendMessage(req: NextRequest, user: any, params: { id: string }) {
    try {
        const conversationId = params.id;
        const body = await req.json();
        const { content } = sendMessageSchema.parse(body);

        // Verify user is part of this conversation
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

        // Create message
        const message = await prisma.message.create({
            data: {
                conversationId,
                senderId: user.id,
                content
            },
            include: {
                sender: {
                    select: { id: true, username: true }
                }
            }
        });

        // Update conversation updated_at
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() }
        });

        return NextResponse.json({
            message: {
                id: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                content: message.content,
                createdAt: message.createdAt.toISOString(),
                conversation_id: message.conversationId,
                sender_id: message.senderId,
                created_at: message.createdAt.toISOString(),
                sender: message.sender
            }
        });
    } catch (error: any) {
        console.error('Error sending message:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid message content' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => getMessages(r, user, context.params))(req);

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => sendMessage(r, user, context.params))(req);
