import fs from 'node:fs';
import path from 'node:path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { normalizeSolanaNetwork } from '@/lib/web3';

type StoredWallet = {
  label: string;
  publicKey: string;
  secretKey: string;
  createdAt: string;
  updatedAt: string;
};

type WalletStore = {
  version: 1;
  wallets: Record<string, StoredWallet>;
};

type DemoDeal = {
  id: string;
  buyerId: string;
  sellerId: string;
  network: string;
  vaultAddress?: string | null;
};

export type DevnetDemoAction = 'record_deposit' | 'release' | 'record_refund';

export type DevnetDemoTxResult = {
  mode: 'solana_devnet_system_transfer_demo' | 'local_fallback_after_devnet_unavailable';
  action: DevnetDemoAction;
  signature: string;
  fromAddress: string;
  toAddress: string;
  buyerAddress: string;
  sellerAddress: string;
  platformFeeAddress: string;
  vaultAddress: string;
  lamports: number;
  sellerLamports: number;
  platformFeeLamports: number;
  platformFeeBps: number;
  feeReserveLamports: number;
  explorerUrl: string | null;
  fallbackReason?: string;
};

const DEMO_ACTIONS = new Set<string>(['record_deposit', 'release', 'record_refund']);
const DEFAULT_STORE_PATH = path.resolve(process.cwd(), '..', '.local-infra', 'solana-devnet-wallets.json');
const DEFAULT_TRANSFER_LAMPORTS = 1_000_000;
const DEFAULT_FEE_RESERVE_LAMPORTS = 20_000;
const DEFAULT_PLATFORM_FEE_BPS = 250;
const DEFAULT_AIRDROP_LAMPORTS = Math.round(0.05 * LAMPORTS_PER_SOL);
const DEFAULT_RPC_TIMEOUT_MS = 20_000;

function getStorePath(): string {
  return process.env.SOLANA_DEVNET_DEMO_WALLET_STORE || DEFAULT_STORE_PATH;
}

function readStore(): WalletStore {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return { version: 1, wallets: {} };
  }

  const raw = fs.readFileSync(storePath, 'utf8');
  return JSON.parse(raw) as WalletStore;
}

function writeStore(store: WalletStore) {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function keypairFromStoredWallet(wallet: StoredWallet): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(wallet.secretKey, 'base64')));
}

function getOrCreateKeypair(label: string): Keypair {
  const store = readStore();
  const existing = store.wallets[label];
  if (existing) {
    return keypairFromStoredWallet(existing);
  }

  const keypair = Keypair.generate();
  const now = new Date().toISOString();
  store.wallets[label] = {
    label,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64'),
    createdAt: now,
    updatedAt: now,
  };
  writeStore(store);
  return keypair;
}

export function getDevnetDemoConnection(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');
}

