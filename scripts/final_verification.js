const { PrismaClient } = require('@prisma/client');
const { deepSerialize } = require('../src/lib/serialize');
const prisma = new PrismaClient();

async function finalTest() {
  console.log('--- Final Verification of deepSerialize ---');
  try {
    const ad = await prisma.marketAd.findFirst();
    if (ad) {
      console.log('Original Ad ID type:', typeof ad.id);
      
      const serialized = deepSerialize(ad);
      console.log('Serialized Ad ID type:', typeof serialized.id);
      console.log('Serialized Ad ID value:', serialized.id);
      
      try {
        const json = JSON.stringify(serialized);
        console.log('JSON.stringify SUCCESS for serialized object');
        console.log('JSON Output (partial):', json.substring(0, 100) + '...');
      } catch (e) {
        console.log('JSON.stringify FAILED:', e.message);
      }
    }

    const event = await prisma.event.findFirst();
    if (event) {
        console.log('\nOriginal Event ID type:', typeof event.id);
        const serializedEvent = deepSerialize(event);
        console.log('Serialized Event ID type:', typeof serializedEvent.id);
        try {
            JSON.stringify(serializedEvent);
            console.log('JSON.stringify SUCCESS for event');
        } catch (e) {
            console.log('JSON.stringify FAILED for event:', e.message);
        }
    }

  } catch (e) {
    console.error('Verification failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

finalTest();
