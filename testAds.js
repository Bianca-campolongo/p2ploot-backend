const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const where = {
            status: 'active',
            expiresAt: { gt: new Date() }
        };
        const ads = await prisma.marketAd.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                        reputationScore: true,
                        discordCreatedAt: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        console.log("Success:", ads.length);
    } catch (err) {
        console.error("Prisma error:", err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
