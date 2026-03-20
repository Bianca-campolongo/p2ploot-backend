import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Testing connection...');
    try {
        // @ts-ignore
        if (prisma.supportTicket) {
            console.log("Model EXISTS in client!");
        } else {
            console.log("Model MISSING in client!");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
