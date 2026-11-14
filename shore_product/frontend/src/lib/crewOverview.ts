export interface OverviewCrewMember {
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  rankCode?: string;
  rankName?: string;
  rank?: { rankCode?: string; rankName?: string } | null;
}

const normalize = (value?: string) => (value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function findVesselCaptain(crew: OverviewCrewMember[]): string | undefined {
  const captain = crew.find(member => {
    const code = normalize(member.rankCode || member.rank?.rankCode);
    const name = normalize(member.rankName || member.rank?.rankName);
    return ['capt', 'captain', 'master'].includes(code)
      || ['thuyen truong', 'captain', 'master'].includes(name);
  });
  return captain ? captain.fullName || captain.name
    || `${captain.firstName || ''} ${captain.lastName || ''}`.trim() || undefined : undefined;
}
