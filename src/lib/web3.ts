import type { AuthUser } from './auth';

export const ESCROW_TERMINAL_STATUSES = ['released', 'refunded', 'cancelled'];
export const ESCROW_ACTIVE_STATUSES = [
  'draft',
  'initialized',
  'funded',
  'seller_confirmed',
  'refund_requested',
  'disputed',
];

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export function isAdminUser(user: AuthUser): boolean {
  return user.role === 'admin' || Boolean(user.email && process.env.ADMIN_EMAIL === user.email);
}

export function isSolanaAddressLike(value: string): boolean {
  return SOLANA_BASE58_RE.test(value.trim());
}

export function normalizeSolanaNetwork(value?: string): string {
  if (!value) return 'devnet';
  const network = value.trim().toLowerCase();
  if (network === 'mainnet') return 'mainnet-beta';
  if (['devnet', 'testnet', 'mainnet-beta'].includes(network)) return network;
  return 'devnet';
}

export function canReadEscrow(
  deal: { buyerId: string; sellerId: string; createdById: string },
  user: AuthUser
): boolean {
  return (
    isAdminUser(user) ||
    deal.buyerId === user.id ||
    deal.sellerId === user.id ||
    deal.createdById === user.id
  );
}

export function hasTerminalEscrowStatus(status: string): boolean {
  return ESCROW_TERMINAL_STATUSES.includes(status);
}
