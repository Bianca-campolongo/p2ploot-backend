import crypto from 'node:crypto';
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import idl from '@/lib/idl/p2ploot_escrow.json';
import {
  ensureDevnetDemoFunds,
  getDevnetDemoConnection,
  getDevnetDemoTransferLamports,
  getFeeReserveLamports,
  getOrCreateUserDevnetDemoKeypair,
  getPlatformFeeBps,
  getPlatformFeeKeypair,
  isDevnetDemoEnabled,
} from '@/lib/solana-devnet-demo';

export type AnchorEscrowDemoAction = 'record_deposit' | 'seller_confirm' | 'release' | 'record_refund';

type AnchorDemoDeal = {
  id: string;
  buyerId: string;
  sellerId: string;
  network: string;
  assetMint?: string | null;
  amountRaw?: string | null;
  amountUi?: unknown;
  escrowPda?: string | null;
  vaultAddress?: string | null;
  expiresAt?: Date | string | null;
};

export type AnchorEscrowDemoTxResult = {
  mode: 'solana_devnet_anchor_escrow';
  action: AnchorEscrowDemoAction;
  signature: string;
  initializeSignature?: string;
  depositSignature?: string;
  programId: string;
  fromAddress: string;
  toAddress: string;
  buyerAddress: string;
  sellerAddress: string;
  payerAddress: string;
  payerMode: 'platform_devnet_payer';
  platformFeeAddress: string;
  vaultAddress: string;
  escrowPda: string;
  assetMint: string;
  buyerTokenAddress: string;
  sellerTokenAddress?: string;
  platformFeeTokenAddress?: string;
  lamports: number;
  amountRaw: string;
  sellerLamports: number;
  platformFeeLamports: number;
  platformFeeBps: number;
  feeReserveLamports: number;
  explorerUrl: string;
  vaultTokenBalance?: string;
};

class KeypairWallet implements anchor.Wallet {
  readonly payer: Keypair;

  constructor(payer: Keypair) {
    this.payer = payer;
  }

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (transaction instanceof Transaction) {
      transaction.partialSign(this.payer);
    } else {
      transaction.sign([this.payer]);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    return Promise.all(transactions.map((transaction) => this.signTransaction(transaction)));
  }
}

function getProgramId(): PublicKey {
  const configured = process.env.SOLANA_ESCROW_PROGRAM_ID;
  if (!configured) {
    throw new Error('SOLANA_ESCROW_PROGRAM_ID is not configured');
  }
  return new PublicKey(configured);
}

function getProviderAndProgram(payer: Keypair) {
  const connection = getDevnetDemoConnection();
  const provider = new anchor.AnchorProvider(connection, new KeypairWallet(payer), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const programId = getProgramId();
  const runtimeIdl = { ...(idl as anchor.Idl), address: programId.toBase58() };
  const program = new Program(runtimeIdl, provider) as Program<any>;

  return { connection, program, programId };
}

function getDealIdBytes(dealId: string): Buffer {
  const hex = dealId.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32,}$/.test(hex)) {
    return Buffer.from(hex.slice(0, 32), 'hex');
  }
  return crypto.createHash('sha256').update(dealId).digest().subarray(0, 16);
}

function getEscrowPdas(programId: PublicKey, buyer: PublicKey, seller: PublicKey, dealIdBytes: Buffer) {
  const [dealPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('deal'), buyer.toBuffer(), seller.toBuffer(), dealIdBytes],
    programId
  );
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), dealPda.toBuffer()], programId);

  return { dealPda, vault };
}

function getTokenAmount(deal: AnchorDemoDeal): bigint {
  if (deal.amountRaw && /^[0-9]+$/.test(deal.amountRaw) && BigInt(deal.amountRaw) > 0n) {
    return BigInt(deal.amountRaw);
  }
  return BigInt(getDevnetDemoTransferLamports());
}

function getTokenDecimals(): number {
  const configured = Number(process.env.SOLANA_ANCHOR_DEMO_TOKEN_DECIMALS || 6);
  return Number.isFinite(configured) && configured >= 0 && configured <= 9 ? Math.floor(configured) : 6;
}

function getBuyerMinLamports(): number {
  const configured = Number(process.env.SOLANA_ANCHOR_DEMO_BUYER_MIN_LAMPORTS || 80_000_000);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 80_000_000;
}

