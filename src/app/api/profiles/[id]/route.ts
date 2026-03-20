
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// Helper to calculate score
function calculateReputation(profile: any) {
    let score = 0;
    const details: string[] = [];

    // 1. Discord Account Age
    if (profile.discordCreatedAt) {
        const created = new Date(profile.discordCreatedAt);
        const now = new Date();
        const diffYears = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);

        if (diffYears >= 5) {
            score += 20;
            details.push('Discord > 5 anos (+20)');
        } else if (diffYears >= 2) {
            score += 10;
            details.push('Discord > 2 anos (+10)');
        } else if (diffYears < 0.5) { // < 6 months
            // No negative points, just information
            details.push('Discord: Criado recentemente');
        }
    } else {
        details.push('Discord não vinculado');
    }

    // 2. Trades Completed (Base Reputation)
    if (profile.reputationScore) {
        score += profile.reputationScore;
        details.push(`Negociações: ${profile.reputationScore} (+${profile.reputationScore})`);
    } else {
        details.push('Sem negociações');
    }

    // 3. Guild Membership
    if (profile.guildMembers && profile.guildMembers.length > 0) {
        // ... (existing guild logic)
        const roles = profile.guildMembers.map((gm: any) => gm.role ? gm.role.toLowerCase() : '');

        if (roles.includes('owner') || roles.includes('leader')) {
            score += 10;
            details.push('Líder de Guilda (+10)');
        } else {
            score += 2;
            details.push('Membro de Guilda (+2)');
        }
    } else {
        details.push('Sem afiliação de Guilda');
    }

    // Cap removed
    return { score: score, rawScore: score, details };
}

// GET /api/profiles/[id] - Get public profile by ID
async function getPublicProfile(req: NextRequest, params: { id: string }) {
    try {
        const profileId = params.id;

        const profile = await prisma.profile.findUnique({
            where: { id: profileId },
            select: {
                id: true,
                username: true,
                bio: true,
                avatarUrl: true,
                credits: false,
                email: false,
                createdAt: true,
                isPrivate: true,
                discordUsername: true,
                reputationScore: true, // Trade count
                discordCreatedAt: true,
                guildMembers: {
                    include: {
                        guild: {
                            select: {
                                id: true,
                                name: true,
                                imageUrl: true,
                                creationCostPaid: true,
                                strikes: true,
                                ownerId: true // Needed to verify ownership if role isn't reliable
                            }
                        }
                    }
                }
            }
        });

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        if (profile.isPrivate) {
            return NextResponse.json({
                id: profile.id,
                username: 'Private User',
                isPrivate: true,
                avatarUrl: profile.avatarUrl
            });
        }

        // Calculate advanced reputation
        const reputation = calculateReputation(profile);

        return NextResponse.json({
            ...profile,
            reputation // Inject calculated object { score, rawScore, details }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    getPublicProfile(req, context.params);
