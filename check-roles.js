
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const emails = ['biacampolongo@gmail.com', 'bianca.campolongo1@gmail.com'];

    console.log('Checking roles...');

    for (const email of emails) {
        const user = await prisma.profile.findUnique({
            where: { email: email },
        });

        if (user) {
            console.log(`Email: ${email}, Role: ${user.role}`);
        } else {
            console.log(`Email: ${email} NOT FOUND`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
