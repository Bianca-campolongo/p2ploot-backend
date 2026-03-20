import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/conversations - Get current user's conversations
async function getConversations(req: NextRequest, user: any) {
    try {
        // Find conversations where user is buyer or seller
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { buyerId: user.id },
                    { sellerId: user.id }
                ]
            },
            include: {
                buyer: {
                    select: { id: true, username: true }
                },
                seller: {
                    select: { id: true, username: true }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        content: true,
                        createdAt: true,
                        senderId: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch associated ads for each conversation
        const conversationsWithAds = await Promise.all(
            conversations.map(async (conv) => {
                let ad = null;
                if (conv.adId) {
                    const adData = await prisma.marketAd.findUnique({
                        where: { id: conv.adId },
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            imageUrl: true,
                            userId: true,
                            sellerAddress: true,
                            status: true
                        }
                    });
                    if (adData) {
                        ad = {
                            ...adData,
                            id: String(adData.id),
                            price: adData.price ? Number(adData.price) : null,
                            // snake_case for frontend
                            image_url: adData.imageUrl,
                            user_id: adData.userId,
                            seller_address: adData.sellerAddress
                        };
                    }
                }

                const lastMessage = conv.messages[0] || null;

                return {
                    id: conv.id,
                    buyerId: conv.buyerId,
                    sellerId: conv.sellerId,
                    adId: conv.adId ? String(conv.adId) : null,
                    createdAt: conv.createdAt.toISOString(),
                    // snake_case for frontend
                    buyer_id: conv.buyerId,
                    seller_id: conv.sellerId,
                    ad_id: conv.adId ? String(conv.adId) : null,
                    created_at: conv.createdAt.toISOString(),
                    // Related data
                    buyer: conv.buyer,
                    seller: conv.seller,
                    ad,
                    last_message: lastMessage ? {
                        content: lastMessage.content,
                        created_at: lastMessage.createdAt.toISOString(),
                        sender_id: lastMessage.senderId
                    } : null
                };
            })
        );

        return NextResponse.json({ conversations: conversationsWithAds });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest) => requireAuth(getConversations)(req);
