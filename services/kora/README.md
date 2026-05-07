# P2P Loot Kora Devnet

Kora RPC separado para patrocinar transacoes Solana em devnet.

## Render

O repo do backend tem um `render.yaml` na raiz para criar o servico:

- name: `p2ploot-kora-devnet`
- branch: `teste`
- runtime: Docker
- Dockerfile: `services/kora/Dockerfile`
- build context: `services/kora`
- Solana RPC: `https://api.devnet.solana.com`

Secrets obrigatorias no Render:

- `KORA_PRIVATE_KEY`: private key dedicada da fee payer wallet de devnet.

Nao commitar `KORA_PRIVATE_KEY`.

## Smoke

Depois do deploy, testar:

```bash
curl -X POST https://<render-url> \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getConfig\",\"params\":[]}"
```

Se responder com `result`, colocar no backend test:

```bash
KORA_NETWORK=devnet
KORA_RPC_URL=https://<render-url>
KORA_FEE_PAYER_ADDRESS=<public key da fee payer>
```

Depois rodar no backend:

```bash
npm run web3:status
```