export function getDevnetDemoTransferLamports(): number {
  const configured = Number(process.env.SOLANA_DEVNET_DEMO_LAMPORTS || DEFAULT_TRANSFER_LAMPORTS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TRANSFER_LAMPORTS;
}

function getRpcTimeoutMs(): number {
  const configured = Number(process.env.SOLANA_DEVNET_DEMO_RPC_TIMEOUT_MS || DEFAULT_RPC_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_RPC_TIMEOUT_MS;
}

function shouldAutoAirdrop(): boolean {
  return process.env.SOLANA_DEVNET_DEMO_AUTO_AIRDROP === 'true';
}

function shouldUsePlatformFunder(): boolean {
  return process.env.SOLANA_DEVNET_DEMO_FUNDER_ENABLED !== 'false';
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = getRpcTimeoutMs()): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export function getFeeReserveLamports(): number {
  const configured = Number(process.env.SOLANA_DEVNET_DEMO_FEE_RESERVE_LAMPORTS || DEFAULT_FEE_RESERVE_LAMPORTS);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : DEFAULT_FEE_RESERVE_LAMPORTS;
}

export function getPlatformFeeBps(): number {
  const configured = Number(process.env.PLATFORM_FEE_BPS || DEFAULT_PLATFORM_FEE_BPS);
  if (!Number.isFinite(configured)) return DEFAULT_PLATFORM_FEE_BPS;
  return Math.min(10_000, Math.max(0, Math.floor(configured)));
}

export function getPlatformFeeLamports(grossLamports: number): number {
  return Math.floor((grossLamports * getPlatformFeeBps()) / 10_000);
}

export function getPlatformFeeKeypair(): Keypair {
  return getOrCreateKeypair('platform:owner-fee-wallet');
}

export function isDevnetDemoEnabled(network?: string | null): boolean {
  const configured = process.env.SOLANA_DEVNET_DEMO_ENABLED;
  const enabled = configured === 'true' || (configured !== 'false' && process.env.NODE_ENV !== 'production');
  return enabled && normalizeSolanaNetwork(network ?? undefined) === 'devnet';
}

export function isDevnetDemoAction(action: string): action is DevnetDemoAction {
  return DEMO_ACTIONS.has(action);
}

export function getOrCreateUserDevnetDemoKeypair(userId: string): Keypair {
  return getOrCreateKeypair(`user:${userId}`);
}

export function getPlatformDevnetDemoAddress(): string {
  return getPlatformFeeKeypair().publicKey.toBase58();
}

async function fundFromPlatformWallet(
  connection: Connection,
  publicKey: PublicKey,
  minLamports: number,
  currentBalance: number
): Promise<string | null> {
  if (!shouldUsePlatformFunder()) {
    return null;
  }

  const funder = getPlatformFeeKeypair();
  if (funder.publicKey.equals(publicKey)) {
    return null;
  }

  const topUpLamports = Math.max(0, minLamports - currentBalance + getFeeReserveLamports());
  if (topUpLamports <= 0) {
    return null;
  }

  const reserveLamports = Number(process.env.SOLANA_DEVNET_DEMO_FUNDER_RESERVE_LAMPORTS || 50_000_000);
  const funderBalance = await withTimeout(connection.getBalance(funder.publicKey, 'confirmed'), 'Solana get funder balance');
  if (funderBalance < topUpLamports + Math.max(0, reserveLamports)) {
    return null;
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: publicKey,
      lamports: topUpLamports,
    })
  );

  return withTimeout(
    sendAndConfirmTransaction(connection, transaction, [funder], { commitment: 'confirmed' }),
    'Solana platform funding transfer',
    Math.max(getRpcTimeoutMs(), 30_000)
  );
}

function localFallbackSignature(action: DevnetDemoAction, dealId: string): string {
  return `${action}${Date.now()}${dealId.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '')}111111111111111111111111111111111111111111111111`.slice(0, 88);
}

export function buildLocalDevnetDemoFallback(deal: DemoDeal, action: DevnetDemoAction, error: unknown): DevnetDemoTxResult {
  const buyer = getOrCreateKeypair(`user:${deal.buyerId}`);
  const seller = getOrCreateKeypair(`user:${deal.sellerId}`);
  const platformFeeWallet = getPlatformFeeKeypair();
  const vault = getOrCreateKeypair(`escrow-vault:${deal.id}`);
  const from = action === 'record_deposit' ? buyer.publicKey : vault.publicKey;
  const grossLamports = getDevnetDemoTransferLamports();
  const platformFeeLamports = action === 'release' ? getPlatformFeeLamports(grossLamports) : 0;
  const sellerLamports = action === 'release' ? Math.max(0, grossLamports - platformFeeLamports) : 0;
  const to = action === 'release'
    ? seller.publicKey
    : action === 'record_refund'
      ? buyer.publicKey
      : vault.publicKey;

  return {
    mode: 'local_fallback_after_devnet_unavailable',
    action,
    signature: localFallbackSignature(action, deal.id),
    fromAddress: from.toBase58(),
    toAddress: to.toBase58(),
    buyerAddress: buyer.publicKey.toBase58(),
    sellerAddress: seller.publicKey.toBase58(),
    platformFeeAddress: platformFeeWallet.publicKey.toBase58(),
    vaultAddress: vault.publicKey.toBase58(),
    lamports: grossLamports,
    sellerLamports,
    platformFeeLamports,
    platformFeeBps: getPlatformFeeBps(),
    feeReserveLamports: getFeeReserveLamports(),
    explorerUrl: null,
    fallbackReason: error instanceof Error ? error.message : 'Solana devnet unavailable',
  };
}

