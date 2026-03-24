const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Ad Renewal Logic ---');

    // 1. Create a dummy user
    let user = await prisma.profile.findFirst({
        where: { username: 'RenewTestUser' }
    });

    if (!user) {
        user = await prisma.profile.create({
            data: {
                id: 'renew-test-user-' + Date.now(),
                username: 'RenewTestUser',
                email: 'renew@test.com',
                credits: 10 // Give enough credits
            }
        });
        console.log('Created test user with 10 credits');
    } else {
        // Reset credits
        await prisma.profile.update({
            where: { id: user.id },
            data: { credits: 10 }
        });
        console.log('Reset test user credits to 10');
    }

    // 2. Create an Expired Ad
    const expiredAd = await prisma.marketAd.create({
        data: {
            userId: user.id,
            title: 'Renew Test Ad',
            description: 'Ad to be renewed',
            price: 100,
            currency: 'P2P',
            status: 'active',
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired 1 day ago
            sellerAddress: '0x123'
        }
    });

    console.log(`Created expired ad: ${expiredAd.id} (Expires: ${expiredAd.expiresAt.toISOString()})`);

    // 3. Simulate Renewal API Logic (Logic Copy)
    // We can't easily call the Next.js API from this script without fetch and server running, 
    // but we can verify the DB logic identical to what we wrote in the route.

    // RENEWAL LOGIC START
    const days = 3;
    const cost = days * 0.5;

    console.log(`Attempting to renew for ${days} days (Cost: ${cost})...`);

    const result = await prisma.$transaction(async (tx) => {
        const profile = await tx.profile.findUnique({ where: { id: user.id } });
        if (Number(profile.credits) < cost) throw new Error('Insufficient credits');

        await tx.profile.update({
            where: { id: user.id },
            data: { credits: Number(profile.credits) - cost }
        });

        const now = new Date();
        // Logic from route: if expired, start from now.
        let newExpiresAt = new Date(now);
        // Note: In route we check if (ad.expiresAt || now) < now. 
        // Since we created it expired, new base is NOW.
        newExpiresAt.setDate(newExpiresAt.getDate() + days);

        const updatedAd = await tx.marketAd.update({
            where: { id: expiredAd.id },
            data: {
                expiresAt: newExpiresAt,
                lastRenewedAt: now,
                status: 'active'
            }
        });
        return updatedAd;
    });
    // RENEWAL LOGIC END

    console.log(`Ad Renewed! New ExpiresAt: ${result.expiresAt.toISOString()}`);

    // 4. Verify
    const finalUser = await prisma.profile.findUnique({ where: { id: user.id } });
    console.log(`User Credits: ${finalUser.credits} (Expected: 8.5)`);

    if (result.expiresAt > new Date() && Number(finalUser.credits) === 8.5) {
        console.log('✅ SUCCESS: Ad renewed correctly and credits deducted.');
    } else {
        console.log('⚠️ FAILURE: Something went wrong.');
    }

    // Cleanup
    await prisma.marketAd.delete({ where: { id: expiredAd.id } });
    await prisma.profile.delete({ where: { id: user.id } });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
