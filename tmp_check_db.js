const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const pendingAds = await prisma.marketAd.findMany({
        where: { status: 'pending' },
        select: { id: true, title: true, game: true }
    });
    console.log('--- PENDING ADS ---');
    console.log(JSON.stringify(pendingAds, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    const pendingEvents = await prisma.event.findMany({
        where: { status: 'pending' },
        select: { id: true, title: true, game: true }
    });
    console.log('\n--- PENDING EVENTS ---');
    console.log(JSON.stringify(pendingEvents, null, 2));

    const moderator = await prisma.profile.findFirst({
        where: { role: 'moderator' },
        include: { moderatorPermission: true }
    });
    if (moderator) {
        console.log('\n--- FIRST MODERATOR ---');
        console.log({
            username: moderator.username,
            role: moderator.role,
            panels: moderator.moderatorPermission?.panels,
            games: moderator.moderatorPermission?.games
        });
    }
}

main().finally(() => prisma.$disconnect());
