const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAds() {
    try {
        console.log('Connecting to Prisma...');
        const ads = await prisma.marketAd.findMany({
            where: {
                status: 'active',
                expiresAt: { gt: new Date() }
            },
            include: { user: true },
            orderBy: { createdAt: 'desc' },
            take: 4
        });
        console.log('Successfully fetched ads:', ads.length);
    } catch (error) {
        console.error('Error fetching ads directly via Prisma:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAds();
