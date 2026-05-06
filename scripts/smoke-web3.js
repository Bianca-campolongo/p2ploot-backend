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

function wallet(seed) {
  return (`P2P${seed}${Date.now()}1111111111111111111111111111111111111111`)
    .replace(/[^1-9A-HJ-NP-Za-km-z]/g, '')
    .slice(0, 44);
}

function tx(prefix) {
  return `${prefix}${Date.now()}1111111111111111111111111111111111111111111111`.slice(0, 88);
}

async function linkWallet(token, address) {
  const data = await request('POST', '/api/web3/wallets', {
    address,
    network: 'devnet',
    provider: 'privy',
    walletType: 'embedded',
    isPrimary: true,
  }, token);
  assert(data.wallet?.address === address, 'Wallet was not linked');
  return data.wallet;
}

async function createConversation(adId, token, message) {
  const data = await request('POST', `/api/ads/${adId}/conversation`, { message }, token);
  assert(data.conversationId, 'Missing conversationId');
  return data.conversationId;
}

async function createEscrow(token, conversationId, amountUi) {
  const data = await request('POST', '/api/web3/escrows', {
    conversationId,
    network: 'devnet',
    assetMint: 'So11111111111111111111111111111111111111112',
    currencySymbol: 'USDC',
    amountUi,
    amountRaw: String(Math.round(Number(amountUi) * 1_000_000)),
  }, token);
  assert(data.deal?.id, 'Missing escrow deal');
  return data.deal;
}

async function patchEscrow(token, id, action, extra = {}) {
  const data = await request('PATCH', `/api/web3/escrows/${id}`, { action, ...extra }, token);
  assert(data.deal?.id === id, `Unexpected deal id after ${action}`);
  return data.deal;
}

async function expectForbidden(token, id, action) {
  const response = await fetch(`${API_BASE}/api/web3/escrows/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, txSignature: tx('forbidden') }),
  });

  if (response.status !== 403) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Expected 403 for ${action}, got ${response.status}: ${JSON.stringify(data)}`);
  }
}

async function main() {
  const health = await request('GET', '/api/health');
  assert(health.status === 'ok', 'Health check is not ok');

  const buyer = await login('player2@talon.com');
  const seller = await login('player1@talon.com');

  await linkWallet(buyer.token, wallet('Buyer'));
  await linkWallet(seller.token, wallet('Seller'));

  const releaseConversationId = await createConversation(1, buyer.token, 'Smoke Web3 release');
  const releaseDeal = await createEscrow(buyer.token, releaseConversationId, '500.00');

  let current = await patchEscrow(buyer.token, releaseDeal.id, 'record_deposit', {
    txSignature: tx('deposit'),
    programId: 'Prog111111111111111111111111111111111111111',
    escrowPda: 'Escro11111111111111111111111111111111111111',
    vaultAddress: 'Vau1t1111111111111111111111111111111111111',
  });
  assert(current.status === 'funded', 'Deposit did not fund escrow');

  current = await patchEscrow(seller.token, releaseDeal.id, 'seller_confirm', {
    txSignature: tx('seller'),
  });
  assert(current.status === 'seller_confirmed', 'Seller confirm did not update status');

  current = await patchEscrow(buyer.token, releaseDeal.id, 'release', {
    txSignature: tx('release'),
  });
  assert(current.status === 'released', 'Release did not finalize escrow');

  const refundConversationId = await createConversation(2, seller.token, 'Smoke Web3 refund');
  const refundDeal = await createEscrow(seller.token, refundConversationId, '1000.00');

  current = await patchEscrow(seller.token, refundDeal.id, 'record_deposit', {
    txSignature: tx('depositRefund'),
  });
  assert(current.status === 'funded', 'Refund path deposit did not fund escrow');

  await expectForbidden(buyer.token, refundDeal.id, 'release');

  current = await patchEscrow(seller.token, refundDeal.id, 'request_refund', {
    message: 'Smoke refund request',
  });
  assert(current.status === 'refund_requested', 'Refund request did not update status');

  current = await patchEscrow(seller.token, refundDeal.id, 'record_refund', {
    txSignature: tx('refund'),
  });
  assert(current.status === 'refunded', 'Refund did not finalize escrow');

  const draftDeal = await createEscrow(seller.token, refundConversationId, '1000.00');
  const reused = await request('POST', '/api/web3/escrows', {
    conversationId: refundConversationId,
    network: 'devnet',
    currencySymbol: 'USDC',
    amountUi: '1000.00',
  }, seller.token);
  assert(reused.reused === true && reused.deal?.id === draftDeal.id, 'Draft escrow was not reused');

  current = await patchEscrow(seller.token, draftDeal.id, 'cancel', {
    txSignature: tx('cancel'),
  });
  assert(current.status === 'cancelled', 'Cancel did not finalize draft');

  console.log(JSON.stringify({
    ok: true,
    releaseDeal: releaseDeal.id,
    refundDeal: refundDeal.id,
    cancelledDeal: draftDeal.id,
    apiBase: API_BASE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
