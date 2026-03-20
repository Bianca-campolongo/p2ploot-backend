import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { deepSerialize } from '@/lib/serialize';

// Schema parsing
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
    token_id: z.string().optional(),
});

export async function GET() {
    try {
        const games = await prisma.game.findMany({
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(deepSerialize(games));
    } catch (error) {
        console.error('[API] Error fetching games:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[API] Creating game:', body);

        const validation = gameSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const game = await prisma.game.create({
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
            },
        });

        return NextResponse.json(deepSerialize(game), { status: 201 });
    } catch (error: any) {
        console.error('[API] Error creating game details:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });

        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Game with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
    }
}