function getExpiresAtSeconds(value: Date | string | null | undefined): BN {
  if (!value) return new BN(0);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new BN(0);
  return new BN(Math.floor(date.getTime() / 1000));
}

function feeFor(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}

function toSafeNumber(value: bigint): number {
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

function explorerUrl(signature: string, network: string): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network || 'devnet'}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

async function getOrCreateTokenAccounts(
  payer: Keypair,
  mint: PublicKey,
  buyer: PublicKey,
  seller: PublicKey,
  platformFeeRecipient: PublicKey
) {
  const connection = getDevnetDemoConnection();
  const buyerToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, buyer);
  const sellerToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, seller);
  const platformFeeToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, platformFeeRecipient);

  return { buyerToken, sellerToken, platformFeeToken };
}

export function isAnchorEscrowDemoEnabled(network?: string | null): boolean {
  return (
    isDevnetDemoEnabled(network ?? undefined) &&
    process.env.SOLANA_ANCHOR_ESCROW_DEMO_ENABLED !== 'false' &&
    Boolean(process.env.SOLANA_ESCROW_PROGRAM_ID)
  );
}

export function isAnchorEscrowDemoAction(action: string): action is AnchorEscrowDemoAction {
  return ['record_deposit', 'seller_confirm', 'release', 'record_refund'].includes(action);
}

