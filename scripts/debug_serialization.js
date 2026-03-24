const { deepSerialize } = require('../src/lib/serialize');
const Decimal = require('decimal.js').default || require('decimal.js');

// Simulate a Prisma object with BigInt and Decimal
const prismaObj = {
    id: BigInt(1234567890),
    title: 'Test Ad',
    price: new Decimal('100.50'),
    createdAt: new Date(),
    user: {
        id: 'user-uuid',
        username: 'testuser'
    }
};

console.log('--- Original Object ---');
console.log(prismaObj);

console.log('\n--- JSON.stringify test (standard) ---');
try {
    console.log(JSON.stringify(prismaObj));
} catch (e) {
    console.log('Standard JSON.stringify FAILED:', e.message);
}

console.log('\n--- deepSerialize test ---');
try {
    const serialized = deepSerialize(prismaObj);
    console.log('Serialized:', JSON.stringify(serialized, null, 2));
} catch (e) {
    console.log('deepSerialize FAILED:', e.message);
}
