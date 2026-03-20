const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    let output = '';
    const log = (msg) => { output += msg + '\n'; };

    try {
        const users = await prisma.profile.findMany();
        log('--- PROFILES ---');
        users.forEach(u => log(JSON.stringify({ id: u.id, email: u.email, username: u.username, walletAddress: u.walletAddress })));

        const guilds = await prisma.guild.findMany();
        log('\n--- GUILDS ---');
        guilds.forEach(g => log(JSON.stringify({ id: g.id.toString(), name: g.name, ownerId: g.ownerId, ownerAddress: g.ownerAddress })));

        fs.writeFileSync('db-data.txt', output);
        console.log('Done.');
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}
main();
