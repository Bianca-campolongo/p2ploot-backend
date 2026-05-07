const API_BASE = process.env.API_BASE || 'http://localhost:6110';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

async function createDevnetDemoWallet(token) {
  const data = await request('POST', '/api/web3/wallets/devnet-demo', null, token);
  assert(data.wallet?.address, 'Missing devnet demo wallet');
  return data;
}

async function createConversation(adId, token, message) {
  const data = await request('POST', `/api/ads/${adId}/conversation`, { message }, token);
  assert(data.conversationId, 'Missing conversationId');
  return data.conversationId;
}

async function createEscrow(token, conversationId) {
  const data = await request('POST', '/api/web3/escrows', {
    conversationId,
    network: 'devnet',
    currencySymbol: 'SOL',
    amountUi: '0.001',
    metadata: { smoke: 'devnet-demo' },
  }, token);
  assert(data.deal?.id, 'Missing escrow deal');
  return data.deal;
}

async function patchEscrow(token, id, action, extra = {}) {
  const data = await request('PATCH', `/api/web3/escrows/${id}`, { action, ...extra }, token);
  assert(data.deal?.id === id, `Unexpected deal id after ${action}`);
  return data.deal;
}

function latestExplorerUrl(deal) {
  return deal.events?.[0]?.payload?.devnetDemoTx?.explorerUrl || null;
}

function latestDemoMode(deal) {
  return deal.events?.[0]?.payload?.devnetDemoTx?.mode || null;
}

function latestDevnetDemoTx(deal) {
  return deal.events?.[0]?.payload?.devnetDemoTx || null;
}

async function main() {
  const health = await request('GET', '/api/health');
  assert(health.status === 'ok', 'Health check is not ok');

  const buyer = await login('player2@talon.com');
  const seller = await login('player1@talon.com');

  const buyerWallet = await createDevnetDemoWallet(buyer.token);
  const sellerWallet = await createDevnetDemoWallet(seller.token);

  const conversationId = await createConversation(1, buyer.token, `Smoke Web3 devnet ${Date.now()}`);
  const deal = await createEscrow(buyer.token, conversationId);

  let current = await patchEscrow(buyer.token, deal.id, 'record_deposit');
  assert(current.status === 'funded', 'Deposit did not fund escrow');
  assert(current.depositTx, 'Missing real deposit tx');
  assert(current.vaultAddress, 'Missing devnet vault address');
  assert(current.escrowPda, 'Missing Anchor escrow PDA');
  assert(current.assetMint, 'Missing Anchor asset mint');
  const depositExplorer = latestExplorerUrl(current);
  const depositMode = latestDemoMode(current);
  assert(depositMode === 'solana_devnet_anchor_escrow', `Deposit did not use Anchor escrow program: ${depositMode}`);
  assert(depositExplorer, 'Missing deposit explorer URL');

  current = await patchEscrow(seller.token, deal.id, 'seller_confirm');
  assert(current.status === 'seller_confirmed', 'Seller confirm did not update status');
  assert(current.sellerConfirmTx, 'Missing seller confirm tx');
  const sellerConfirmMode = latestDemoMode(current);
  assert(sellerConfirmMode === 'solana_devnet_anchor_escrow', `Seller confirm did not use Anchor escrow program: ${sellerConfirmMode}`);

  current = await patchEscrow(buyer.token, deal.id, 'release');
  assert(current.status === 'released', 'Release did not finalize escrow');
  assert(current.releaseTx, 'Missing real release tx');
  const releaseDemoTx = latestDevnetDemoTx(current);
  assert(releaseDemoTx?.mode === 'solana_devnet_anchor_escrow', `Release did not use Anchor escrow program: ${releaseDemoTx?.mode}`);
  assert(releaseDemoTx?.platformFeeAddress, 'Missing platform fee wallet address');
  assert(releaseDemoTx.platformFeeBps === 250, 'Unexpected platform fee bps');
  assert(releaseDemoTx.platformFeeLamports === 25000, 'Unexpected platform fee lamports');
  assert(releaseDemoTx.sellerLamports === 975000, 'Unexpected seller net lamports');
  const releaseExplorer = latestExplorerUrl(current);
  const releaseMode = latestDemoMode(current);
  assert(releaseExplorer, 'Missing release explorer URL');

  console.log(JSON.stringify({
    ok: true,
    mode: releaseMode || depositMode || 'solana_devnet_system_transfer_demo',
    deal: deal.id,
    buyerWallet: buyerWallet.wallet.address,
    sellerWallet: sellerWallet.wallet.address,
    vaultAddress: current.vaultAddress,
    platformFeeAddress: releaseDemoTx.platformFeeAddress,
    platformFeeBps: releaseDemoTx.platformFeeBps,
    platformFeeLamports: releaseDemoTx.platformFeeLamports,
    sellerLamports: releaseDemoTx.sellerLamports,
    depositTx: current.depositTx,
    releaseTx: current.releaseTx,
    depositMode,
    sellerConfirmMode,
    releaseMode,
    depositExplorer,
    releaseExplorer,
    apiBase: API_BASE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
