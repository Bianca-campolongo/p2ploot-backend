# P2P Loot - Backend

Este é o repositório do backend do P2P Loot. Estruturado usando Next.js 14, atua primordialmente como a API da nossa infraestrutura, com interações baseadas em banco de dados utilizando Prisma.

## Track Cloak (privacidade no marketplace)

Informações esperadas pela track **Cloak** (problema, SDK, execução, IDs/links).

### Problema e para quem se destina

No **marketplace P2P** de itens digitais, compradores e vendedores nem sempre querem expor identidade de perfil público durante negociação e checkout. Isso vale para gamers e para qualquer uso do player market com **escrow**.

A integração Cloak-ready endereça esse problema ao:

- registar **intenção de privacidade** no escalão de escrow (`metadata.cloakPrivacy`);
- alinhar o modelo de **taxas** com a documentação pública Cloak (`fixedFeeSol` / `variableFeeBps`);
- permitir mascaramento coordenado com o frontend (por exemplo comprador ou vendedor como “via Cloak” nas conversas quando o fluxo assim o define).

O escopo atual é **honesto como MVP**: intenção + metadata mínima + mascaramento; **settlement shielded completo via SDK Cloak na chain** pode ser ligado quando existir adapter e validação de produto.

### Como o Cloak é usado e por que é fundamental

Neste backend o núcleo está em **`src/lib/cloak-privacy.ts`**:

| Elemento | Papel |
|----------|--------|
| `CLOAK_PRIVACY_FEE_MODEL` | Valores por defeito espelham o [fee model](https://docs.cloak.ag/protocol/fee-model) referenciado pela documentação Cloak. |
| `CLOAK_DEVNET_CONFIG` | Constantes para **relay**, **RPC Solana devnet** e **`programId` Cloak Devnet**, juntamente com o pacote SDK oficial esperado pelo ecossistema (`sdkPackage`). |
| `buildCloakPrivacyMetadata(...)` | Gera objeto **persistido** no escrow como `metadata.cloakPrivacy` (versão, `enabled`, `sellerRequested`, `buyerRequested`, `provider: 'cloak'`, `feeModel`, etc.). |

A criação de escrows (**`POST /api/web3/escrows`**) usa `buildCloakPrivacyMetadata` para gravar interoperabilidade futura / auditoria entre **P2PLoot escrow** e produto **`p2ploot_anchor_escrow_with_cloak_privacy_intent`**, mantendo apenas campos operacionais mínimos (sem persistir blobs de disclosure ou cópias longas da documentação Cloak dentro do escrow).

**Nota importante:** este repositório **não lista** atualmente `@cloak.dev/sdk-devnet` em `dependencies` do npm. O alinhamento com Cloak faz-se pela **compatibilidade de metadata**, **fee model** e **`programId` / relay** documentados para integradores ou para uma próxima fase com cliente SDK oficial no servidor ou na wallet.

### Instalação e execução (incl. Cloak smoke)

Pré-requisitos: Node.js compatível com Next 14, MySQL configurado (`DATABASE_URL`).

1. Instalar dependências:

   ```bash
   npm install
   ```

2. Configurar variáveis: copiar `.env.example` para `.env` e preencher `DATABASE_URL`, JWT, opcionalmente `SOLANA_ESCROW_PROGRAM_ID` (programa próprio Anchor P2PLoot quando implantado).

3. Sincronizar base de dados (conforme o teu fluxo local):

   ```bash
   npm run db:push
   ```

4. Subir desenvolvimento (API porta **6110**):

   ```bash
   npm run dev
   ```

**Validação específica Cloak (metadata + mascaramento em conversação):**

```bash
npm run smoke:cloak
```

O script `scripts/smoke-cloak-privacy.js` faz seed restrito ao host da BD esperado e verifica escrow com `metadata.cloakPrivacy.enabled` e campos esperados.

### IDs de programa implantados e links

**Cloak (referência oficial Devnet, no código):**

| Item | Valor |
|------|--------|
| Program Cloak Devnet (`programId`) | Ver **`src/lib/cloak-privacy.ts`** (`CLOAK_DEVNET_CONFIG.programId`). Valor atual no código: **`Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`**. Se o ecossistema Cloak atualizar este ID na Devnet, atualize esse arquivo primeiro como fonte de verdade para o projeto. |

| Relay Cloak Devnet | `https://api.devnet.cloak.ag` (em `CLOAK_DEVNET_CONFIG.relayUrl`). |

**P2PLoot Anchor escrow:**

- Define-se pelo ambiente: **`SOLANA_ESCROW_PROGRAM_ID`** em `.env` (mantém placeholder vazio no `.env.example` até existe implantação pública registada pela equipa).

**Links front-end típicos (para demos com este backend):**

- Produção (referência no template): **`https://p2ploot.com`**
- Desenvolvimento local do front configurado contra esta API: em geral **`http://localhost:5173`** ou a porta indicada pelo Vite, com `NEXT_PUBLIC_FRONTEND_URL`/`VITE_API_URL` apontando para `http://localhost:6110`.

Documentação complementar na monorepo: `docs/hackathon-superteam/CLOAK_PRIVACY_METADATA_AUDIT.md`.

## 🚀 Tecnologias Essenciais

- **Next.js 14**: Framework utilizado tanto em arquitetura padrão como em API Routes (`app/api`).
- **Prisma ORM**: Comunicação limpa, tipada e declarativa com banco de dados MySQL (`mysql2`).
- **Autenticação**: Next Auth, JWT e BcryptJS para segurança, hash de senhas e tokens de sessão.
- **Zod**: Validação e parsing rigorosa de inputs.
- **AWS S3 Client**: Upload e armazenamento de arquivos em nuvem.

## 🏗️ Como Rodar Localmente

1. Instalar as dependências:
   ```bash
   npm install
   ```
2. Prepare o banco de dados e sincronize os schemas:
   ```bash
   npm run db:push
   ```
3. Rodar o servidor Node / Next.js de desenvolvimento:
   ```bash
   npm run dev
   ```
   *O aplicativo rodará na porta `6110` (configurado internamente para suportar isolamento do front).*

## 📜 Scripts Úteis

- `npm run dev`: Roda a API de desenvolvimento.
- `npm run db:studio`: Abre uma UI gráfica (Studio) para ver e editar os dados do seu Prisma diretamente.
- `npm run db:seed`: Popular banco inicial com dados de testes.
- `npm run build`: Gera o cliente atualizado no Prisma e build de produção para implantação.
- `npm run smoke:cloak`: Smoke de privacy intent/metadata Cloak contra base local autorizada (`scripts/smoke-cloak-privacy.js`).

## 🛡️ Colaboração e Propriedade Intelectual

**O conceito original, regras de negócio e o ecossistema P2P Loot (já ativo e em produção) são de propriedade intelectual exclusiva de Bianca Campolongo.**

Aos engenheiros e colaboradores que estão ingressando para auxiliar na **integração de Blockchain** ou em futuras melhorias da nossa API: **sejam bem-vindos(as) ao time!**

* A ideia base e regras pré-existentes do produto não podem ser reivindicadas. Porém, as novas implementações de código que vocês produzirem (como os smart contracts e a API Web3) poderão ter os direitos autorais sobre a codificação reconhecidos conforme alinhamento da equipe de desenvolvimento.
* Durante as implementações, lembrem-se de nunca subir arquivos com chaves sensíveis ao repositório (como o seu `.env`) e manter o padrão para garantir estabilidade das nossas integrações.
