import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { applyDecay } from '@/lib/dkp';

// POST - Trigger Manual DKP Decay
async function manualDecay(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);

        // Check permissions (Owner/Admin)
        const callingMember = await prisma.guildMember.findUnique({
            where: {
                guildId_memberId: {
                    guildId,
                    memberId: user.id
                }
            }
        });

        if (!callingMember || !['owner', 'admin'].includes(callingMember.role)) {
            // Also check if user is the actual guild owner
            const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true, ownerAddress: true, dkpDecayPercent: true, dkpConfig: true } });
            const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);

            if (!isOwner) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        // Fetch guild data for decay configuration
        const guild = await prisma.guild.findUnique({ 
            where: { id: guildId }, 
            select: { dkpDecayPercent: true, dkpConfig: true } 
        });

        if (!guild || !guild.dkpDecayPercent) {
            return NextResponse.json({ error: 'DKP Decay is not configured or percent is zero.' }, { status: 400 });
        }

        const dkpConfig = (guild.dkpConfig as any) || {};

        let count = 0;
        await prisma.$transaction(async (tx) => {
            count = await applyDecay(tx, guildId, guild.dkpDecayPercent as number, user.id) || 0;
            
            // Update last_decay_at in dkp_config
            const newConfig = { ...dkpConfig, last_decay_at: new Date().toISOString() };
            await tx.guild.update({
                where: { id: guildId },
                data: { dkpConfig: newConfig }
            });
        });

        return NextResponse.json({ success: true, count, message: `Decay de ${guild.dkpDecayPercent}% aplicado a ${count} membros.` });

    } catch (error: any) {
        console.error('Error in manual DKP decay:', error);
        return NextResponse.json({ error: 'Internal server error', message: error.message }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => manualDecay(r, user, context.params))(req);
