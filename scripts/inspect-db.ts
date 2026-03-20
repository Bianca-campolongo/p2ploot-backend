import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Inspecionando Banco de Dados...');

    try {
        console.log('\n----------------------------------------');
        console.log('Tabela: conversations (lowercase)');
        // Use SQL verify columns
        const conversationColumns = await prisma.$queryRaw`DESCRIBE conversations;`;
        console.table(conversationColumns);

        console.log('\n----------------------------------------');
        console.log('Tabela: profiles (lowercase)');
        const profileColumns = await prisma.$queryRaw`DESCRIBE profiles;`;
        console.table(profileColumns);

        console.log('\n✅ Inspeção concluída!');
    } catch (error) {
        console.error('❌ Erro ao inspecionar:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
