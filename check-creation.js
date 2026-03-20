const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const lastGuild = await prisma.guild.findFirst({
            orderBy: { createdAt: 'desc' },
            include: {
                customFields: true,
                members: true
            }
        });

        if (!lastGuild) {
            console.log('No guilds found.');
            return;
        }

        console.log('--- GUILD ---');
        console.log(`ID: ${lastGuild.id}, Name: ${lastGuild.name}`);

        console.log('\n--- CUSTOM FIELDS (Config) ---');
        lastGuild.customFields.forEach(f => {
            console.log(`- ${f.fieldName} (${f.fieldType})`);
        });

        const owner = lastGuild.members.find(m => m.role === 'owner');
        if (owner) {
            console.log('\n--- OWNER CHARACTER ---');
            console.log(`Name: ${owner.characterName}`);
            console.log(`Class: ${owner.characterClass}`);
            console.log(`Level: ${owner.characterLevel}`);
            console.log(`Power: ${owner.powerScore}`);
            console.log(`Codex: ${owner.codexScore}`);
            console.log(`Custom Values: ${JSON.stringify(owner.customValues)}`);
        } else {
            console.log('\nNo owner member found!');
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}
main();
