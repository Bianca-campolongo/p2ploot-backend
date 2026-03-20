import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const gameSchema = z.object({
    name: z.string().min(1, "Name is required"),
    genre: z.string().optional(),
    description: z.string().optional(),
    details: z.string().optional(),
    image_url: z.string().optional(),
    server_regions: z.array(z.object({
        region: z.string(),
        servers: z.array(z.string())
    })).optional(),
    status: z.string().optional(),
    blockchain: z.string().optional(),
    mode: z.string().optional(),
    requirements: z.string().optional(),
    nft_info: z.string().optional(),
    website_url: z.string().optional(),
    token_id: z.string().optional(),
    likes: z.number().int().optional(),
    dislikes: z.number().int().optional(),
});

function serializeGame(game: any) {
    return {
        ...game,
        id: game.id.toString(),
    };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = BigInt(params.id);
        const game = await prisma.game.findUnique({
            where: { id: id }
        });

        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        return NextResponse.json(serializeGame(game));
    } catch (error) {
        console.error('[API] Error fetching game:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = BigInt(params.id);
        const body = await req.json();

        // Allow partial updates for votes (likes/dislikes) without full validation
        if (Object.keys(body).length === 2 && (body.likes !== undefined || body.dislikes !== undefined)) {
            const updatedGame = await prisma.game.update({
                where: { id: id },
                data: body
            });
            return NextResponse.json(serializeGame(updatedGame));
        }

        // Full update validation
        const validation = gameSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;
        const updatedGame = await prisma.game.update({
            where: { id: id },
            data: {
                name: data.name,
                genre: data.genre,
                description: data.description,
                details: data.details,
                imageUrl: data.image_url,
                serverRegions: data.server_regions ? data.server_regions : undefined,
                status: data.status,
                blockchain: data.blockchain,
                mode: data.mode,
                requirements: data.requirements,
                tokenId: data.token_id,
                website: data.website_url,
                // Note: Schema has 'website' but frontend sends 'website_url', map it. 
                // Schema.prisma has 'website'. 
            }
        });

        return NextResponse.json(serializeGame(updatedGame));
    } catch (error) {
        console.error('[API] Error updating game:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = BigInt(params.id);
        await prisma.game.delete({
            where: { id: id }
        });

        return NextResponse.json({ message: 'Game deleted successfully' });
    } catch (error) {
        console.error('[API] Error deleting game:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
