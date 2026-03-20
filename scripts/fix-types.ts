import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Updating old giveaways...');
    const result = await prisma.$executeRawUnsafe(`UPDATE guild_auctions SET type = 'giveaway' WHERE status = 'closed' AND current_bid = 0 AND winner_id IS NOT NULL`);
    console.log('Update result:', result);
    await prisma.$disconnect();
}

main().catch(console.error);
