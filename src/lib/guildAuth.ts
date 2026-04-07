import { prisma } from './prisma';

/**
 * Checks if a user has guild management permissions (owner or admin level).
 * 
 * A user can be an admin either:
 * 1. As a regular GuildMember with role 'owner' or 'admin'
 * 2. As a pilot (GuildCharacterShare) with permissions.guildRole = 'admin'
 * 
 * @returns 'owner' | 'admin' | 'member' | 'pilot' | 'none'
 */
export async function getGuildUserRole(guildId: bigint, userId: string): Promise<string> {
    // Check guild ownership
    const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { ownerId: true, ownerAddress: true }
    });

    if (guild && (guild.ownerId === userId || guild.ownerAddress === userId)) {
        return 'owner';
    }

    // Check regular membership
    const member = await prisma.guildMember.findUnique({
        where: { guildId_memberId: { guildId, memberId: userId } }
    });

    if (member) {
        return member.role || 'member';
    }

    // Check pilot share permissions
    const pilotShare = await prisma.guildCharacterShare.findFirst({
        where: {
            sharedWithUserId: userId,
            guildId: guildId,
            status: 'approved'
        }
    });

    if (pilotShare) {
        const permissions = typeof pilotShare.permissions === 'string'
            ? JSON.parse(pilotShare.permissions as string)
            : (pilotShare.permissions as any);
        
        const guildRole = permissions?.guildRole;
        if (guildRole && ['admin', 'owner'].includes(guildRole)) {
            return guildRole;
        }
        return 'pilot';
    }

    return 'none';
}

/**
 * Returns true if the user has management (admin or owner) permissions in the guild.
 * Accounts for regular members AND pilots with admin permissions.
 */
export async function isGuildManager(guildId: bigint, userId: string): Promise<boolean> {
    const role = await getGuildUserRole(guildId, userId);
    return ['owner', 'admin'].includes(role);
}
