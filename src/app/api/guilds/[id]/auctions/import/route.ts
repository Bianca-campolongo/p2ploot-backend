import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const importSchema = z.object({
    items: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        quantity: z.number().int().min(1).default(1),
        rarity: z.string().optional(),
        itemType: z.string().optional(),
        isNft: z.boolean().optional()
    }))
});

async function importWarehouseItems(req: NextRequest, user: any) {
    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const guildId = pathParts[pathParts.indexOf('guilds') + 1];

        if (!guildId) {
            return NextResponse.json({ error: 'Guild ID required' }, { status: 400 });
        }

        const body = await req.json();
        const validation = importSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const { items } = validation.data;

        // Check user is member of guild with manage permissions
        const member = await prisma.guildMember.findFirst({
            where: {
                guildId: BigInt(guildId),
                memberId: user.id
            }
        });

        if (!member || !['owner', 'officer', 'admin'].includes(member.role)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        // Process items in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const createdAuctions = [];

            for (const item of items) {
                // 1. Upsert game item (rarity, isNft, itemType are on GameItem)
                let gameItem = await tx.gameItem.findFirst({
                    where: {
                        game: 'Talon',
                        name: item.name
                    }
                });

                if (!gameItem) {
                    gameItem = await tx.gameItem.create({
                        data: {
                            game: 'Talon',
                            name: item.name,
                            description: item.description || 'Item importado via CSV',
                            imageUrl: item.imageUrl || null,
                            createdBy: user.id,
                            rarity: item.rarity || 'Comum',
                            itemType: item.itemType || null,
                            isNft: item.isNft || false
                        }
                    });
                }

                // 2. Create auction entry in warehouse (no rarity/isNft on auction)
                const auction = await tx.guildAuction.create({
                    data: {
                        guildId: BigInt(guildId),
                        itemId: gameItem.id,
                        quantity: item.quantity,
                        status: 'warehouse'
                    }
                });

                createdAuctions.push({
                    id: auction.id,
                    itemName: gameItem.name,
                    quantity: auction.quantity
                });
            }

            return createdAuctions;
        });

        return NextResponse.json({
            success: true,
            imported: result.length,
            items: result
        });

    } catch (error: any) {
        console.error('[API] Error importing warehouse items:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(importWarehouseItems)(req);
