import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

export async function POST(
    request: NextRequest,
    context: { params: { id: string } }
) {
    console.log('[ConfirmTrade] MANUAL HANDLER STARTED');

    try {
        const user = await getAuthUser(request);
        if (!user) {
            console.log('[ConfirmTrade] No user found');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const conversationId = context?.params?.id;
        const userId = user.id;

        console.log('[ConfirmTrade] IDs:', { conversationId, userId });

        if (!conversationId) {
            return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        }

        // 1. Fetch Conversation (FORCE ANY to bypass Type Errors)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { buyer: true, seller: true }
        }) as any;

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        // 2. Determine Role
        let isBuyer = false;
        let isSeller = false;

        if (conversation.buyerId === userId) isBuyer = true;
        if (conversation.sellerId === userId) isSeller = true;

        if (!isBuyer && !isSeller) {
            return NextResponse.json({ error: 'You are not part of this negotiation' }, { status: 403 });
        }

        // 3. Update Status
        const updateData: any = {};
        if (isBuyer) updateData.buyerConfirmed = true;
        if (isSeller) updateData.sellerConfirmed = true;

        // Check if this action completes the trade
        const willBeComplete = (isBuyer || conversation.buyerConfirmed) && (isSeller || conversation.sellerConfirmed);

        if (willBeComplete && !conversation.isCompleted) {
            updateData.isCompleted = true;

            // 4. INCREMENT REPUTATION
            await prisma.profile.update({
                where: { id: conversation.buyerId },
                data: { reputationScore: { increment: 1 } } as any
            });

            await prisma.profile.update({
                where: { id: conversation.sellerId },
                data: { reputationScore: { increment: 1 } } as any
            });
        }

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData
        });

        return NextResponse.json({
            success: true,
            conversation: updated,
            isCompleted: updated.isCompleted,
            message: updated.isCompleted ? 'Negociação Concluída! Reputação +1' : 'Aguardando a outra parte...'
        });

    } catch (error) {
        console.error('Error confirming trade:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
