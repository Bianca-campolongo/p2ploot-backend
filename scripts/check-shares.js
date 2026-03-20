const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // Check all shares
        const shares = await prisma.guildCharacterShare.findMany({
            take: 10,
            include: {
                pilot: { select: { id: true, username: true, email: true } },
                owner: { select: { id: true, username: true, email: true } }
            }
        });

        console.log('Shares found:', shares.length);
        shares.forEach(s => {
            console.log(`- ID: ${s.id}`);
            console.log(`  Owner: ${s.owner?.username}`);
            console.log(`  Pilot: ${s.pilot?.username}`);
            console.log(`  Status: ${s.status}`);
            console.log(`  GuildId: ${s.guildId}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
