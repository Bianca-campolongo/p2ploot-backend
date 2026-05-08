import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/ads/[id]/conversation - Get conversations for an ad
// For buyer: returns their single conversation with the seller
// For seller: returns all buyer conversations for this ad
async function getAdConversations(req: NextRequest, user: any, params: { id: string }) {
    try {
        const adId = BigInt(params.id);

        // Get the ad to determine ownership
        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            select: { userId: true, sellerAddress: true }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const isAdmin = user.role === 'admin' || (user.email && adminEmail && user.email === adminEmail);
        const isOwner = ad.userId === user.id || isAdmin;

        if (isOwner) {
            // Seller or Admin: Get all conversations for this ad
            const conversations = await prisma.conversation.findMany({
                where: {
                    adId,
                    // If not admin, only show their own ad's conversations
                    ...(isAdmin ? {} : { sellerId: user.id })
                },
                include: {
                    buyer: {
                        select: { id: true, username: true }
                    },
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { senderId: true }
                    },
                    escrowDeals: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            status: true,
                            metadata: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const enrichedConversations = conversations.map(conv => {
                const latestEscrow = conv.escrowDeals[0];
                const metadata = latestEscrow?.metadata && typeof latestEscrow.metadata === 'object' && !Array.isArray(latestEscrow.metadata)
                    ? latestEscrow.metadata as Record<string, any>
                    : {};
                const cloakPrivacy = metadata.cloakPrivacy && typeof metadata.cloakPrivacy === 'object' && !Array.isArray(metadata.cloakPrivacy)
                    ? metadata.cloakPrivacy as Record<string, any>
                    : {};
                const buyerPrivacyRequested = Boolean(cloakPrivacy.buyerRequested);

                return {
                    id: conv.id,
                    buyer_id: conv.buyerId,
                    seller_id: conv.sellerId,
                    ad_id: String(conv.adId),
                    created_at: conv.createdAt.toISOString(),
                    buyer: buyerPrivacyRequested ? { id: conv.buyer.id, username: 'Comprador privado via Cloak' } : conv.buyer,
                    buyer_privacy_requested: buyerPrivacyRequested,
                    privacy: {
                        cloak: {
                            enabled: Boolean(cloakPrivacy.enabled),
                            sellerRequested: Boolean(cloakPrivacy.sellerRequested),
                            buyerRequested: buyerPrivacyRequested,
                        }
                    },
                    latest_escrow_status: latestEscrow?.status || null,
                    needs_reply: conv.messages.length > 0 && conv.messages[0].senderId !== user.id,
                    buyerConfirmed: conv.buyerConfirmed || false,
                    sellerConfirmed: conv.sellerConfirmed || false,
                    isCompleted: conv.isCompleted || false
                };
            });

            return NextResponse.json({
                isOwner: true,
                conversations: enrichedConversations
            });
        } else {
            // Buyer: Get their single conversation
            const conversation = await prisma.conversation.findFirst({
                where: {
                    adId,
                    buyerId: user.id
                },
                select: {
                    id: true,
                    buyerId: true,
                    sellerId: true,
                    buyerConfirmed: true,
                    sellerConfirmed: true,
                    isCompleted: true
                }
            });

            return NextResponse.json({
                isOwner: false,
                conversation: conversation ? {
                    id: conversation.id,
                    buyer_id: conversation.buyerId,
                    seller_id: conversation.sellerId,
                    status: 'open',
                    buyerConfirmed: conversation.buyerConfirmed || false,
                    sellerConfirmed: conversation.sellerConfirmed || false,
                    isCompleted: conversation.isCompleted || false
                } : null
            });
        }
    } catch (error) {
        console.error('Error fetching ad conversations:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/ads/[id]/conversation - Start a new conversation
async function startConversation(req: NextRequest, user: any, params: { id: string }) {
    try {
        const adId = BigInt(params.id);
        const { message } = await req.json();

        if (!message || typeof message !== 'string' || !message.trim()) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Get the ad to identify seller
        const ad = await prisma.marketAd.findUnique({
            where: { id: adId },
            select: { userId: true }
        });

        if (!ad) {
            return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
        }

        const sellerId = ad.userId;
        const buyerId = user.id;

        if (sellerId === buyerId) {
            return NextResponse.json({ error: 'Cannot start conversation with yourself' }, { status: 400 });
        }

        // Check if conversation already exists
        let conversation = await prisma.conversation.findFirst({
            where: {
                adId,
                buyerId,
                sellerId
            }
        });

        // Create if not exists
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    adId,
                    buyerId,
                    sellerId
                }
            });
        }

        // Create message
        const msg = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                senderId: buyerId,
                content: message.trim()
            }
        });

        return NextResponse.json({
            conversationId: conversation.id,
            messageId: msg.id
        });

    } catch (error) {
        console.error('Error starting conversation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => getAdConversations(r, user, context.params))(req);

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => startConversation(r, user, context.params))(req);
