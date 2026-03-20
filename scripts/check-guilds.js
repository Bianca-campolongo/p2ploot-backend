const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = '66ea78bf-b6c4-4bf1-9824-c241149d0ad0';

    // Check owned guilds
    const ownedGuilds = await prisma.guild.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true }
    });
    console.log('Owned guilds count:', ownedGuilds.length);
    ownedGuilds.forEach(g => console.log(`  - ID: ${g.id}, Name: ${g.name}`));

    // Check memberships
    const memberships = await prisma.guildMember.findMany({
        where: { memberId: userId },
        include: {
            guild: { select: { id: true, name: true } }
        }
    });
    console.log('Memberships count:', memberships.length);
    memberships.forEach(m => console.log(`  - Guild ID: ${m.guild.id}, Name: ${m.guild.name}, Role: ${m.role}`));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
