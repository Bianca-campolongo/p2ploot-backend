import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';

async function getUserNotifications(req: NextRequest, user: any) {
    try {
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // 1. Mensagens Não Lidas
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { buyerId: user.id },
                    { sellerId: user.id }
                ]
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
        const unreadConvs = conversations.filter(c => c.messages && c.messages.length > 0 && c.messages[0].senderId !== user.id);

        // Buscar títulos dos anúncios para as mensagens
        const adIds = unreadConvs.map(c => c.adId).filter(id => id !== null) as bigint[];
        const relatedAds = await prisma.marketAd.findMany({
            where: { id: { in: adIds } },
            select: { id: true, title: true }
        });
        const adTitleMap = new Map(relatedAds.map(ad => [ad.id.toString(), ad.title]));

        // 2. Anúncios Recém Aprovados (últimas 48h)
        const approvedAds = await prisma.marketAd.findMany({
            where: {
                userId: user.id,
                status: 'active',
                approvedAt: { gt: fortyEightHoursAgo }
            } as any,
            select: { id: true, title: true }
        });

        // 3. Anúncios Expirados
        const expiredAds = await prisma.marketAd.findMany({
            where: {
                userId: user.id,
                status: 'expired'
            },
            select: { id: true, title: true }
        });

        // 4. Tickets de Suporte Respondidos
        const respondedTickets = await prisma.supportTicket.findMany({
            where: {
                userId: user.id,
                status: { not: 'open' },
                updatedAt: { gt: fortyEightHoursAgo }
            },
            select: { id: true, title: true, status: true }
        });

        // 5. Auditoria pediu prova da parte logada
        const disputeEvidenceRequests = await prisma.escrowDispute.findMany({
            where: {
                OR: [
                    { sellerId: user.id, status: 'awaiting_seller_evidence' },
                    { buyerId: user.id, status: 'awaiting_buyer_evidence' }
                ]
            },
            include: {
                escrowDeal: {
                    select: {
                        id: true,
                        adId: true,
                        conversationId: true,
                        ad: { select: { title: true } }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' },
            take: 10
        });

        // 6. Guildas Expirando (< 7 dias)
        const expiringGuilds = await prisma.guild.findMany({
            where: {
                ownerId: user.id,
                accessExpiresAt: {
                    gt: now,
                    lt: sevenDaysFromNow
                }
            },
            select: { id: true, name: true, accessExpiresAt: true }
        });

        // Formatar em objetos de notificação legíveis
        const notifications: any[] = [];

        unreadConvs.forEach(conv => {
            const adTitle = conv.adId ? adTitleMap.get(conv.adId.toString()) : 'Anúncio';
            notifications.push({
                id: `user-msg-conv-${conv.id}`,
                type: 'message',
                text: `💬 Nova mensagem no anúncio: ${adTitle || 'Anúncio'}`,
                link: `/meu-perfil?tab=ads&adId=${conv.adId}&convId=${conv.id}`,
                createdAt: conv.messages[0].createdAt
            });
        });

        approvedAds.forEach(ad => {
            notifications.push({
                id: `user-ad-approved-${ad.id}`,
                type: 'ad_approved',
                text: `✅ Seu anúncio "${ad.title}" foi aprovado e está ativo!`,
                link: '/meu-perfil',
                createdAt: now
            });
        });

        expiredAds.forEach(ad => {
            notifications.push({
                id: `user-ad-expired-${ad.id}`,
                type: 'ad_expired',
                text: `⌛ Seu anúncio "${ad.title}" expirou. Renove-o no seu perfil.`,
                link: '/meu-perfil',
                createdAt: now
            });
        });

        respondedTickets.forEach(ticket => {
            notifications.push({
                id: `user-ticket-update-${ticket.id}`,
                type: 'ticket_update',
                text: `🎫 Seu ticket "${ticket.title}" foi atualizado status: ${ticket.status}.`,
                link: '/meu-perfil',
                createdAt: now
            });
        });

        disputeEvidenceRequests.forEach(dispute => {
            const adTitle = dispute.escrowDeal?.ad?.title || 'compra';
            const adId = dispute.escrowDeal?.adId?.toString();
            const convId = dispute.escrowDeal?.conversationId;
            notifications.push({
                id: `user-dispute-evidence-${dispute.id}-${dispute.status}`,
                type: 'dispute_evidence_request',
                text: `Auditoria pediu provas na compra: ${adTitle}.`,
                link: adId ? `/player-market?adId=${adId}${convId ? `&convId=${convId}` : ''}` : '/player-market',
                createdAt: dispute.updatedAt
            });
        });

        expiringGuilds.forEach(guild => {
            const expiresAt = guild.accessExpiresAt;
            if (expiresAt) {
                const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                notifications.push({
                    id: `user-guild-expire-${guild.id}`,
                    type: 'guild_expiring',
                    text: `🏰 Acesso da sua Guilda "${guild.name}" expira em ${daysLeft} dia(s).`,
                    link: `/guild/${guild.id}/manage`,
                    createdAt: now
                });
            }
        });

        return NextResponse.json(deepSerialize({
            success: true,
            notifications
        }));
    } catch (error: any) {
        console.error('[User Notifications] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest) => requireAuth(getUserNotifications)(req);
