
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to calculate score (copied from route.ts)
function calculateReputation(profile: any) {
    let score = 0;
    const details: any[] = [];
    if (profile.discordCreatedAt) score += 20; // Simplified
    if (profile.reputationScore) score += profile.reputationScore;
    return { score: score, rawScore: score, details };
}

async function main() {
    console.log('Testing Profile Query and Serialization...');
    try {
        const username = 'Talonzinha-site';
        const profile = await prisma.profile.findFirst({
            where: { username: username },
            select: {
                id: true,
                username: true,
                bio: true,
                avatarUrl: true,
                walletAddress: true,
                isPrivate: true,
                discordUsername: true,
                createdAt: true,
                reputationScore: true,
                discordCreatedAt: true,
                guildMembers: {
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
        });

        if (!profile) {
            console.log('Profile not found');
            return;
        }

        console.log('Profile found, processing...');

        // Mimic the route logic exactly
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
                        // Ensure other BigInts are handled
                    };
                }
                return safeGm;
            })
        };

        const responseData = {
            ...safeProfile,
            reputation: reputation,
            reputationScore: reputation.score,
            trust: 0,
            distrust: 0
        };

        console.log('Attempting JSON serialization...');
        const json = JSON.stringify(responseData);
        console.log('Serialization SUCCESS!');
    } catch (error) {
        console.error('Serialization FAILED!');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
