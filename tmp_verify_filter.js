const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getModeratorGameFilter(user) {
    if (user.role === 'admin') return undefined;
    if (!user.games || user.games.includes('all')) return undefined;
    return { in: user.games };
}

async function main() {
    const userId = "cbc9c99f-bf85-40b3-8aa2-0a767cfa00ba"; // Replacing with an actual ID from my search if I found one, but I'll use Talon's ID
    const userProfile = await prisma.profile.findFirst({
        where: { role: 'moderator' },
        include: { moderatorPermission: true }
    });

    if (!userProfile) {
        console.log("No moderator found");
        return;
    }

    const user = {
        role: userProfile.role,
        games: JSON.parse(userProfile.moderatorPermission.games)
    };

    const gameFilter = getModeratorGameFilter(user);
    console.log("User Games:", user.games);
    console.log("Game Filter:", gameFilter);

    const ads = await prisma.marketAd.findMany({
        where: {
            status: 'pending',
            game: gameFilter
        }
    });

    console.log("Filtered Ads Count:", ads.length);
    console.log(ads);
}

main().finally(() => prisma.$disconnect());
