// Função de teste de conexão usando Prisma (via DATABASE_URL do .env)
import { prisma } from './db';

export async function testConnection() {
  try {
    // Testar conexão usando Prisma
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Erro de conexão MySQL:', error);
    return false;
  }
}
