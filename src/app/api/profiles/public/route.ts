import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateReputation } from '@/lib/reputation';

// GET /api/profiles/public?username=...
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
        return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    try {
        const profile = await prisma.profile.findFirst({
            where: { username: username }, // Assume username is unique or take first
            select: {
                id: true,
                username: true,
                bio: true,
                avatarUrl: true,
                walletAddress: true, // Needed for ad filtering in some cases? Better to filter by ID.
                isPrivate: true,
                discordUsername: true,
                createdAt: true,
                reputationScore: true, // Needed for badges
                discordCreatedAt: true, // Needed for badges
                guildMembers: { // Needed for badges
                    include: {
                        guild: {
                            select: {
                                id: true,
                                name: true,
                                creationCostPaid: true,
                                strikes: true,
                                ownerId: true
                            }
                        }
                    }
                }
            }
        }) as any;

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Fetch trust stats safely
        let trustCount = 0;
        let distrustCount = 0;

        try {
            if ((prisma as any).trustVote) {
                const [t, d] = await Promise.all([
                    (prisma as any).trustVote.count({ where: { targetId: profile.id, type: 'TRUST' } }),
                    (prisma as any).trustVote.count({ where: { targetId: profile.id, type: 'DISTRUST' } })
                ]);
                trustCount = t;
                distrustCount = d;
            } else {
                // Fallback to raw query if Prisma Client is outdated
                // Note: requires trust_votes table to exist
                const t: any[] = await prisma.$queryRaw`SELECT COUNT(*) as count FROM trust_votes WHERE target_id = ${profile.id} AND type = 'TRUST'`;
                const d: any[] = await prisma.$queryRaw`SELECT COUNT(*) as count FROM trust_votes WHERE target_id = ${profile.id} AND type = 'DISTRUST'`;

                trustCount = Number(t[0]?.count || 0);
                distrustCount = Number(d[0]?.count || 0);
            }
        } catch (error) {
            console.warn('Trust system unavailable (db schema mismatch?):', error);
            // Continue without trust stats to avoid 500 error
        }

        if (profile.isPrivate) {
            return NextResponse.json({
                id: profile.id,
                username: 'Private User',
                isPrivate: true,
                avatarUrl: profile.avatarUrl,
                trust: trustCount,
                distrust: distrustCount
            });
        }

        // Calculate advanced reputation
        const reputation = calculateReputation(profile);

        // Sanitize BigInt from guild members
        const safeProfile = {
            ...profile,
            guildMembers: profile.guildMembers?.map((gm: any) => {
                const safeGm = {
                    ...gm,
                    guildId: gm.guildId ? gm.guildId.toString() : null, // Fix: Serialize guildId on the member itself
                };

                if (safeGm.guild) {
                    safeGm.guild = {
                        ...safeGm.guild,
                        id: safeGm.guild.id.toString(),
                        // Ensure other BigInts are handled if added later
                    };
                }
                return safeGm;
            })
        };

        // Return profile data
        return NextResponse.json({
            ...safeProfile,
            reputation: reputation, // Enhanced object
            reputationScore: reputation.score, // Override with calculated score for backward compat
            trust: trustCount,
            distrust: distrustCount
        });
    } catch (error) {
        console.error('Error fetching public profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
