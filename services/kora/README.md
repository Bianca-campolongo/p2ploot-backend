# P2P Loot Kora Devnet

Kora RPC separado para patrocinar transacoes Solana em devnet.

## Render

Servico devnet ativo:

- URL: `https://p2ploot-kora-devnet.onrender.com`
- Render service id: `srv-d7u1a4tckfvc73egkuhg`
- image: `ghcr.io/solana-foundation/kora:v2.0.5`
- plan: `free`
- fee payer: `9r72j5NWX2XCK3fobQdZqh8jszMD9tUo7atkFfTpxwgM`

O deploy atual foi criado via Render API como image-backed service porque a
conta Render ainda nao tinha acesso GitHub ao repo privado. Configs ficam como
Secret Files no Render:

- `/etc/secrets/kora.toml`
- `/etc/secrets/signers.toml`

Comando atual:

```bash
kora --config /etc/secrets/kora.toml \
  --rpc-url https://api.devnet.solana.com \
  rpc start \
  --signers-config /etc/secrets/signers.toml \
  --port 10000 \
  --logging-format json
```

O repo do backend tambem tem um `render.yaml` na raiz para criar o servico via
Blueprint quando o Render tiver acesso GitHub ao repo:

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
KORA_RPC_URL=https://p2ploot-kora-devnet.onrender.com
KORA_FEE_PAYER_ADDRESS=9r72j5NWX2XCK3fobQdZqh8jszMD9tUo7atkFfTpxwgM
```

Depois rodar no backend:

```bash
npm run web3:status
```
