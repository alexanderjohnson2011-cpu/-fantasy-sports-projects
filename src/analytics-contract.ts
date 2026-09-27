export type PowerRow = {
  rosterId: number; rank: number; score: number;
  lineupScore: number; depthScore: number; balanceScore: number; priorScore: number;
};

export function publishedPowerProfile(rows: PowerRow[], rosterId: number) {
  const row = rows.find((candidate) => candidate.rosterId === rosterId);
  if (!row) throw new Error(`Missing published power ranking for roster ${rosterId}`);
  const grade = row.score >= 92 ? "A" : row.score >= 87 ? "A−" : row.score >= 80 ? "B+"
    : row.score >= 75 ? "B" : row.score >= 70 ? "B−" : row.score >= 65 ? "C+"
    : row.score >= 60 ? "C" : row.score >= 55 ? "C−" : "D";
  const tier = row.rank === 1 ? "Power Index leader" : row.rank <= 3 ? "Top power tier"
    : row.rank <= 7 ? "Middle power tier" : "Lower power tier";
  const componentRank = (key: "lineupScore" | "depthScore") =>
    1 + rows.filter((candidate) => candidate[key] > row[key]).length;
  return { ...row, grade, tier, scoringScore: row.priorScore,
    lineupRank: componentRank("lineupScore"), depthRank: componentRank("depthScore") };
}

export function championshipFavorite<T extends { rosterId: number; championshipProbability: number }>(rows: T[]): T | undefined {
  return [...rows].sort((a, b) => b.championshipProbability - a.championshipProbability || a.rosterId - b.rosterId)[0];
}
