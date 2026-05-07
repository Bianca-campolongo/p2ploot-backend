import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { isAnchorEscrowDemoEnabled } from '@/lib/solana-anchor-escrow-demo';
import { isDevnetDemoEnabled } from '@/lib/solana-devnet-demo';
import { normalizeSolanaNetwork } from '@/lib/web3';

export const dynamic = 'force-dynamic';

const PLACEHOLDER_PROGRAM_IDS = new Set([
  'Fg6PaFpoGXkYsidMpWxTWqrr7XJYovrNCm1B1M9nGqV',
  '11111111111111111111111111111111',
]);

function isEnabled(value?: string): boolean {
  return value === 'true';
}

function configured(value?: string): boolean {
  return Boolean(value && value.trim().length > 0);
}

function rpcHost(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return 'custom';
  }
}

function getPlatformFeeBps(): number {
  const parsed = Number(process.env.PLATFORM_FEE_BPS || 250);
  if (!Number.isFinite(parsed)) return 250;
  return Math.max(0, Math.min(10_000, Math.floor(parsed)));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkProgramDeployment(rpcUrl: string | undefined, programId: string, enabled: boolean) {
  if (!enabled || !rpcUrl || !programId) {
    return { checked: false, accountFound: false, executable: false, deployed: false };
  }

  try {
    const publicKey = new PublicKey(programId);
    const connection = new Connection(rpcUrl, 'confirmed');
    const account = await withTimeout(connection.getAccountInfo(publicKey, 'confirmed'), 6_000);

    return {
      checked: true,
      accountFound: Boolean(account),
      executable: Boolean(account?.executable),
      deployed: Boolean(account?.executable),
      owner: account?.owner.toBase58() || null,
      lamports: account?.lamports || 0,
    };
  } catch (error) {
    return {
      checked: true,
      accountFound: false,
      executable: false,
      deployed: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

export async function GET() {
  const network = normalizeSolanaNetwork(process.env.SOLANA_NETWORK);
  const programId = process.env.SOLANA_ESCROW_PROGRAM_ID || '';
  const programIdConfigured = configured(programId) && !PLACEHOLDER_PROGRAM_IDS.has(programId);
  const shouldCheckProgramDeployment = process.env.SOLANA_CHECK_PROGRAM_DEPLOYMENT !== 'false';
  const programDeployment = await checkProgramDeployment(
    process.env.SOLANA_RPC_URL,
    programId,
    programIdConfigured && shouldCheckProgramDeployment
  );
  const devnetDemoEnabled = isDevnetDemoEnabled(network);
  const anchorDemoEnabled = isAnchorEscrowDemoEnabled(network);
  const validateSignatures = isEnabled(process.env.SOLANA_VALIDATE_TX_SIGNATURES);
  const fallbackToLocal = process.env.SOLANA_DEVNET_DEMO_FALLBACK_TO_LOCAL !== 'false';

  const blockers: string[] = [];
  if (!configured(process.env.PRIVY_APP_ID) || !configured(process.env.PRIVY_APP_SECRET)) {
    blockers.push('privy_env_missing');
  }
  if (!configured(process.env.SOLANA_RPC_URL)) {
    blockers.push('solana_rpc_missing');
  }
  if (!programIdConfigured) {
    blockers.push('solana_escrow_program_id_missing_or_placeholder');
  }
  if (programIdConfigured && programDeployment.checked && !programDeployment.deployed) {
    blockers.push(programDeployment.error ? 'solana_escrow_program_deployment_check_failed' : 'solana_escrow_program_not_deployed_or_not_executable');
  }
  if (network === 'mainnet-beta' && devnetDemoEnabled) {
    blockers.push('devnet_demo_enabled_on_mainnet_target');
  }
  if (network === 'mainnet-beta' && !validateSignatures) {
    blockers.push('signature_validation_disabled_on_mainnet_target');
  }
  if (network === 'mainnet-beta' && fallbackToLocal) {
    blockers.push('local_fallback_enabled_on_mainnet_target');
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    readiness: {
      testDeployUsable: blockers.every((blocker) => blocker !== 'privy_env_missing' && blocker !== 'solana_rpc_missing'),
      contractReady: programIdConfigured && (!programDeployment.checked || programDeployment.deployed),
      mainnetReady: network === 'mainnet-beta' && programIdConfigured && (!programDeployment.checked || programDeployment.deployed) && validateSignatures && !devnetDemoEnabled && !fallbackToLocal,
      blockers,
    },
    privy: {
      configured: configured(process.env.PRIVY_APP_ID) && configured(process.env.PRIVY_APP_SECRET),
      appIdConfigured: configured(process.env.PRIVY_APP_ID),
      appSecretConfigured: configured(process.env.PRIVY_APP_SECRET),
    },
    solana: {
      network,
      rpcConfigured: configured(process.env.SOLANA_RPC_URL),
      rpcHost: rpcHost(process.env.SOLANA_RPC_URL),
      escrowProgramIdConfigured: programIdConfigured,
      escrowProgramDeployment: programDeployment,
      validateTxSignatures: validateSignatures,
    },
    devnetDemo: {
      enabled: devnetDemoEnabled,
      anchorEscrowEnabled: anchorDemoEnabled,
      fallbackToLocal,
      autoAirdrop: isEnabled(process.env.SOLANA_DEVNET_DEMO_AUTO_AIRDROP),
      platformFunderEnabled: process.env.SOLANA_DEVNET_DEMO_FUNDER_ENABLED !== 'false',
    },
    platformFee: {
      bps: getPlatformFeeBps(),
      pct: getPlatformFeeBps() / 100,
    },
    kora: {
      configured: configured(process.env.KORA_RPC_URL),
    },
  });
}
