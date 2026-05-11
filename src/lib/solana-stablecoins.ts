import { normalizeSolanaNetwork } from './web3';

const NETWORK_ENV_PREFIX: Record<string, string> = {
  devnet: 'DEVNET',
  testnet: 'TESTNET',
  'mainnet-beta': 'MAINNET',
};

const DEFAULT_MINTS: Record<string, Record<string, string>> = {
  'mainnet-beta': {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4jU7VvSksQ88BNTc1NfQ',
  },
  devnet: {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },
};

export function normalizeCurrencySymbol(value?: string | null): string {
  return String(value || 'USDC').trim().toUpperCase() || 'USDC';
}

export function getStablecoinMint(currencySymbol?: string | null, networkValue?: string | null): string | undefined {
  const currency = normalizeCurrencySymbol(currencySymbol);
  const network = normalizeSolanaNetwork(networkValue || undefined);
  const envPrefix = NETWORK_ENV_PREFIX[network];
  const networkEnvMint = envPrefix ? process.env[`SOLANA_${envPrefix}_${currency}_MINT`] : undefined;
  const genericEnvMint = process.env[`SOLANA_${currency}_MINT`];

  return networkEnvMint || genericEnvMint || DEFAULT_MINTS[network]?.[currency];
}
