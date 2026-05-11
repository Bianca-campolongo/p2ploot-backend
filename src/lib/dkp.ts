import { prisma } from './prisma';

/**
 * Applies DKP decay to all members of a guild.
 * @param tx Prisma transaction client
 * @param guildId Guild ID (BigInt)
 * @param decayPercent Percentage to decay (0-100)
 * @param createdBy User ID who triggered the decay (null for automatic)
 */
export async function applyDecay(tx: any, guildId: bigint, decayPercent: number, createdBy: string | null = null) {
  if (decayPercent <= 0) return;

  // 1. Get all members with positive balance
  const members = await tx.guildMember.findMany({
    where: {
      guildId,
      dkpBalance: { gt: 0 }
    },
    select: {
      memberId: true,
      dkpBalance: true
    }
  });

  if (members.length === 0) return;

  const entries = [];
  const decayFactor = decayPercent / 100;

  for (const member of members) {
    const currentBalance = Number(member.dkpBalance);
    const decayAmount = Math.round(currentBalance * decayFactor * 100) / 100;
    
    if (decayAmount <= 0) continue;

    // Negative amount for ledger
    const ledgerAmount = -decayAmount;

    entries.push({
      guildId,
      memberId: member.memberId,
      amount: ledgerAmount,
      description: `Decay Automático (-${decayPercent}%)`,
      createdBy
    });

    // Update individual balance
    // Using raw SQL to avoid precision issues and handle Decimal update correctly
    await tx.$executeRaw`UPDATE guild_members SET dkp_balance = dkp_balance - ${decayAmount} WHERE guild_id = ${guildId} AND member_id = ${member.memberId}`;
  }

  // 2. Create Ledger Entries
  if (entries.length > 0) {
    await tx.guildDkpLedger.createMany({
      data: entries
    });
  }

  return entries.length;
}
