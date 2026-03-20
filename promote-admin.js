
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'bianca.campolongo1@gmail.com';
    console.log(`Looking for user with email: ${email}...`);

    try {
        const user = await prisma.profile.findUnique({
            where: { email: email },
        });

        if (!user) {
            console.error('User not found!');
            process.exit(1);
        }

        console.log(`Found user: ${user.username} (ID: ${user.id}). Current role: ${user.role}`);

        const updatedUser = await prisma.profile.update({
            where: { email: email },
            data: { role: 'admin' },
        });

        console.log(`User updated successfully! New role: ${updatedUser.role}`);
    } catch (error) {
        console.error('Error updating user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