export async function ensureDevnetDemoFunds(publicKey: PublicKey, minLamports = getDevnetDemoTransferLamports() + getFeeReserveLamports() + 10_000) {
  const connection = getDevnetDemoConnection();
  const balance = await withTimeout(connection.getBalance(publicKey, 'confirmed'), 'Solana getBalance');
  if (balance >= minLamports) {
    return { balance, airdropSignature: null as string | null };
  }

  const funderSignature = await fundFromPlatformWallet(connection, publicKey, minLamports, balance);
  if (funderSignature) {
    const fundedBalance = await withTimeout(connection.getBalance(publicKey, 'confirmed'), 'Solana getBalance after platform funding');
    if (fundedBalance >= minLamports) {
      return { balance: fundedBalance, airdropSignature: funderSignature };
    }
  }

  if (!shouldAutoAirdrop()) {
    throw new Error(`Devnet wallet has insufficient balance (${balance} lamports) and auto airdrop is disabled`);
  }

  const signature = await withTimeout(connection.requestAirdrop(publicKey, DEFAULT_AIRDROP_LAMPORTS), 'Solana requestAirdrop');
  await withTimeout(connection.confirmTransaction(signature, 'confirmed'), 'Solana confirmAirdrop');
  const updatedBalance = await withTimeout(connection.getBalance(publicKey, 'confirmed'), 'Solana getBalance after airdrop');
  return { balance: updatedBalance, airdropSignature: signature };
}

export async function executeDevnetDemoEscrowTransfer(deal: DemoDeal, action: DevnetDemoAction): Promise<DevnetDemoTxResult> {
  if (!isDevnetDemoEnabled(deal.network)) {
    throw new Error('Solana devnet demo is disabled for this escrow');
  }

  const connection = getDevnetDemoConnection();
  const buyer = getOrCreateKeypair(`user:${deal.buyerId}`);
  const seller = getOrCreateKeypair(`user:${deal.sellerId}`);
  const platformFeeWallet = getPlatformFeeKeypair();
  const vault = getOrCreateKeypair(`escrow-vault:${deal.id}`);
  const transferLamports = getDevnetDemoTransferLamports();
  const platformFeeLamports = getPlatformFeeLamports(transferLamports);
  const sellerLamports = Math.max(0, transferLamports - platformFeeLamports);
  const feeReserveLamports = getFeeReserveLamports();

  let from: Keypair;
  let to: PublicKey;
  let lamports: number;

  if (action === 'record_deposit') {
    await ensureDevnetDemoFunds(buyer.publicKey, transferLamports + feeReserveLamports + 10_000);
    from = buyer;
    to = vault.publicKey;
    lamports = transferLamports + feeReserveLamports;
  } else {
    const vaultBalance = await withTimeout(connection.getBalance(vault.publicKey, 'confirmed'), 'Solana get vault balance');
    if (vaultBalance < transferLamports + 5_000) {
      throw new Error(`Escrow vault has insufficient devnet balance (${vaultBalance} lamports)`);
    }

    from = vault;
    to = action === 'release' ? seller.publicKey : buyer.publicKey;
    lamports = Math.min(transferLamports, vaultBalance - 5_000);
  }

  const transaction = new Transaction();
  if (action === 'release') {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: seller.publicKey,
        lamports: sellerLamports,
      })
    );

    if (platformFeeLamports > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: from.publicKey,
          toPubkey: platformFeeWallet.publicKey,
          lamports: platformFeeLamports,
        })
      );
    }
  } else {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports,
      })
    );
  }

  const signature = await withTimeout(
    sendAndConfirmTransaction(connection, transaction, [from], {
      commitment: 'confirmed',
    }),
    'Solana sendAndConfirmTransaction',
    Math.max(getRpcTimeoutMs(), 30_000)
  );

  return {
    mode: 'solana_devnet_system_transfer_demo',
    action,
    signature,
    fromAddress: from.publicKey.toBase58(),
    toAddress: to.toBase58(),
    buyerAddress: buyer.publicKey.toBase58(),
    sellerAddress: seller.publicKey.toBase58(),
    platformFeeAddress: platformFeeWallet.publicKey.toBase58(),
    vaultAddress: vault.publicKey.toBase58(),
    lamports,
    sellerLamports: action === 'release' ? sellerLamports : 0,
    platformFeeLamports: action === 'release' ? platformFeeLamports : 0,
    platformFeeBps: getPlatformFeeBps(),
    feeReserveLamports,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}
