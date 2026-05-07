import { PublicKey, Transaction } from '@solana/web3.js';
import { normalizeSolanaNetwork } from '@/lib/web3';

type KoraRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type KoraRpcResponse<T> = {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: KoraRpcError;
};

export type KoraSignAndSendResult = {
  signature: string;
  signed_transaction?: string;
  signer_pubkey?: string;
};

function configured(value?: string): boolean {
  return Boolean(value && value.trim().length > 0);
}

function getKoraNetwork() {
  return normalizeSolanaNetwork(process.env.KORA_NETWORK || process.env.SOLANA_NETWORK || 'devnet');
}

function getKoraRpcUrl(): string | null {
  return configured(process.env.KORA_RPC_URL) ? process.env.KORA_RPC_URL!.trim() : null;
}

export function getKoraFeePayerAddress(): string | null {
  return configured(process.env.KORA_FEE_PAYER_ADDRESS) ? process.env.KORA_FEE_PAYER_ADDRESS!.trim() : null;
}

export function getKoraFeePayerPublicKey(network?: string | null): PublicKey | null {
  if (!isKoraSignAndSendEnabled(network)) return null;
  const address = getKoraFeePayerAddress();
  if (!address) return null;
  return new PublicKey(address);
}

export function isKoraSignAndSendEnabled(network?: string | null): boolean {
  const targetNetwork = normalizeSolanaNetwork(network || process.env.SOLANA_NETWORK || 'devnet');
  return (
    process.env.KORA_SIGN_AND_SEND_ENABLED !== 'false' &&
    targetNetwork === 'devnet' &&
    getKoraNetwork() === 'devnet' &&
    Boolean(getKoraRpcUrl()) &&
    Boolean(getKoraFeePayerAddress())
  );
}

async function callKoraRpc<T>(method: string, params: unknown): Promise<T> {
  const url = getKoraRpcUrl();
  if (!url) {
    throw new Error('KORA_RPC_URL is not configured');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.KORA_API_KEY ? { Authorization: `Bearer ${process.env.KORA_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as KoraRpcResponse<T>;

  if (!response.ok || payload.error || !payload.result) {
    const message = payload.error?.message || `Kora ${method} failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload.result;
}

export async function koraSignAndSendTransaction(transaction: Transaction): Promise<KoraSignAndSendResult> {
  const serialized = transaction
    .serialize({ requireAllSignatures: false, verifySignatures: true })
    .toString('base64');
  const result = await callKoraRpc<KoraSignAndSendResult>('signAndSendTransaction', {
    transaction: serialized,
  });

  if (!result.signature) {
    throw new Error('Kora signAndSendTransaction did not return a signature');
  }

  const expectedSigner = getKoraFeePayerAddress();
  if (expectedSigner && result.signer_pubkey && result.signer_pubkey !== expectedSigner) {
    throw new Error(`Kora signer mismatch: expected ${expectedSigner}, got ${result.signer_pubkey}`);
  }

  return result;
}
