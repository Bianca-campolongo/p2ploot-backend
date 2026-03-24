const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSerialization() {
  console.log('--- Testing Serialization of MarketAd ---');
  try {
    const ad = await prisma.marketAd.findFirst({
        where: { id: { not: 0 } }
    });
    
    if (ad) {
      console.log('Found Ad ID:', ad.id);
      console.log('Type of ID:', typeof ad.id);
      
      try {
        const json = JSON.stringify(ad);
        console.log('JSON.stringify SUCCESS');
      } catch (e) {
        console.log('JSON.stringify FAILED:', e.message);
      }
    } else {
      console.log('No Ads found to test.');
    }

    console.log('\n--- Testing Serialization of Guild ---');
    const guild = await prisma.guild.findFirst();
    if (guild) {
        console.log('Found Guild ID:', guild.id);
        console.log('Type of ID:', typeof guild.id);
        try {
            const json = JSON.stringify(guild);
            console.log('JSON.stringify SUCCESS');
        } catch (e) {
            console.log('JSON.stringify FAILED:', e.message);
        }
    }

  } catch (e) {
    console.error('Test failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

testSerialization();
