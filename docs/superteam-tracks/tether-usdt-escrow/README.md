# Track: Tether (USDT no escrow)

**Prioridade:** P0
**Branch especial:** `track/tether-usdt-escrow`
**Escopo:** Aceitar `currencySymbol: USDT`, resolver **mint** SPL por rede e manter escrow smoke/seed em USDT.

---

## Como identificar esta ferramenta na plataforma (fluxo)

1. Backend com variáveis de mint USDT configuradas (ex.: devnet `SOLANA_DEVNET_USDT_MINT` em `.env.example`).
2. Criar escrow via API com **`currencySymbol: USDT`** — o servidor deve resolver `assetMint` quando o cliente não envia mint explícito.
3. Rodar **`npm run smoke:web3:tether`** contra API local com migrações aplicadas — valida release/refund/cancel com USDT.
4. Seed opcional: **`SMOKE_CURRENCY_SYMBOL=USDT`** ao rodar seed Web3 para anúncios de demo coerentes.
5. **Confirmação:** resposta JSON do escrow e eventos carregam **USDT** e mint esperado da rede.

Documentação de status: `docs/hackathon-superteam/TRACK_STATUS.md` (gate Tether).

---

## Principais arquivos (backend)

- `src/app/api/web3/escrows/route.ts` — criação de escrow com moeda/mint.
- `src/lib/solana-stablecoins.ts` (ou equivalente) — resolução de mint por símbolo/rede.
- `.env.example` — mints USDC/USDT por ambiente.
- `scripts/smoke-web3-tether.js`, `scripts/seed-web3-smoke-data.js`

---

## Variáveis de ambiente

- `SOLANA_DEVNET_USDT_MINT`, URLs RPC, `SOLANA_NETWORK` — ver `.env.example`.
