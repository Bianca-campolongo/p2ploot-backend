import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const voteSchema = z.object({
    type: z.enum(['TRUST', 'DISTRUST'])
});

// POST /api/profiles/[id]/trust - Vote on a user
// Toggles: Voting same type removes vote. Voting different type switches vote.
async function voteUser(req: NextRequest, user: any, params: { id: string }) {
    try {
        const targetId = params.id;
        const body = await req.json();
        const data = voteSchema.parse(body);

        if (targetId === user.id) {
            return NextResponse.json({ error: 'Cannot vote on yourself' }, { status: 400 });
        }

        // Check for existing vote safely
        let existingVotes: any[] = [];
        if ((prisma as any).trustVote) {
            existingVotes = await (prisma as any).trustVote.findMany({
                where: {
                    voterId: user.id,
                    targetId
                }
            });
        } else {
            // Fallback to raw query if table exists
            // Note: requires trust_votes table (prisma db push might have succeeded even if generate failed)
            const v = await prisma.$queryRaw`SELECT * FROM trust_votes WHERE voter_id = ${user.id} AND target_id = ${targetId}`;
            existingVotes = v as any[];
        }

        const existingVote = existingVotes[0];
        // Handle BigInt id if raw query
        const existingId = existingVote?.id;

        if (existingVote) {
            if (existingVote.type === data.type) {
                // Remove vote (toggle)
                if ((prisma as any).trustVote) {
                    await (prisma as any).trustVote.delete({ where: { id: existingId } });
                } else {
                    await prisma.$executeRaw`DELETE FROM trust_votes WHERE id = ${existingId}`;
                }
                return NextResponse.json({ success: true, action: 'removed' });
            } else {
                // Switch vote
                if ((prisma as any).trustVote) {
                    await (prisma as any).trustVote.update({ where: { id: existingId }, data: { type: data.type } });
                } else {
                    await prisma.$executeRaw`UPDATE trust_votes SET type = ${data.type} WHERE id = ${existingId}`;
                }
                return NextResponse.json({ success: true, action: 'updated' });
            }
        } else {
            // Create vote
            if ((prisma as any).trustVote) {
                await (prisma as any).trustVote.create({
                    data: {
                        voterId: user.id,
                        targetId,
                        type: data.type
                    }
                });
            } else {
                await prisma.$executeRaw`INSERT INTO trust_votes (voter_id, target_id, type, created_at) VALUES (${user.id}, ${targetId}, ${data.type}, NOW())`;
            }
            return NextResponse.json({ success: true, action: 'created' });
        }
    } catch (error: any) {
        console.error('Error voting:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/profiles/[id]/trust - Get trust stats for a user (can be public, but usually profiles/public endpoint includes this)
// Let's implement it for specific fetch if needed.
async function getTrustStats(req: NextRequest, params: { id: string }) {
    try {
        const targetId = params.id;

        const [trustCount, distrustCount] = await Promise.all([
            prisma.trustVote ? prisma.trustVote.count({ where: { targetId, type: 'TRUST' } }) : 0,
            prisma.trustVote ? prisma.trustVote.count({ where: { targetId, type: 'DISTRUST' } }) : 0
        ]);

        return NextResponse.json({
            trust: trustCount,
            distrust: distrustCount,
            score: trustCount - distrustCount // or just raw counts
        });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}


export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => voteUser(r, user, context.params))(req);

export const GET = (req: NextRequest, context: { params: { id: string } }) =>
    getTrustStats(req, context.params);
