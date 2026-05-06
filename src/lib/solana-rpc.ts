const SOLANA_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

type SolanaRpcResponse<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type SignatureStatus = {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
};

export type SolanaSignatureValidation = {
  enabled: boolean;
  valid: boolean;
  signature: string;
  status?: SignatureStatus | null;
  error?: string;
};

export function shouldValidateSolanaTxSignatures(): boolean {
  return process.env.SOLANA_VALIDATE_TX_SIGNATURES === 'true';
}

export function isLikelySolanaSignature(signature: string): boolean {
  return SOLANA_SIGNATURE_RE.test(signature.trim());
}

export async function validateSolanaSignature(signature: string): Promise<SolanaSignatureValidation> {
  const cleanSignature = signature.trim();

  if (!isLikelySolanaSignature(cleanSignature)) {
    return {
      enabled: true,
      valid: false,
      signature: cleanSignature,
      error: 'Invalid Solana signature format',
    };
  }

  const endpoint = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `p2ploot-${Date.now()}`,
        method: 'getSignatureStatuses',
        params: [[cleanSignature], { searchTransactionHistory: true }],
      }),
    });

    if (!response.ok) {
      return {
        enabled: true,
        valid: false,
        signature: cleanSignature,
        error: `Solana RPC HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as SolanaRpcResponse<{ value: Array<SignatureStatus | null> }>;
    if (payload.error) {
      return {
        enabled: true,
        valid: false,
        signature: cleanSignature,
        error: payload.error.message,
      };
    }

    const status = payload.result?.value?.[0] ?? null;
    const valid = Boolean(status && !status.err && ['processed', 'confirmed', 'finalized'].includes(status.confirmationStatus || ''));

    return {
      enabled: true,
      valid,
      signature: cleanSignature,
      status,
      ...(valid ? {} : { error: 'Signature not found or failed on Solana RPC' }),
    };
  } catch (error) {
    return {
      enabled: true,
      valid: false,
      signature: cleanSignature,
      error: error instanceof Error ? error.message : 'Solana RPC validation failed',
    };
  }
}
