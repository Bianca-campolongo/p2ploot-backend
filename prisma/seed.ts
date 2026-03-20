import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // Limpar dados existentes (opcional - descomente se quiser limpar)
  // console.log('🧹 Limpando dados existentes...');
  // await prisma.userItemFavorite.deleteMany();
  // await prisma.gameVote.deleteMany();
  // await prisma.message.deleteMany();
  // await prisma.conversation.deleteMany();
  // await prisma.adReport.deleteMany();
  // await prisma.marketAd.deleteMany();
  // await prisma.creditRequest.deleteMany();
  // await prisma.creditTransaction.deleteMany();
  // await prisma.guildCharacterShare.deleteMany();
  // await prisma.guildGiveaway.deleteMany();
  // await prisma.guildDkpLedger.deleteMany();
  // await prisma.guildDkpEventsConfig.deleteMany();
  // await prisma.guildBid.deleteMany();
  // await prisma.guildAuction.deleteMany();
  // await prisma.gameItem.deleteMany();
  // await prisma.guildCustomField.deleteMany();
  // await prisma.guildRequest.deleteMany();
  // await prisma.guildMember.deleteMany();
  // await prisma.guild.deleteMany();
  // await prisma.game.deleteMany();
  // await prisma.walletLogin.deleteMany();
  // await prisma.profile.deleteMany();

  // ============================================
  // 1. CRIAR PERFIS DE USUÁRIOS
  // ============================================
  console.log('👤 Criando perfis de usuários...');

  const adminProfile = await prisma.profile.upsert({
    where: { email: 'admin@talon.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@talon.com',
      username: 'Admin',
      role: 'admin',
      credits: 1000.00,
      bio: 'Administrador do sistema Talon',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      primaryAuthMethod: 'discord',
      discordId: '123456789012345678',
      discordUsername: 'admin',
      discordGlobalName: 'Admin Talon',
    },
  });

  const user1 = await prisma.profile.upsert({
    where: { email: 'player1@talon.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'player1@talon.com',
      username: 'PlayerOne',
      role: 'user',
      credits: 50.00,
      bio: 'Jogador experiente em Web3 games',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=player1',
      primaryAuthMethod: 'wallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      walletLinkedAt: new Date(),
    },
  });

  const user2 = await prisma.profile.upsert({
    where: { email: 'player2@talon.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'player2@talon.com',
      username: 'GamerPro',
      role: 'user',
      credits: 25.00,
      bio: 'Focado em NFTs e guilds',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=player2',
      primaryAuthMethod: 'both',
      walletAddress: '0x9876543210987654321098765432109876543210',
      walletLinkedAt: new Date(),
      discordId: '987654321098765432',
      discordUsername: 'gamerpro',
    },
  });

  console.log(`✅ Criados ${3} perfis\n`);

  // ============================================
  // 2. CRIAR GAMES
  // ============================================
  console.log('🎮 Criando jogos...');

  const game1 = await prisma.game.upsert({
    where: { name: 'Star Atlas' },
    update: {},
    create: {
      name: 'Star Atlas',
      description: 'MMO de exploração espacial no blockchain Solana',
      blockchain: 'Solana',
      website: 'https://staratlas.com',
      imageUrl: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=800',
      likes: 150,
      dislikes: 5,
    },
  });

  const game2 = await prisma.game.upsert({
    where: { name: 'Illuvium' },
    update: {},
    create: {
      name: 'Illuvium',
      description: 'RPG de coleção de criaturas no Ethereum',
      blockchain: 'Ethereum',
      website: 'https://illuvium.io',
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800',
      likes: 200,
      dislikes: 10,
    },
  });

  const game3 = await prisma.game.upsert({
    where: { name: 'The Sandbox' },
    update: {},
    create: {
      name: 'The Sandbox',
      description: 'Mundo virtual onde você pode criar, possuir e monetizar',
      blockchain: 'Ethereum',
      website: 'https://www.sandbox.game',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
      likes: 180,
      dislikes: 8,
    },
  });

  const game4 = await prisma.game.upsert({
    where: { name: 'Axie Infinity' },
    update: {},
    create: {
      name: 'Axie Infinity',
      description: 'Jogo de batalha de monstros colecionáveis',
      blockchain: 'Ethereum',
      website: 'https://axieinfinity.com',
      imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800',
      likes: 300,
      dislikes: 20,
    },
  });

  console.log(`✅ Criados ${4} jogos\n`);

  // ============================================
  // 3. CRIAR GUILDS
  // ============================================
  console.log('🏰 Criando guilds...');

  const guild1 = await prisma.guild.create({
    data: {
      name: 'Elite Warriors',
      description: 'Guild focada em PvP e conquistas',
      maxMembers: 50,
      membersCount: 2,
      ownerAddress: user1.walletAddress!,
      ownerId: user1.id,
      gameId: game1.id,
      discordUrl: 'https://discord.gg/elitewarriors',
      imageUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800',
      creationCostPaid: true,
    },
  });

  const guild2 = await prisma.guild.create({
    data: {
      name: 'Crypto Explorers',
      description: 'Guild para exploradores e colecionadores',
      maxMembers: 30,
      membersCount: 1,
      ownerAddress: user2.walletAddress!,
      ownerId: user2.id,
      gameId: game2.id,
      discordUrl: 'https://discord.gg/cryptoexplorers',
      imageUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800',
      creationCostPaid: true,
    },
  });

  console.log(`✅ Criadas ${2} guilds\n`);

  // ============================================
  // 4. ADICIONAR MEMBROS ÀS GUILDS
  // ============================================
  console.log('👥 Adicionando membros às guilds...');

  await prisma.guildMember.create({
    data: {
      guildId: guild1.id,
      memberId: user1.id,
      role: 'owner',
      dkpBalance: 500,
      characterName: 'WarriorOne',
      characterClass: 'Paladin',
      characterLevel: 50,
      powerScore: 8500,
      codexScore: 3200,
    },
  });

  await prisma.guildMember.create({
    data: {
      guildId: guild1.id,
      memberId: user2.id,
      role: 'member',
      dkpBalance: 250,
      characterName: 'ExplorerTwo',
      characterClass: 'Ranger',
      characterLevel: 35,
      powerScore: 6200,
      codexScore: 2100,
    },
  });

  await prisma.guildMember.create({
    data: {
      guildId: guild2.id,
      memberId: user2.id,
      role: 'owner',
      dkpBalance: 100,
      characterName: 'CryptoExplorer',
      characterClass: 'Mage',
      characterLevel: 40,
      powerScore: 7000,
      codexScore: 2800,
    },
  });

  console.log(`✅ Adicionados ${3} membros às guilds\n`);

  // ============================================
  // 5. CRIAR GAME ITEMS
  // ============================================
  console.log('🎒 Criando itens de jogo...');

  const item1 = await prisma.gameItem.create({
    data: {
      game: 'Star Atlas',
      name: 'Espada Lendária',
      description: 'Uma espada poderosa forjada nas estrelas',
      imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400',
      createdBy: user1.id,
    },
  });

  const item2 = await prisma.gameItem.create({
    data: {
      game: 'Illuvium',
      name: 'Cristal de Poder',
      description: 'Cristal raro que aumenta o poder do personagem',
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400',
      createdBy: user2.id,
    },
  });

  const item3 = await prisma.gameItem.create({
    data: {
      game: 'The Sandbox',
      name: 'Terreno Premium',
      description: 'Terreno raro no metaverso',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
      createdBy: adminProfile.id,
    },
  });

  console.log(`✅ Criados ${3} itens de jogo\n`);

  // ============================================
  // 6. CRIAR LEILÕES
  // ============================================
  console.log('🔨 Criando leilões...');

  const auction1 = await prisma.guildAuction.create({
    data: {
      guildId: guild1.id,
      itemId: item1.id,
      quantity: 1,
      status: 'active',
      startingBid: 100.00,
      currentBid: 150.00,
      minBidIncrement: 10.00,
      startTime: new Date(),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      antiSnipeDuration: 5,
    },
  });

  const auction2 = await prisma.guildAuction.create({
    data: {
      guildId: guild1.id,
      itemId: item2.id,
      quantity: 1,
      status: 'warehouse',
      startingBid: 50.00,
      currentBid: 0,
      minBidIncrement: 5.00,
    },
  });

  console.log(`✅ Criados ${2} leilões\n`);

  // ============================================
  // 7. CRIAR LANCES
  // ============================================
  console.log('💰 Criando lances...');

  await prisma.guildBid.create({
    data: {
      auctionId: auction1.id,
      bidderId: user2.id,
      amount: 150.00,
    },
  });

  console.log(`✅ Criado ${1} lance\n`);

  // ============================================
  // 8. CRIAR CONFIGURAÇÕES DE EVENTOS DKP
  // ============================================
  console.log('⚙️ Criando configurações DKP...');

  await prisma.guildDkpEventsConfig.create({
    data: {
      guildId: guild1.id,
      eventName: 'Boss Raid',
      dkpAmount: 50,
    },
  });

  await prisma.guildDkpEventsConfig.create({
    data: {
      guildId: guild1.id,
      eventName: 'PvP Win',
      dkpAmount: 25,
    },
  });

  await prisma.guildDkpEventsConfig.create({
    data: {
      guildId: guild1.id,
      eventName: 'Daily Quest',
      dkpAmount: 10,
    },
  });

  console.log(`✅ Criadas ${3} configurações DKP\n`);

  // ============================================
  // 9. CRIAR TRANSAÇÕES DE CRÉDITO
  // ============================================
  console.log('💳 Criando transações de crédito...');

  await prisma.creditTransaction.create({
    data: {
      userId: user1.id,
      amount: 50.00,
      balanceAfter: 50.00,
      transactionType: 'credit',
      description: 'Crédito inicial',
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId: user2.id,
      amount: 25.00,
      balanceAfter: 25.00,
      transactionType: 'credit',
      description: 'Crédito inicial',
    },
  });

  console.log(`✅ Criadas ${2} transações de crédito\n`);

  // ============================================
  // 10. CRIAR ANÚNCIOS DO MERCADO
  // ============================================
  console.log('📢 Criando anúncios do mercado...');

  await prisma.marketAd.create({
    data: {
      userId: user1.id,
      title: 'Vendo conta Star Atlas nível 50',
      description: 'Conta com personagem nível 50, muitos itens raros',
      price: 500.00,
      currency: 'USD',
      game: 'Star Atlas',
      server: 'Alpha',
      region: 'Global',
      status: 'active',
      sellerAddress: user1.walletAddress!,
    },
  });

  await prisma.marketAd.create({
    data: {
      userId: user2.id,
      title: 'NFT Illuvium raro à venda',
      description: 'NFT de criatura lendária do Illuvium',
      price: 1000.00,
      currency: 'ETH',
      game: 'Illuvium',
      server: 'Mainnet',
      region: 'Global',
      status: 'active',
      sellerAddress: user2.walletAddress!,
    },
  });

  console.log(`✅ Criados ${2} anúncios do mercado\n`);

  // ============================================
  // RESUMO
  // ============================================
  console.log('✅ Seed concluído com sucesso!\n');
  console.log('📊 Resumo dos dados criados:');
  console.log(`   👤 Perfis: ${3}`);
  console.log(`   🎮 Jogos: ${4}`);
  console.log(`   🏰 Guilds: ${2}`);
  console.log(`   👥 Membros de Guild: ${3}`);
  console.log(`   🎒 Itens: ${3}`);
  console.log(`   🔨 Leilões: ${2}`);
  console.log(`   💰 Lances: ${1}`);
  console.log(`   ⚙️ Configurações DKP: ${3}`);
  console.log(`   💳 Transações: ${2}`);
  console.log(`   📢 Anúncios: ${2}\n`);

  console.log('🔑 Credenciais de teste:');
  console.log(`   Admin: admin@talon.com`);
  console.log(`   User 1: player1@talon.com`);
  console.log(`   User 2: player2@talon.com\n`);
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
