import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, verifyToken } from '@/lib/auth';
import { deepSerialize } from '@/lib/serialize';
import { applyDecay } from '@/lib/dkp';

export const dynamic = 'force-dynamic';

/**
 * Checks if DKP decay is due and applies it if necessary.
 * Uses dkp_config JSON field to store 'last_decay_at'.
 */
async function applyDkpDecayIfNeeded(guild: any) {
    if (!guild.dkpDecayActive || !guild.dkpDecayPercent) return guild;

    const dkpConfig = (guild.dkpConfig as any) || {};
    // Get last decay in Brasilia hacked-time for comparison
    const lastDecayAt = dkpConfig.last_decay_at 
        ? new Date(new Date(dkpConfig.last_decay_at).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })) 
        : null;
    
    const decayTime = dkpConfig.decay_time || "00:00";
    const interval = guild.dkpDecayInterval; // 'weekly', 'monthly'
    const day = guild.dkpDecayDay || 1; // 1-7 for weekly (1=Mon, 7=Sun), 1-31 for monthly
    
    // Safety buffer: If we already decayed in the last 6 hours, skip to prevent double-trigger
    // (especially common if settings are saved right before a scheduled time)
    if (lastDecayAt && (new Date().getTime() - new Date(dkpConfig.last_decay_at).getTime()) < 6 * 60 * 60 * 1000) {
        return guild;
    }

    // Get current time in Brasilia (GMT-3)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const [hours, minutes] = decayTime.split(':').map(Number);
    
    let scheduledTime = new Date(now);
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (interval === 'weekly') {
        const jsDay = day % 7; // Frontend sends 0-6 (Sun-Sat)
        const diff = (now.getDay() - jsDay + 7) % 7;
        scheduledTime.setDate(now.getDate() - diff);
        // If scheduled for today but time is in the future, look at last week
        if (scheduledTime > now) {
            scheduledTime.setDate(scheduledTime.getDate() - 7);
        }
    } else if (interval === 'monthly') {
        const targetDay = Math.min(day, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
        scheduledTime.setDate(targetDay);
        // If scheduled for today but time is in the future, look at last month
        if (scheduledTime > now) {
            scheduledTime.setMonth(now.getMonth() - 1);
        }
    }

    // If never decayed before, just initialize the tracker so it waits for the NEXT scheduled time
    // This prevents an immediate double-trigger for a past period right after configuration.
    if (!lastDecayAt) {
        console.log(`[DECAY] Initializing automatic decay tracking for guild ${guild.id}`);
        try {
            const newConfig = { ...dkpConfig, last_decay_at: new Date().toISOString() };
            await prisma.guild.update({
                where: { id: guild.id },
                data: { dkpConfig: newConfig }
            });
            guild.dkpConfig = newConfig;
        } catch (error) {
            console.error(`[DECAY] Error initializing decay for guild ${guild.id}:`, error);
        }
        return guild;
    }

    // If last decay was before the MOST RECENT scheduled time
    if (lastDecayAt < scheduledTime) {
        console.log(`[DECAY] Triggering automatic decay for guild ${guild.id}`);
        try {
            await prisma.$transaction(async (tx) => {
                await applyDecay(tx, guild.id, guild.dkpDecayPercent);
                
                // Update dkp_config metadata
                const newConfig = { ...dkpConfig, last_decay_at: new Date().toISOString() };
                await tx.guild.update({
                    where: { id: guild.id },
                    data: { dkpConfig: newConfig }
                });
                
                guild.dkpConfig = newConfig;
            });
            console.log(`[DECAY] Successfully applied automatic decay to guild ${guild.id}`);
        } catch (error) {
            console.error(`[DECAY] Error applying automatic decay to guild ${guild.id}:`, error);
        }
    }

    return guild;
}

