import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Testing app prisma instance...');
    try {
        // @ts-ignore
        if (prisma.supportTicket) {
            console.log("Model property 'supportTicket' EXISTS on exported instance.");
            const count = await prisma.supportTicket.count();
            console.log(`Count: ${count}`);
        } else {
            console.error("Model property 'supportTicket' is UNDEFINED on exported instance.");
            console.log("Keys available:", Object.keys(prisma));
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        // @ts-ignore
        await prisma.$disconnect();
    }
}

main();
