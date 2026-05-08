import { NextResponse } from 'next/server';
import { CLOAK_DEVNET_CONFIG, CLOAK_PRIVACY_FEE_MODEL } from '@/lib/cloak-privacy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: 'cloak',
    mode: 'privacy_intent_ready',
    docsMcp: 'https://docs.cloak.ag/mcp',
    docs: {
      devnet: 'https://docs.cloak.ag/development/devnet',
      feeModel: CLOAK_PRIVACY_FEE_MODEL.source,
      viewingKeys: 'https://docs.cloak.ag/architecture/viewing-keys-compliance',
      utxoTransactions: 'https://docs.cloak.ag/sdk/utxo-transactions',
    },
    devnet: CLOAK_DEVNET_CONFIG,
    feeModel: CLOAK_PRIVACY_FEE_MODEL,
    capabilities: {
      sellerPrivacyIntent: true,
      buyerPrivacyIntent: true,
      viewingKeyComplianceConcept: true,
      shieldedSettlementAdapter: false,
    },
    disclaimer:
      'Marketplace can record and demo Cloak privacy intent now. Full shielded settlement remains behind the isolated Cloak adapter path.',
  });
}
