const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'bianca.campolongo1@gmail.com';
  console.log(`Buscando e atualizando usuário com o email: ${email}`);
  
  const user = await prisma.profile.updateMany({
    where: { email: email },
    data: { role: 'admin' },
  });
  
  console.log(`Usuários atualizados para admin: ${user.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
