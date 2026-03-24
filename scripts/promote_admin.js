const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'bianca.campolongo1@gmail.com';
  console.log(`Checking profile for: ${email}`);
  
  const profile = await prisma.profile.findUnique({
    where: { email }
  });

  if (!profile) {
    console.log('Profile not found in database. Restoration might be incomplete or user never logged in.');
    // List all profiles to see what we have
    const allProfiles = await prisma.profile.findMany();
    console.log('Available profiles:', allProfiles.map(p => p.email));
    return;
  }

  console.log(`Current role: ${profile.role}`);
  
  if (profile.role !== 'admin') {
    console.log('Updating role to admin...');
    await prisma.profile.update({
      where: { email },
      data: { role: 'admin' }
    });
    console.log('Role updated successfully!');
  } else {
    console.log('User is already an admin.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
