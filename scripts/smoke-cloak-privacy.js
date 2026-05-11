const { PrismaClient } = require('@prisma/client');

const API_BASE = process.env.API_BASE || 'http://localhost:6110';
const SELLER_EMAIL = process.env.CLOAK_SMOKE_SELLER_EMAIL || 'cloak-seller@talon.com';
const BUYER_EMAIL = process.env.CLOAK_SMOKE_BUYER_EMAIL || 'cloak-buyer@talon.com';
const RUN_ID = process.env.CLOAK_SMOKE_RUN_ID || String(Date.now());
const AD_TITLE = process.env.CLOAK_SMOKE_AD_TITLE || `Cloak Privacy Smoke QA ${RUN_ID}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAllowedDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL is required for Cloak smoke seed');

  const url = new URL(rawUrl);
  const allowedHosts = (
    process.env.CLOAK_SMOKE_ALLOWED_HOSTS || 'localhost,127.0.0.1,p2p-loot-db-5a5aun'
  )
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Refusing Cloak smoke seed on unexpected DB host: ${url.hostname}`);
  }
}

async function request(method, path, body, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function login(email) {
  const data = await request('POST', '/api/auth/login', { email });
  assert(data.token, `Missing token for ${email}`);
  return data;
}

async function seedCloakAd() {
  assertAllowedDatabase();
  const prisma = new PrismaClient();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const seller = await prisma.profile.upsert({
      where: { email: SELLER_EMAIL },
      update: { username: 'Cloak Seller QA', credits: 10 },
      create: {
        email: SELLER_EMAIL,
        username: 'Cloak Seller QA',
        primaryAuthMethod: 'email',
        credits: 10,
      },
    });

    const buyer = await prisma.profile.upsert({
      where: { email: BUYER_EMAIL },
      update: { username: 'Cloak Buyer QA', credits: 10, isPrivate: true },
      create: {
        email: BUYER_EMAIL,
        username: 'Cloak Buyer QA',
        primaryAuthMethod: 'email',
        credits: 10,
        isPrivate: true,
      },
    });

    const ad = await prisma.marketAd.create({
      data: {
        userId: seller.id,
        title: AD_TITLE,
        description: 'QA seed for Cloak privacy metadata smoke.',
        price: 10,
        currency: 'SOL',
        game: 'Legend of Ymir',
        server: 'Cloak-QA',
        region: 'Global',
        type: 'Itens',
        status: 'active',
        cloakSellerPrivacyEnabled: true,
        expiresAt,
        lastRenewedAt: new Date(),
        approvedAt: new Date(),
        approvedById: seller.id,
      },
    });

    return {
      sellerId: seller.id,
      buyerId: buyer.id,
      adId: ad.id.toString(),
      title: ad.title,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function main() {
  const health = await request('GET', '/api/health');
  assert(health.status === 'ok', 'Health check is not ok');

  const seed = await seedCloakAd();
  const buyer = await login(BUYER_EMAIL);
  const seller = await login(SELLER_EMAIL);

  const conversation = await request(
    'POST',
    `/api/ads/${seed.adId}/conversation`,
    { message: 'Cloak privacy smoke' },
    buyer.token
  );
  assert(conversation.conversationId, 'Missing conversationId');

  const escrow = await request(
    'POST',
    '/api/web3/escrows',
    {
      conversationId: conversation.conversationId,
      network: 'devnet',
      currencySymbol: 'SOL',
      amountUi: '10',
      metadata: {
        cloakPrivacy: {
          buyerRequested: true,
        },
      },
    },
    buyer.token
  );

  const cloakPrivacy = asObject(asObject(escrow.deal?.metadata).cloakPrivacy);
  assert(cloakPrivacy.enabled === true, 'Cloak privacy was not enabled');
  assert(cloakPrivacy.sellerRequested === true, 'Seller privacy intent was not preserved');
  assert(cloakPrivacy.buyerRequested === true, 'Buyer privacy intent was not preserved');
  assert(cloakPrivacy.provider === 'cloak', 'Unexpected privacy provider');
  assert(cloakPrivacy.version === 1, 'Missing Cloak metadata version');
  assert(cloakPrivacy.feeModel?.fixedFeeSol !== undefined, 'Missing fixed Cloak fee');
  assert(cloakPrivacy.feeModel?.variableFeeBps !== undefined, 'Missing variable Cloak fee');
  assert(cloakPrivacy.devnet === undefined, 'Cloak devnet config should not be persisted in escrow metadata');
  assert(cloakPrivacy.disclosure === undefined, 'Cloak disclosure text should not be persisted in escrow metadata');

  const sellerConversations = await request('GET', `/api/ads/${seed.adId}/conversation`, null, seller.token);
  const maskedConversation = sellerConversations.conversations?.find(
    (item) => item.id === conversation.conversationId
  );
  assert(maskedConversation, 'Seller conversation not found');
  assert(maskedConversation.buyer?.username === 'Comprador privado via Cloak', 'Buyer was not masked for seller');
  assert(maskedConversation.buyer_privacy_requested === true, 'Buyer privacy flag missing for seller');
  assert(maskedConversation.privacy?.cloak?.enabled === true, 'Seller privacy response missing Cloak enabled flag');

  console.log(JSON.stringify({
    ok: true,
    adId: seed.adId,
    conversationId: conversation.conversationId,
    escrowDealId: escrow.deal.id,
    cloakPrivacy,
    apiBase: API_BASE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