// GET - Get a single guild with details
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        console.log(`[GET /api/guilds/${params.id}] Starting request`);
        
        // Use try-catch specifically for BigInt parsing
        let guildId: bigint;
        try {
            guildId = BigInt(params.id);
        } catch (e) {
            console.error(`[GET /api/guilds/${params.id}] Invalid ID format:`, params.id);
            return Response.json({ error: 'Invalid ID format' }, { status: 400 });
        }

        // Get auth token (optional)
        let userId: string | null = null;
        const authHeader = req.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const user = verifyToken(token);
            if (user) {
                userId = user.id;
            }
        }

        console.log(`[GET /api/guilds/${params.id}] Step 1: DB Query`);
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            include: {
                game: {
                    select: {
                        id: true,
                        name: true,
                        imageUrl: true,
                    },
                },
                members: {
                    include: {
                        member: { 
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true,
                                email: true,
                                discordId: true,
                                discordUsername: true,
                                discordGlobalName: true,
                            },
                        },
                    },
                },
                requests: {
                    where: { status: 'pending' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                            },
                        },
                    },
                },
                customFields: {
                    select: {
                        id: true,
                        guildId: true,
                        fieldName: true,
                        fieldType: true,
                        isRequired: true,
                        fieldOrder: true,
                        options: true,
                        createdAt: true
                    },
                    orderBy: { fieldOrder: 'asc' },
                },
                giveaways: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
                dkpEventsConfig: {
                    orderBy: { eventName: 'asc' },
                },
                characterShares: {
                    include: {
                        owner: { select: { id: true, username: true, email: true } },
                        pilot: { select: { id: true, username: true, email: true } },
                    }
                    // permissions field is included by default (no select limiting it)
                },
                _count: {
                    select: { members: true },
                },
            },
        });

        if (!guild) {
            console.log(`[GET /api/guilds/${params.id}] Not found`);
            return Response.json({ error: 'Guild not found' }, { status: 404 });
        }

        // Apply DKP Decay if needed
        await applyDkpDecayIfNeeded(guild);

        console.log(`[GET /api/guilds/${params.id}] Step 2: Permissions Check`);
        // Check user's relationship to guild
        const isOwner = (guild.ownerId === userId) || (guild.ownerAddress === userId);
        const memberRecord = userId ? guild.members.find(m => m.memberId === userId) : null;
        
        // Pilot check
        let isPilot = false;
        let pilotedMember = null;
        let pilotShare: any = null;
        if (userId && !memberRecord) {
             pilotShare = await prisma.guildCharacterShare.findFirst({
                where: {
                    sharedWithUserId: userId,
                    guildId: guildId,
                    status: 'approved'
                }
            });
            if (pilotShare) {
                isPilot = true;
                pilotedMember = guild.members.find((m: any) => m.memberId === pilotShare.guildMemberId);
            }
        }

        const isMember = !!memberRecord || isOwner || isPilot;
        // If the pilot has been granted a guild role via permissions.guildRole, use it
        const pilotGuildRole = isPilot && pilotShare?.permissions
            ? (typeof pilotShare.permissions === 'string'
                ? JSON.parse(pilotShare.permissions)
                : pilotShare.permissions)?.guildRole
            : null;
        const userRole = isOwner ? 'owner' : (pilotGuildRole || (isPilot ? 'pilot' : (memberRecord?.role || 'none')));

        console.log(`[GET /api/guilds/${params.id}] Step 3: Formatting & Winners`);
        
        // Fetch winner details for giveaways
        const winnerIds = Array.from(new Set(guild.giveaways.map(g => g.winnerId).filter(Boolean))) as string[];
        const giveawayMembers = await prisma.guildMember.findMany({
            where: { guildId, memberId: { in: winnerIds } },
            include: { member: { select: { username: true } } }
        });
        const giveawayMemberMap = new Map(giveawayMembers.map(m => [m.memberId, m]));

        // Build base response
        const activeShares = guild.characterShares.filter(s => s.status === 'approved');
        const pendingShares = guild.characterShares.filter(s => s.status === 'pending');

        const formatShare = (s: any) => {
            const memberRecord = guild.members.find(m => m.memberId === s.guildMemberId);
            return {
                ...s,
                shared_user: s.pilot,
                guild_member: memberRecord ? {
                    ...memberRecord,
                    user: s.owner
                } : null
            };
        };

        const responseData = {
            ...guild,
            giveaways: guild.giveaways.map(g => {
                const member = g.winnerId ? giveawayMemberMap.get(g.winnerId) : null;
                const name = member?.characterName || member?.member?.username || 'Desconhecido';
                return {
                    ...g,
                    winnerName: name,
                    winner_name: name
                };
            }),
            members: guild.members.map(m => ({
                ...m,
                user: m.member
            })),
            dkpEventsConfig: guild.dkpEventsConfig.map(e => ({
                ...e,
                name: e.eventName,
                default_points: e.dkpAmount
            })),
            characterShares: activeShares.map(formatShare),
            pendingShares: pendingShares.map(formatShare),
            isOwner,
            isMember,
            isPilot,
            userRole,
            userMember: memberRecord || pilotedMember || null,
            pilotedMember
        };

        console.log(`[GET /api/guilds/${params.id}] Step 4: Serialization`);
        const serialized = deepSerialize(responseData);
        
        console.log(`[GET /api/guilds/${params.id}] Done`);
        return Response.json(serialized);
    } catch (error: any) {
        console.error(`[GET /api/guilds/${params.id}] PROD ERROR:`, error);
        return Response.json(
            { 
                error: 'Internal server error', 
                message: error.message,
                path: `/api/guilds/${params.id}`
            }, 
            { status: 500 }
        );
    }
}

// PUT - Update guild (owner only)
async function updateHandler(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true },
        });

        if (!guild) return Response.json({ error: 'Guild not found' }, { status: 404 });

        const callingMember = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        
        const isOwner = guild.ownerId === user.id || guild.ownerAddress === user.id;
        const isAdmin = callingMember?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return Response.json({ error: 'Not authorized' }, { status: 403 });
        }

        const body = await req.json();
        const updated = await prisma.guild.update({
            where: { id: guildId },
            data: {
                name: body.name,
                description: body.description,
                imageUrl: body.imageUrl || body.image_url,
                discordUrl: body.discordUrl || body.discord_url,
                maxMembers: body.maxMembers,
                // DKP Settings
                dkpConfig: body.dkpConfig || body.dkp_config,
                dkpDecayActive: body.dkpDecayActive ?? body.dkp_decay_active,
                dkpDecayPercent: body.dkpDecayPercent ?? body.dkp_decay_percent,
                dkpDecayInterval: body.dkpDecayInterval || body.dkp_decay_interval,
                dkpDecayDay: body.dkpDecayDay ?? body.dkp_decay_day,
                dkpRoleBonuses: body.dkpRoleBonuses || body.dkp_role_bonuses,
            },
        });

        return Response.json(deepSerialize(updated));
    } catch (error: any) {
        console.error('Error updating guild:', error);
        return Response.json({ error: 'Internal server error', message: error.message }, { status: 500 });
    }
}

// DELETE - Delete guild (owner only)
async function deleteHandler(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true },
        });

        if (!guild) return Response.json({ error: 'Guild not found' }, { status: 404 });

        if (guild.ownerId !== user.id && guild.ownerAddress !== user.id) {
            return Response.json({ error: 'Not authorized' }, { status: 403 });
        }

        await prisma.guild.delete({ where: { id: guildId } });
        return Response.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting guild:', error);
        return Response.json({ error: 'Internal server error', message: error.message }, { status: 500 });
    }
}

export const PUT = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateHandler(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteHandler(r, user, context.params))(req);
