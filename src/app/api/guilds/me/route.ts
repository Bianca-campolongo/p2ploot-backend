import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: any) {
    try {
        console.log(`[GET /api/guilds/me] Starting request for userId: ${user.id}`);

        // 1. Owned Guilds
        const ownedGuilds = await prisma.guild.findMany({
            where: { ownerId: user.id },
            include: {
                game: true,
                _count: { select: { members: true } }
            }
        });

        // 2. Member Guilds (including owned)
        const memberships = await prisma.guildMember.findMany({
            where: { memberId: user.id },
            include: {
                guild: {
                    include: {
                        game: true,
                        customFields: {
                            select: {
                                id: true,
                                guildId: true,
                                fieldName: true,
                                fieldType: true,
                                isRequired: true,
                                fieldOrder: true,
                                createdAt: true
                                // Omit 'options' because it's missing in production DB
                            },
                            orderBy: { fieldOrder: 'asc' }
                        },
                        _count: { select: { members: true } }
                    }
                }
            }
        });

        // 3. Pending Requests
        const requests = await prisma.guildRequest.findMany({
            where: {
                userId: user.id,
                status: 'pending'
            },
            select: { guildId: true }
        });
        const pendingRequests = requests.map(r => r.guildId.toString());

        // 4. Piloted Characters
        const pilotedShares = await prisma.guildCharacterShare.findMany({
            where: {
                sharedWithUserId: user.id,
                status: 'approved'
            },
            include: {
                owner: {
                    select: { id: true, username: true }
                },
                Guild: {
                    include: {
                        game: true,
                        customFields: {
                            select: {
                                id: true,
                                guildId: true,
                                fieldName: true,
                                fieldType: true,
                                isRequired: true,
                                fieldOrder: true,
                                createdAt: true
                            },
                            orderBy: { fieldOrder: 'asc' }
                        },
                        _count: { select: { members: true } }
                    }
                }
            }
        });

        // Helper to format guild exactly as frontend expects
        const formatGuild = (g: any) => {
            if (!g) return null;
            return {
                ...g,
                id: g.id.toString(),
                gameId: g.gameId ? g.gameId.toString() : null,
                owner_id: g.ownerId,
                owner_address: g.ownerAddress,
                members_count: g._count?.members || 0,
                image_url: g.imageUrl,
                game: g.game ? {
                    ...g.game,
                    id: g.game.id.toString()
                } : null,
                customFields: (g.customFields || []).map((f: any) => ({
                    ...f,
                    id: f.id.toString(), // If UUID
                    guildId: f.guildId.toString()
                }))
            };
        };

        const formattedMemberships = memberships.map(m => {
            if (!m.guild) return null;
            return {
                ...m,
                id: m.id.toString(),
                guildId: m.guildId.toString(),
                guild: formatGuild(m.guild),
                isSharedWithMe: false
            };
        }).filter(Boolean);

        const pilotedMemberships = [];
        for (const share of pilotedShares) {
             if (!share.Guild) continue;
             
             const ownerMember = await prisma.guildMember.findFirst({
                where: {
                    guildId: share.Guild.id,
                    memberId: share.guildMemberId
                }
            });

            if (ownerMember) {
                pilotedMemberships.push({
                    ...ownerMember,
                    id: ownerMember.id.toString(),
                    guildId: ownerMember.guildId.toString(),
                    guild: formatGuild(share.Guild),
                    isSharedWithMe: true,
                    shareOwner: share.owner
                });
            }
        }

        const responseData = {
            owned: ownedGuilds.map(formatGuild),
            member: [
                ...memberships.filter(m => m.role !== 'owner' && m.guild).map(m => formatGuild(m.guild)),
                ...pilotedShares.filter(s => s.Guild).map(s => formatGuild(s.Guild))
            ],
            memberships: [...formattedMemberships, ...pilotedMemberships],
            pendingRequests: pendingRequests
        };

        console.log(`[GET /api/guilds/me] Success`);
        // Use deepSerialize as a safety net, but mapping above should handle everything
        return Response.json(deepSerialize(responseData));
    } catch (error: any) {
        console.error('[GET /api/guilds/me] Fatal ERROR:', error);
        return Response.json(
            { 
                error: 'Internal server error', 
                message: error.message,
                path: '/api/guilds/me'
            }, 
            { status: 500 }
        );
    }
}

export const GET = requireAuth(handler);
