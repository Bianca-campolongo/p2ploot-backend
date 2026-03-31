# P2P Loot - Backend

Este é o repositório do backend do P2P Loot. Estruturado usando Next.js 14, atua primordialmente como a API da nossa infraestrutura, com interações baseadas em banco de dados utilizando Prisma.

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

## 🛡️ Colaboração e Propriedade Intelectual

**O conceito original, regras de negócio e o ecossistema P2P Loot (já ativo e em produção) são de propriedade intelectual exclusiva de Bianca Campolongo.**

Aos engenheiros e colaboradores que estão ingressando para auxiliar na **integração de Blockchain** ou em futuras melhorias da nossa API: **sejam bem-vindos(as) ao time!**

* A ideia base e regras pré-existentes do produto não podem ser reivindicadas. Porém, as novas implementações de código que vocês produzirem (como os smart contracts e a API Web3) poderão ter os direitos autorais sobre a codificação reconhecidos conforme alinhamento da equipe de desenvolvimento.
* Durante as implementações, lembrem-se de nunca subir arquivos com chaves sensíveis ao repositório (como o seu `.env`) e manter o padrão para garantir estabilidade das nossas integrações.
