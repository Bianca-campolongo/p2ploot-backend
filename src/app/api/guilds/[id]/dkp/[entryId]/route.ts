import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGuildManager } from '@/lib/guildAuth';

// DELETE - Revoke a specific DKP entry
async function revokeDkp(req: NextRequest, user: any, params: { id: string, entryId: string }) {
    try {
        const guildId = BigInt(params.id);
        const { entryId } = params;

        // Verify Caller Permissions (Owner/Admin)
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Fetch the entry to get the amount and memberId
        const entry = await prisma.guildDkpLedger.findUnique({
            where: { id: entryId }
        });

        if (!entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        if (entry.guildId !== guildId) {
            return NextResponse.json({ error: 'Entry does not belong to this guild' }, { status: 400 });
        }

        // Perform the soft deletion and adjustment in a transaction
        await prisma.$transaction(async (tx) => {
            // 1. Soft Delete the ledger entry by setting amount to 0
            await tx.guildDkpLedger.update({
                where: { id: entryId },
                data: { amount: 0 }
            });

            // 2. Adjust the member's DKP balance (subtract the OLD amount)
            await tx.$executeRaw`
                UPDATE guild_members 
                SET dkp_balance = dkp_balance - ${entry.amount} 
                WHERE guild_id = ${guildId} AND member_id = ${entry.memberId}
            `;
        });

        return NextResponse.json({ success: true, message: 'DKP entry revoked and balance adjusted.' });

    } catch (error) {
        console.error('Error revoking DKP entry:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const DELETE = (req: NextRequest, context: { params: { id: string, entryId: string } }) =>
    requireAuth((r: NextRequest, user: any) => revokeDkp(r, user, context.params))(req);
