import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

const createGuildSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  maxMembers: z.number().int().min(1).max(1000).default(50),
  discordUrl: z.string().url().optional().or(z.literal('')).or(z.null()),
  imageUrl: z.string().url().optional().or(z.literal('')).or(z.null()),
  gameId: z.number().int().optional(),
  characterName: z.string().optional(),
  plan: z.enum(['free', 'premium']).optional().default('premium'),
  customFields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean(),
    options: z.array(z.string()).optional()
  })).optional(),
  customValues: z.record(z.any()).optional(),
});

async function createHandler(req: NextRequest, user: any) {
  try {
    const body = await req.json();
    const data = createGuildSchema.parse(body);
    const isPremium = data.plan === 'premium';

    // Verificar créditos se for premium (10 créditos para criar guilda)
    let profile = null;
    if (isPremium) {
      profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { credits: true },
      });

      if (!profile || profile.credits.toNumber() < 10) {
        return Response.json(
          { error: 'Créditos insuficientes. Necessário 10 créditos para a versão Premium.' },
          { status: 400 }
        );
      }
    }

    // Criar guilda e debitar créditos em transação
    const result = await prisma.$transaction(async (tx) => {
      let newBalance = profile ? profile.credits.toNumber() : 0;

      if (isPremium && profile) {
        // Debitar créditos
        newBalance = profile.credits.toNumber() - 10;
        await tx.profile.update({
          where: { id: user.id },
          data: { credits: newBalance },
        });

        // Registrar transação
        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -10,
            balanceAfter: newBalance,
            transactionType: 'debit',
            referenceType: 'guild_creation',
            description: `Criação de guilda Premium: ${data.name}`,
          },
        });
      }

      // Criar guilda
      const guild = await tx.guild.create({
        data: {
          name: data.name,
          description: data.description,
          maxMembers: data.maxMembers,
          discordUrl: data.discordUrl,
          imageUrl: data.imageUrl,
          gameId: data.gameId,
          ownerAddress: user.walletAddress || user.id,
          ownerId: user.id,
          membersCount: 1,
          creationCostPaid: isPremium,
          accessExpiresAt: isPremium ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        },
      });

      // Adicionar campos customizados
      const fieldNameIdMap: Record<string, string> = {};
      if (data.customFields && data.customFields.length > 0) {
        for (let i = 0; i < data.customFields.length; i++) {
          const f = data.customFields[i];
          const createdField = await tx.guildCustomField.create({
            data: {
              guildId: guild.id,
              fieldName: f.name,
              fieldType: f.type,
              isRequired: f.required,
              fieldOrder: i,
              options: f.options ?? (f.name === 'Classe' ? ["Guerreiro", "Mago", "Arqueiro", "Ladino", "Sacerdote"] : [])
            }
          });
          fieldNameIdMap[f.name] = createdField.id;
        }
      }

      // Mapeamento de campos comuns para colunas especializadas
      const characterClass = data.customValues?.['Classe'] || data.customValues?.['class'] || null;
      const characterLevel = parseInt(data.customValues?.['Level'] || data.customValues?.['level'] || '0') || null;
      const powerScore = parseInt(data.customValues?.['Poder'] || data.customValues?.['power'] || '0') || null;
      const codexScore = parseInt(data.customValues?.['Codex'] || data.customValues?.['codex'] || '0') || null;

      // Mapear nomes para IDs no customValues JSON
      const mappedCustomValues: Record<string, any> = {};
      if (data.customValues) {
        for (const [name, value] of Object.entries(data.customValues)) {
          if (fieldNameIdMap[name]) {
            mappedCustomValues[fieldNameIdMap[name]] = value;
          } else {
            mappedCustomValues[name] = value;
          }
        }
      }

      // Adicionar owner como membro
      await tx.guildMember.create({
        data: {
          guildId: guild.id,
          memberId: user.id,
          role: 'owner',
          characterName: data.characterName,
          characterClass: characterClass?.toString(),
          characterLevel: characterLevel,
          powerScore: powerScore,
          codexScore: codexScore,
          customValues: mappedCustomValues,
        },
      });

      // ADICIONAR EVENTO PADRÃO: Boss da Guilda
      await tx.guildDkpEventsConfig.create({
        data: {
          guildId: guild.id,
          eventName: "Boss da Guilda",
          dkpAmount: 10
        }
      });

      return guild;
    });

    return Response.json(deepSerialize(result), { status: 201 });
  } catch (error: any) {
    console.error('Error creating guild:', error);

    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return Response.json(
        { error: errorMessages || 'Dados inválidos' },
        { status: 400 }
      );
    }

    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function listHandler(req: NextRequest, user: any) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const ownerId = searchParams.get('ownerId');

    const where: any = {};
    if (gameId) {
      where.gameId = BigInt(gameId);
    }
    if (ownerId) {
      where.ownerId = ownerId;
    }

    const [guilds, total] = await Promise.all([
      prisma.guild.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.guild.count({ where }),
    ]);

    return Response.json(deepSerialize({
      guilds: guilds,
      total,
      limit,
      offset,
    }));
  } catch (error) {
    console.error('Error listing guilds:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = requireAuth(createHandler);
export const GET = listHandler;


