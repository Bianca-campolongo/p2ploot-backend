/**
 * Centralized reputation calculation logic
 */

export function calculateReputation(profile: any) {
  let score = 0;
  const details: string[] = [];

  // 1. Discord Account Age
  if (profile.discordCreatedAt) {
    const created = new Date(profile.discordCreatedAt);
    const now = new Date();
    const diffYears = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);

    if (diffYears >= 5) {
      score += 20;
      details.push('Discord > 5 anos (+20)');
    } else if (diffYears >= 2) {
      score += 10;
      details.push('Discord > 2 anos (+10)');
    } else if (diffYears < 0.5) {
      // < 6 months
      details.push('Discord: Criado recentemente');
    }
  } else {
    details.push('Discord não vinculado');
  }

  // 2. Trades Completed (Base Reputation)
  if (profile.reputationScore) {
    score += profile.reputationScore;
    details.push(`Negociações: ${profile.reputationScore} (+${profile.reputationScore})`);
  } else {
    details.push('Sem negociações');
  }

  // 3. Guild Membership
  if (profile.guildMembers && profile.guildMembers.length > 0) {
    // Find highest role
    const roles = profile.guildMembers.map((gm: any) => gm.role ? gm.role.toLowerCase() : '');

    if (roles.includes('owner') || roles.includes('leader')) {
      score += 10;
      details.push('Líder de Guilda (+10)');
    } else {
      score += 2;
      details.push('Membro de Guilda (+2)');
    }
  } else {
    details.push('Sem afiliação de Guilda');
  }

  return { score, rawScore: score, details };
}
