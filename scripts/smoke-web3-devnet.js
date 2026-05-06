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
  const depositExplorer = latestExplorerUrl(current);
  const depositMode = latestDemoMode(current);

  current = await patchEscrow(seller.token, deal.id, 'seller_confirm');
  assert(current.status === 'seller_confirmed', 'Seller confirm did not update status');

  current = await patchEscrow(buyer.token, deal.id, 'release');
  assert(current.status === 'released', 'Release did not finalize escrow');
  assert(current.releaseTx, 'Missing real release tx');
  const releaseExplorer = latestExplorerUrl(current);
  const releaseMode = latestDemoMode(current);

  console.log(JSON.stringify({
    ok: true,
    mode: releaseMode || depositMode || 'solana_devnet_system_transfer_demo',
    deal: deal.id,
    buyerWallet: buyerWallet.wallet.address,
    sellerWallet: sellerWallet.wallet.address,
    vaultAddress: current.vaultAddress,
    depositTx: current.depositTx,
    releaseTx: current.releaseTx,
    depositMode,
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
