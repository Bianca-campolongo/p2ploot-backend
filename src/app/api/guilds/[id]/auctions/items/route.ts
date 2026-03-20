import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

// GET - Fetch game items from shared catalog for autocomplete
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const game = searchParams.get('game') || 'Talon';
        const search = searchParams.get('search') || '';

        const items = await prisma.gameItem.findMany({
            where: {
                game: game,
                ...(search ? {
                    name: {
                        contains: search
                    }
                } : {})
            },
            select: {
                id: true,
                name: true,
                description: true,
                imageUrl: true,
                rarity: true,
                itemType: true,
                isNft: true
            },
            orderBy: { name: 'asc' },
            take: 50
        });

        return NextResponse.json(items);
    } catch (error: any) {
        console.error('Error fetching game items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

const itemSchema = z.object({
    auctionId: z.string().optional().nullable(),
    name: z.string().min(1),
    description: z.string().optional(),
    imageUrl: z.string().optional().nullable(),
    quantity: z.number().int().min(1).default(1),
    rarity: z.string().optional(),
    itemType: z.string().optional(),
    isNft: z.boolean().optional(),
    game: z.string().default('Talon'),
    updateItemDetails: z.boolean().default(false)
});

async function upsertItem(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const data = itemSchema.parse(body);

        // Check permissions (Admin/Mod)
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });

        if (!member) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        // TODO: distinct check for canManage permission if implemented

        let itemId: string;
        let gameItem;

        // 1. Resolve Game Item
        const existingItem = await prisma.gameItem.findFirst({
            where: {
                game: data.game,
                // Case insensitive check would be better, but Prisma needs explicit mode or raw.
                // For now, exact match or relying on exact string from frontend autocomplete.
                name: data.name
            }
        });

        if (existingItem) {
            // Update existing item if requested OR if we are just linking to it (but maybe not updating details?)
            // If data.updateItemDetails is true OR if we are editing an existing auction (implied intent to fix item?)
            // Let's rely on updateItemDetails for explicit updates to catalog.

            if (data.updateItemDetails || data.auctionId) {
                gameItem = await prisma.gameItem.update({
                    where: { id: existingItem.id },
                    data: {
                        description: data.description,
                        imageUrl: data.imageUrl,
                        rarity: data.rarity,
                        itemType: data.itemType,
                        isNft: data.isNft
                    }
                });
            } else {
                gameItem = existingItem;
            }
            itemId = gameItem.id;
        } else {
            // Create new item
            gameItem = await prisma.gameItem.create({
                data: {
                    game: data.game,
                    name: data.name,
                    description: data.description,
                    imageUrl: data.imageUrl,
                    rarity: data.rarity,
                    itemType: data.itemType,
                    isNft: data.isNft || false,
                    createdBy: user.id
                }
            });
            itemId = gameItem.id;
        }

        // 2. Upsert Auction (Warehouse)
        if (data.auctionId) {
            // Update existing auction
            await prisma.guildAuction.update({
                where: { id: data.auctionId },
                data: {
                    itemId: itemId,
                    quantity: data.quantity,
                    // Status preserved (likely warehouse)
                }
            });
        } else {
            // Create new auction in warehouse
            await prisma.guildAuction.create({
                data: {
                    guildId: guildId,
                    itemId: itemId,
                    quantity: data.quantity,
                    status: 'warehouse',
                    startingBid: 0,
                    currentBid: 0,
                    minBidIncrement: 5,
                }
            });
        }

        return NextResponse.json({ success: true, itemId });

    } catch (error: any) {
        console.error('Error upserting item:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: error.message || 'Error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => upsertItem(r, user, context.params))(req);
