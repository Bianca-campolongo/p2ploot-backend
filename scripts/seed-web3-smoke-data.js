const { PrismaClient } = require("@prisma/client");

const ENABLED = process.env.DOKPLOY_WEB3_SMOKE_SEED === "true";
const BUYER_EMAIL = process.env.SMOKE_BUYER_EMAIL || "player2@talon.com";
const SELLER_EMAIL = process.env.SMOKE_SELLER_EMAIL || "player1@talon.com";
const SMOKE_AD_TITLE = process.env.SMOKE_AD_TITLE || "Smoke Web3 Devnet QA";
const SMOKE_RELEASE_AD_TITLE =
  process.env.SMOKE_RELEASE_AD_TITLE || "Smoke Web3 Release QA";
const SMOKE_REFUND_AD_TITLE =
  process.env.SMOKE_REFUND_AD_TITLE || "Smoke Web3 Refund QA";

function assertAllowedDatabase() {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error("DATABASE_URL is required for smoke seed");
  }

  const url = new URL(rawUrl);
  const allowedHosts = (
    process.env.DOKPLOY_WEB3_SMOKE_SEED_ALLOWED_HOSTS || "p2p-loot-db-5a5aun"
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Refusing smoke seed on unexpected DB host: ${url.hostname}`);
  }
}

async function upsertProfile(prisma, email, username) {
  return prisma.profile.upsert({
    where: { email },
    update: {
      username,
      credits: 10,
    },
    create: {
      email,
      username,
      primaryAuthMethod: "email",
      credits: 10,
    },
  });
}

async function ensureSmokeAd(prisma, ownerId, title) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.marketAd.findFirst({
    where: {
      userId: ownerId,
      title,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.marketAd.update({
      where: { id: existing.id },
      data: {
        status: "active",
        expiresAt,
        lastRenewedAt: new Date(),
        approvedAt: new Date(),
        approvedById: ownerId,
      },
    });
  }

  return prisma.marketAd.create({
    data: {
      userId: ownerId,
      title,
      description: "QA seed for remote Web3 devnet smoke.",
      price: 10,
      currency: "SOL",
      game: "Legend of Ymir",
      server: "QA",
      region: "Global",
      type: "Itens",
      status: "active",
      expiresAt,
      lastRenewedAt: new Date(),
      approvedAt: new Date(),
      approvedById: ownerId,
    },
  });
}

async function main() {
  if (!ENABLED) {
    console.log("[web3-smoke-seed] disabled");
    return;
  }

  assertAllowedDatabase();

  const prisma = new PrismaClient();

  try {
    const seller = await upsertProfile(prisma, SELLER_EMAIL, "QA Seller");
    const buyer = await upsertProfile(prisma, BUYER_EMAIL, "QA Buyer");
    const devnetAd = await ensureSmokeAd(prisma, seller.id, SMOKE_AD_TITLE);
    const releaseAd = await ensureSmokeAd(
      prisma,
      seller.id,
      SMOKE_RELEASE_AD_TITLE
    );
    const refundAd = await ensureSmokeAd(
      prisma,
      buyer.id,
      SMOKE_REFUND_AD_TITLE
    );

    console.log(
      JSON.stringify({
        message: "[web3-smoke-seed] ready",
        buyerEmail: buyer.email,
        sellerEmail: seller.email,
        devnetAdId: devnetAd.id.toString(),
        releaseAdId: releaseAd.id.toString(),
        refundAdId: refundAd.id.toString(),
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[web3-smoke-seed] failed", error);
  process.exit(1);
});