export async function executeAnchorEscrowDemoAction(
  deal: AnchorDemoDeal,
  action: AnchorEscrowDemoAction
): Promise<AnchorEscrowDemoTxResult> {
  if (!isAnchorEscrowDemoEnabled(deal.network)) {
    throw new Error('Anchor escrow devnet demo is disabled for this escrow');
  }

  const buyer = getOrCreateUserDevnetDemoKeypair(deal.buyerId);
  const seller = getOrCreateUserDevnetDemoKeypair(deal.sellerId);
  const platformFeeWallet = getPlatformFeeKeypair();
  await ensureDevnetDemoFunds(platformFeeWallet.publicKey, getBuyerMinLamports());

  const { connection, program, programId } = getProviderAndProgram(platformFeeWallet);
  const methods = program.methods as any;
  const dealIdBytes = getDealIdBytes(deal.id);
  const { dealPda, vault } = getEscrowPdas(programId, buyer.publicKey, seller.publicKey, dealIdBytes);
  const amount = getTokenAmount(deal);
  const platformFeeBps = getPlatformFeeBps();
  const platformFeeAmount = action === 'release' ? feeFor(amount, platformFeeBps) : 0n;
  const sellerAmount = action === 'release' ? amount - platformFeeAmount : 0n;

  if (action === 'record_deposit') {
    const mint = await createMint(connection, platformFeeWallet, buyer.publicKey, null, getTokenDecimals());
    const { buyerToken, sellerToken, platformFeeToken } = await getOrCreateTokenAccounts(
      platformFeeWallet,
      mint,
      buyer.publicKey,
      seller.publicKey,
      platformFeeWallet.publicKey
    );

    await mintTo(connection, platformFeeWallet, mint, buyerToken.address, buyer, amount);

    const initializeSignature = await methods
      .initializeDeal(Array.from(dealIdBytes), new BN(amount.toString()), platformFeeBps, getExpiresAtSeconds(deal.expiresAt))
      .accounts({
        payer: platformFeeWallet.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        platformFeeRecipient: platformFeeWallet.publicKey,
        mint,
        deal: dealPda,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    const depositSignature = await methods
      .deposit()
      .accounts({
        buyer: buyer.publicKey,
        deal: dealPda,
        mint,
        buyerToken: buyerToken.address,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const vaultAccount = await getAccount(connection, vault);

    return {
      mode: 'solana_devnet_anchor_escrow',
      action,
      signature: depositSignature,
      initializeSignature,
      depositSignature,
      programId: programId.toBase58(),
      fromAddress: buyer.publicKey.toBase58(),
      toAddress: vault.toBase58(),
      buyerAddress: buyer.publicKey.toBase58(),
      sellerAddress: seller.publicKey.toBase58(),
      payerAddress: platformFeeWallet.publicKey.toBase58(),
      payerMode: 'platform_devnet_payer',
      platformFeeAddress: platformFeeWallet.publicKey.toBase58(),
      vaultAddress: vault.toBase58(),
      escrowPda: dealPda.toBase58(),
      assetMint: mint.toBase58(),
      buyerTokenAddress: buyerToken.address.toBase58(),
      sellerTokenAddress: sellerToken.address.toBase58(),
      platformFeeTokenAddress: platformFeeToken.address.toBase58(),
      lamports: toSafeNumber(amount),
      amountRaw: amount.toString(),
      sellerLamports: 0,
      platformFeeLamports: 0,
      platformFeeBps,
      feeReserveLamports: getFeeReserveLamports(),
      explorerUrl: explorerUrl(depositSignature, deal.network),
      vaultTokenBalance: vaultAccount.amount.toString(),
    };
  }

  if (!deal.assetMint) {
    throw new Error('Escrow asset mint is missing; record_deposit must run before this action');
  }

  const mint = new PublicKey(deal.assetMint);
  const { buyerToken, sellerToken, platformFeeToken } = await getOrCreateTokenAccounts(
    platformFeeWallet,
    mint,
    buyer.publicKey,
    seller.publicKey,
    platformFeeWallet.publicKey
  );

  if (action === 'seller_confirm') {
    const signature = await methods
      .sellerConfirm()
      .accounts({
        seller: seller.publicKey,
        deal: dealPda,
      })
      .signers([seller])
      .rpc();

    return {
      mode: 'solana_devnet_anchor_escrow',
      action,
      signature,
      programId: programId.toBase58(),
      fromAddress: seller.publicKey.toBase58(),
      toAddress: dealPda.toBase58(),
      buyerAddress: buyer.publicKey.toBase58(),
      sellerAddress: seller.publicKey.toBase58(),
      payerAddress: platformFeeWallet.publicKey.toBase58(),
      payerMode: 'platform_devnet_payer',
      platformFeeAddress: platformFeeWallet.publicKey.toBase58(),
      vaultAddress: vault.toBase58(),
      escrowPda: dealPda.toBase58(),
      assetMint: mint.toBase58(),
      buyerTokenAddress: buyerToken.address.toBase58(),
      sellerTokenAddress: sellerToken.address.toBase58(),
      platformFeeTokenAddress: platformFeeToken.address.toBase58(),
      lamports: toSafeNumber(amount),
      amountRaw: amount.toString(),
      sellerLamports: 0,
      platformFeeLamports: 0,
      platformFeeBps,
      feeReserveLamports: getFeeReserveLamports(),
      explorerUrl: explorerUrl(signature, deal.network),
    };
  }

  const signature =
    action === 'release'
      ? await methods
          .release()
          .accounts({
            buyer: buyer.publicKey,
            deal: dealPda,
            mint,
            vault,
            sellerToken: sellerToken.address,
            platformFeeToken: platformFeeToken.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc()
      : await methods
          .refund()
          .accounts({
            buyer: buyer.publicKey,
            deal: dealPda,
            mint,
            vault,
            buyerToken: buyerToken.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();

  const vaultAccount = await getAccount(connection, vault);

  return {
    mode: 'solana_devnet_anchor_escrow',
    action,
    signature,
    programId: programId.toBase58(),
    fromAddress: vault.toBase58(),
    toAddress: action === 'release' ? seller.publicKey.toBase58() : buyer.publicKey.toBase58(),
    buyerAddress: buyer.publicKey.toBase58(),
    sellerAddress: seller.publicKey.toBase58(),
    payerAddress: platformFeeWallet.publicKey.toBase58(),
    payerMode: 'platform_devnet_payer',
    platformFeeAddress: platformFeeWallet.publicKey.toBase58(),
    vaultAddress: vault.toBase58(),
    escrowPda: dealPda.toBase58(),
    assetMint: mint.toBase58(),
    buyerTokenAddress: buyerToken.address.toBase58(),
    sellerTokenAddress: sellerToken.address.toBase58(),
    platformFeeTokenAddress: platformFeeToken.address.toBase58(),
    lamports: toSafeNumber(amount),
    amountRaw: amount.toString(),
    sellerLamports: toSafeNumber(sellerAmount),
    platformFeeLamports: toSafeNumber(platformFeeAmount),
    platformFeeBps,
    feeReserveLamports: getFeeReserveLamports(),
    explorerUrl: explorerUrl(signature, deal.network),
    vaultTokenBalance: vaultAccount.amount.toString(),
  };
}
