export const CLOAK_PRIVACY_FEE_MODEL = {
  fixedFeeSol: 0.005,
  variableFeeBps: 30,
  variableFeePct: 0.3,
  source: 'https://docs.cloak.ag/protocol/fee-model',
};

export const CLOAK_DEVNET_CONFIG = {
  relayUrl: 'https://api.devnet.cloak.ag',
  solanaRpcUrl: 'https://api.devnet.solana.com',
  programId: 'Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h',
  sdkPackage: '@cloak.dev/sdk-devnet',
};

type CloakPrivacyInput = {
  sellerRequested?: boolean;
  buyerRequested?: boolean;
};

export function buildCloakPrivacyMetadata(input: CloakPrivacyInput = {}) {
  const sellerRequested = Boolean(input.sellerRequested);
  const buyerRequested = Boolean(input.buyerRequested);

  return {
    enabled: sellerRequested || buyerRequested,
    sellerRequested,
    buyerRequested,
    provider: 'cloak',
    mode: 'shielded_utxo_intent',
    settlement: 'p2ploot_anchor_escrow_with_cloak_privacy_intent',
    feeModel: CLOAK_PRIVACY_FEE_MODEL,
    devnet: CLOAK_DEVNET_CONFIG,
    disclosure:
      'Privacy intent is recorded for the marketplace flow. Full shielded settlement is isolated behind the Cloak adapter path.',
  };
}
