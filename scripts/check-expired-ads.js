const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking for Expired Ads Visibility ---');

    // 1. Create a dummy user if needed (or use existing)
    // We'll try to find an existing user first to avoid clutter
    let user = await prisma.profile.findFirst();
    if (!user) {
        console.log('No user found, creating dummy user...');
        user = await prisma.profile.create({
            data: {
                id: 'dummy-user-' + Date.now(),
                username: 'TestUser',
                email: 'test@example.com'
            }
        });
    }

    // 2. Create an EXPIRED ad
    const expiredAd = await prisma.marketAd.create({
        data: {
            userId: user.id,
            title: 'EXPIRED AD TEST ' + Date.now(),
            description: 'This ad should not be visible',
            price: 100,
            currency: 'SUI',
            status: 'active', // It's active but expired
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired 1 day ago
            sellerAddress: '0x123'
        }
    });
    console.log(`Created expired ad: ${expiredAd.id} (Expires at: ${expiredAd.expiresAt})`);

    // 3. Run the query used in the API (UPDATED WITH FIX)
    const where = {
        status: 'active',
        expiresAt: { gt: new Date() }
    };
    const ads = await prisma.marketAd.findMany({
        where,
        select: { id: true, title: true, expiresAt: true }
    });

    // 4. Check if the expired ad is in the results
    const found = ads.find(a => a.id === expiredAd.id);

    if (found) {
        console.log('⚠️ FAILURE: Expired ad WAS returned by the query!');
        console.log('Ad details:', found);
    } else {
        console.log('✅ SUCCESS: Expired ad was NOT returned by the query.');
    }

    // 5. Cleanup
    await prisma.marketAd.delete({ where: { id: expiredAd.id } });
    console.log('Cleaned up test ad.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
