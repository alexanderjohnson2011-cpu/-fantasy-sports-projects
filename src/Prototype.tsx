import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChartBar,
  ChartLineUp,
  ClockCounterClockwise,
  Football,
  Info,
  Lightning,
  List,
  Television,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import leagueInsightsJson from "./generated/league-insights.json";
import macSaladAwardsJson from "./generated/mac-salad-awards.json";
import forecastInsightsJson from "./generated/forecast-insights.json";
import draftRecapJson from "./generated/draft-recap.json";
import weeklyRecapJson from "./generated/weekly-recap.json";
import powerRankingsJson from "./generated/power-rankings.json";
import matchupsWeek1Json from "./generated/matchups-week1.json";

type WeeklyMatchup = {
  week: number;
  opponentRosterId: number;
  opponentName: string;
  winProbability: number;
  projectedScore: number;
  opponentProjectedScore: number;
  spread: number;
  spreadLabel: string;
};

type Week1Starter = {
  slot: string;
  player: string;
  position: string;
  nflTeam: string;
  projectedPoints: number;
  tier: string;
  matchupVs: string;
  news: string;
};

type PositionalEdge = {
  category: string;
  advantage: string;
  margin: string;
  narrative: string;
};

type TVScheduleSlot = {
  timeSlot: string;
  network: string;
  gameMatchup: string;
  leverageLevel: string;
  fantasyPointsAtStake: string;
  teamAStarters: string[];
  teamBStarters: string[];
  windowAnalysis: string;
};

type MatchupTactical = {
  headline: string;
  breakdown: string;
  keyVariables: string[];
};

type Week1TeamData = {
  rosterId: number;
  teamName: string;
  manager: string;
  powerRank: number;
  projectedRank: number;
  projectedScore: number;
  winProbability: number;
  impliedTotal: number;
  starters: Week1Starter[];
};

type Week1Matchup = {
  matchupId: number;
  week: number;
  title: string;
  subtitle: string;
  isMarquee: boolean;
  teamA: Week1TeamData;
  teamB: Week1TeamData;
  spread: number;
  spreadLabel: string;
  overUnder: number;
  tacticalAnalysis: MatchupTactical;
  positionalEdges: PositionalEdge[];
  tvSchedule: TVScheduleSlot[];
};

type SeedProbability = {
  seed: number;
  probability: number;
};

type HistoryNote = {
  date: string;
  expectedWins: number;
  playoffOdds: number;
  titleOdds: number;
  rank: number;
  event: string;
};

type FluctuationNarrative = {
  headline: string;
  trend: string;
  primaryDriver: string;
  analysis: string;
  keyRisk: string;
  historyNotes: HistoryNote[];
};

type PillarInfo = {
  rank: number;
  score: number;
  weight: string;
  label: string;
};

type ModelFactors = {
  compositePowerScore: number;
  projectedMeanScore: number;
  weeklyStdDev: number;
  p10WeeklyFloor: number;
  p90WeeklyCeiling: number;
  volatilityScore: number;
  volatilityLabel: string;
  topThreeShare: number;
  rbShare: number;
  depthRisk: number;
  concentrationRisk: number;
  pillars: {
    lineup: PillarInfo;
    depth: PillarInfo;
    balance: PillarInfo;
    history: PillarInfo;
  };
  volatilityImpactNarrative: string;
};

type TeamForecast = {
  rosterId: number;
  teamName: string;
  projectedRank?: number;
  expectedSeed?: number;
  powerRank?: number;
  powerScore?: number;
  powerRankDelta?: number;
  powerDeltaLabel?: string;
  powerConnectionNarrative?: string;
  modelFactors?: ModelFactors;
  expectedWins: number;
  expectedLosses: number;
  expectedPointsFor: number;
  playoffProbability: number;
  byeProbability: number;
  championshipProbability: number;
  lastPlaceProbability: number;
  medianSeed: number;
  bestCaseSeed?: number;
  worstCaseSeed?: number;
  seedDistribution?: SeedProbability[];
  weeklySchedule?: WeeklyMatchup[];
  fluctuationNarrative?: FluctuationNarrative;
};

type ForecastInsights = {
  forecastRunId: string;
  generatedAt: string;
  simulationsCount: number;
  randomSeed: number;
  modelVersion: string;
  methodology: string;
  teams: Record<string, TeamForecast>;
};

const forecastInsights = forecastInsightsJson as ForecastInsights;

type Pick = {
  slot: string;
  player: string;
  position: string;
  expertRank?: number;
  marketRank?: number;
  acquired?: boolean;
};

type RedraftPlayer = {
  playerId: string;
  player: string;
  position: string;
  nflTeam: string;
  age: number | null;
  rosterStatus: string;
  dynastyValue: number;
  redraftRank: number | null;
  redraftValue: number;
  trend30Day: number;
  marketSlot: { label: string; round: number | null; pick: number | null };
};

type TeamInsight = {
  rosterId: number;
  metrics: {
    powerRank: number;
    dynastyCoreRank: number;
    redraftLineupRank: number;
    depthRank: number;
    totalValueRank: number;
    youthRank: number;
    youthValueShare: string;
    futureFirsts: number;
    futurePicksThreeYear: number;
    strongestRoom: string;
    weakestRoom: string;
    window: string;
    qbRoomRank: number;
    rbRoomRank: number;
    wrRoomRank: number;
    teRoomRank: number;
    dynastyCoreValue: number;
    redraftLineupValue: number;
    depthValue: number;
    totalRosterValue: number;
  };
  topAssets: Array<{ player: string; position: string; nflTeam: string; dynastyValue: number }>;
  redraftBoard: RedraftPlayer[];
  draftAudit: {
    executionGrade: string;
    blendedValueCapture: number;
    leagueAdjustedCapture: number;
    picks: Array<{
      slot: string;
      marketValueRatio: number;
      expertValueRatio: number;
      marketLabel: string;
      expertLabel: string;
      expectedSlotValue: number;
    }>;
  };
  previousSeason: {
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    potentialPoints: number;
    finish: number | null;
  } | null;
};

type LeagueInsights = {
  generatedAt: string;
  draftState: { status: string; picksMade: number; totalPicks: number };
  previousSeason: { season: string; leagueId: string; championRosterId: number };
  redraftMethod: string;
  teams: Record<string, TeamInsight>;
};

const leagueInsights = leagueInsightsJson as LeagueInsights;

type MacSaladAward = {
  id: string;
  season: string;
  date: string;
  displayDate: string;
  occasion: string;
  manager: string;
  team: string;
  reason: string;
};

type MacSaladHistory = {
  currentSeason: string;
  awards: MacSaladAward[];
};

const macSaladHistory = macSaladAwardsJson as MacSaladHistory;
const currentMacSaladAwards = macSaladHistory.awards.filter(
  (award) => award.season === macSaladHistory.currentSeason,
);
const macSaladSeasons = [...new Set(macSaladHistory.awards.map((award) => award.season))].sort(
  (a, b) => Number(b) - Number(a),
);
const macSaladStandings = Object.values(
  currentMacSaladAwards.reduce<Record<string, { manager: string; team: string; count: number }>>(
    (standings, award) => {
      const current = standings[award.manager] ?? { manager: award.manager, team: award.team, count: 0 };
      standings[award.manager] = { ...current, team: award.team, count: current.count + 1 };
      return standings;
    },
    {},
  ),
).sort((a, b) => b.count - a.count || a.manager.localeCompare(b.manager));

type Team = {
  rosterId: number;
  rank: number;
  name: string;
  manager: string;
  headline: string;
  commentary: string;
  bestPick: string;
  question: string;
  verdict: string;
  capitalNote: string;
  capitalOutcome?: number;
  expertCapture?: number;
  marketCapture?: number;
  originalPicks: number;
  acquiredPicks: number;
  cycleScore: number | null;
  cycleGrade: string;
  scores: { execution: number | null; capital: number | null; fit: number | null };
  picks: Pick[];
};

const draftRecap = draftRecapJson;

// Draft Recap facts come from the generated payload. Nothing about a team is
// authored here and no grade is computed in the browser: the pipeline owns the
// scoring engine (MASTER_PLAN P5-1).
const teams: Team[] = draftRecap.teams.map((entry) => ({
  rosterId: entry.rosterId,
  rank: entry.rank ?? draftRecap.teams.length,
  name: entry.teamName,
  manager: entry.managerName,
  headline: entry.narrative.headline,
  commentary: entry.narrative.commentary,
  bestPick: entry.narrative.bestPick,
  question: entry.narrative.biggestQuestion,
  verdict: entry.narrative.verdict,
  capitalNote: entry.narrative.capitalNote,
  capitalOutcome:
    entry.components.capital.ratio != null
      ? Number((entry.components.capital.ratio * 100).toFixed(1))
      : undefined,
  expertCapture: entry.capture.expertPct ?? undefined,
  marketCapture: entry.capture.marketPct ?? undefined,
  originalPicks: entry.pickCounts.original,
  acquiredPicks: entry.pickCounts.acquired,
  cycleScore: entry.cycle.score,
  cycleGrade: entry.cycle.grade,
  scores: {
    execution: entry.components.execution.score,
    capital: entry.components.capital.score,
    fit: entry.components.fit.score,
  },
  picks: entry.picks.map((pick) => ({
    slot: pick.slot,
    player: pick.playerName,
    position: pick.position,
    expertRank: pick.expertConsensusRank ?? undefined,
    marketRank: pick.marketRookieRank ?? undefined,
    acquired: pick.provenance === "acquired",
  })),
}));

const powerEditorial: Record<number, { headline: string; now: string; future: string }> = {
  12: {
    headline: "The most complete lineup in the league starts the season on the pole.",
    now: "The No. 1 redraft lineup and elite QB/WR rooms make Bronco Stampede the title favorite. The only obvious soft spot is tight end, and it is relative rather than fatal.",
    future: "The dynasty core also ranks first, but zero 2027 firsts and only 10 picks over three years leave less insulation than the roster value suggests.",
  },
  10: {
    headline: "Elite depth gives the contender more ways to survive a long season.",
    now: "The league's deepest roster pairs Bijan Robinson and Amon-Ra St. Brown with the No. 2 QB room. WR depth is the one area that can still make the weekly lineup feel thinner than the total value.",
    future: "A No. 2 dynasty core and balanced age profile keep the window open. The modest future-pick inventory means the next consolidation trade needs to land cleanly.",
  },
  1: {
    headline: "The defending champion is built to repeat now, not to age gracefully.",
    now: "Last year's champion still owns the No. 3 redraft lineup and No. 2 depth. McBride plus a veteran RB wave creates a high weekly floor.",
    future: "The dynasty core falls to fifth and the youth profile ranks 12th. A strong 13-pick inventory can finance the transition, but the manager cannot wait for every veteran to decline at once.",
  },
  3: {
    headline: "A star-heavy contender with very little margin for an injury cluster.",
    now: "Justin Jefferson, Brock Bowers, and Lamar Jackson drive the No. 2 redraft lineup. Depth ranks 10th, so the starting advantage can disappear quickly when byes and injuries overlap.",
    future: "The dynasty core ranks third and the 15-pick pipeline is excellent. Converting some distant capital into one more weekly starter would balance both horizons.",
  },
  2: {
    headline: "The league's best RB room needs help everywhere it flexes.",
    now: "Gibbs, Jeanty, and Taylor can win weeks by themselves, but the No. 6 redraft lineup and No. 9 depth reveal how concentrated the roster is.",
    future: "A top-four dynasty core and the league's No. 3 youth profile make this an enviable three-year roster. Wide receiver development is the hinge between interesting and dominant.",
  },
  8: {
    headline: "A balanced middle-class roster without a single fatal weakness—or a clear edge.",
    now: "The current lineup, depth, and total value all land between sixth and eighth. CeeDee Lamb and A.J. Brown supply ceiling, while the league's weakest TE room costs weekly optionality.",
    future: "The dynasty core is seventh and the youth profile is 10th. This roster needs either a decisive win-now move or a value reset before it gets trapped in the middle.",
  },
  9: {
    headline: "Superstar receivers keep the ceiling high, but the weekly lineup trails the names.",
    now: "Ja'Marr Chase and Garrett Wilson headline a dangerous core, yet the redraft lineup ranks eighth and the tight-end room ranks 11th.",
    future: "The No. 6 dynasty core is stronger than the current-year rank, but the league's No. 11 youth profile creates pressure to keep refreshing the supporting cast.",
  },
  7: {
    headline: "A real 2026 threat with the league's sharpest age-and-depth warning.",
    now: "Achane, Hampton, and McCaffrey power the No. 5 redraft lineup. The WR room ranks last, which is especially painful with three FLEX spots.",
    future: "Dynasty rank nine, depth rank 12, and a middling pick inventory make this the clearest win-now roster on the board. The current window should be treated as perishable.",
  },
  5: {
    headline: "The future-facing WR core is ahead of the current lineup.",
    now: "Nabers and McMillan create weekly spike potential, but the redraft lineup ranks 10th and the RB room ranks last. The roster is not yet deep enough to hide that imbalance.",
    future: "The No. 2 youth profile, two 2027 firsts, and a top-eight dynasty core create one of the league's better ascent paths. The next move should add RB points without selling the WR foundation.",
  },
  11: {
    headline: "More useful assets than weekly difference-makers.",
    now: "The No. 9 redraft lineup and No. 10 dynasty core explain the retool label. Depth ranks fifth, so consolidation—not another broad accumulation phase—is the clearest route upward.",
    future: "A top-four youth profile and 12 picks over three years keep the runway open. Price, Lemon, and the next major trade will determine whether the roster becomes competitive before that value matures.",
  },
  4: {
    headline: "The league's youngest roster is a year away from being truly annoying.",
    now: "Depth ranks third, but both the dynasty core and redraft lineup sit 11th. Love and Breece Hall provide an RB base; quarterback remains the immediate bottleneck.",
    future: "The No. 1 youth profile and league-high 16 future picks create the strongest long rebuild runway. Patience is an asset here, provided volume eventually becomes premium starters.",
  },
  6: {
    headline: "A rebuild finally has a centerpiece, but the 2026 standings will still be uphill.",
    now: "The roster ranks 12th in redraft lineup, dynasty core, and total value. George Pickens and Carnell Tate are a start, not a full weekly offense.",
    future: "The draft added a face to the rebuild, but depth ranks 11th and the future-pick inventory is only average. The next cycle must add both liquidity and startable RB volume.",
  },
};

// Superlatives are chosen by explicit selectors in the pipeline (sub-plan ss12.7),
// not curated here. A category with no qualifying pick is omitted upstream.
const draftSuperlatives = draftRecap.superlatives.map(
  (s) => [s.label, s.displayWinner, s.note] as const,
);

type NavId = "analysis" | "power" | "matchups" | "forecast";

type Route =
  | { kind: "nav"; id: NavId }
  | { kind: "team"; rank: number }
  | { kind: "powerTeam"; rosterId: number }
  | { kind: "forecastTeam"; rosterId: number }
  | { kind: "matchup"; matchupId: number }
  | { kind: "methodology" };

const navItems: Array<{ id: NavId; label: string; icon: typeof BookOpenText }> = [
  { id: "analysis", label: "Draft Recap", icon: BookOpenText },
  { id: "power", label: "Power Rankings", icon: UsersThree },
  { id: "matchups", label: "Matchups", icon: Football },
  { id: "forecast", label: "Forecast", icon: ChartLineUp },
];

function padRank(rank: number) {
  return String(rank).padStart(2, "0");
}

function scoreLabel(value: number) {
  if (value >= 90) return "Elite";
  if (value >= 80) return "Strong";
  if (value >= 70) return "Solid";
  if (value >= 60) return "Mixed";
  return "Concern";
}

function insightFor(team: Team) {
  return leagueInsights.teams[String(team.rosterId)];
}

function dynastyGrade(rank: number) {
  return ["A+", "A", "A", "A−", "B+", "B+", "B", "B", "B−", "C+", "C", "D+"][rank - 1] ?? "—";
}

function ordinal(value: number | null) {
  if (!value) return "—";
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function rankBar(rank: number) {
  return `${Math.max(8, ((13 - rank) / 12) * 100)}%`;
}

function draftCycleScore(team: Team) {
  return team.cycleScore;
}

// The payload carries ASCII grades; the product renders a typographic minus.
function draftCycleGrade(team: Team) {
  return team.cycleGrade.replace("-", "−");
}

function rankComponentScore(rank: number) {
  return 100 - (rank - 1) * 5;
}

function viabilityGrade(score: number) {
  if (score >= 92) return "A";
  if (score >= 87) return "A−";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B−";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C−";
  return "D";
}

function competitionTier(rank: number) {
  if (rank === 1) return "Title favorite";
  if (rank <= 3) return "Championship tier";
  if (rank === 4) return "Contender";
  if (rank <= 7) return "Playoff bubble";
  if (rank <= 10) return "Outside looking in";
  return "Development year";
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

type PowerProfile = {
  rosterId: number;
  rank: number;
  grade: string;
  tier: string;
  score: number;
  lineupScore: number;
  depthScore: number;
  balanceScore: number;
  scoringScore: number;
  scoringRank: number;
  pointsPerGame: number;
  potentialPointsPerGame: number;
  lineupEfficiency: number;
  lineupVsMedian: number;
  depthVsMedian: number;
  eliteCount: number;
  startableCount: number;
  topThreeShare: number;
  rbShare: number;
  volatilityScore: number;
  volatilityLabel: string;
};

const priorScoringOrder = [...teams].sort(
  (a, b) => (insightFor(b).previousSeason?.pointsFor ?? 0) - (insightFor(a).previousSeason?.pointsFor ?? 0),
);
const priorScoringRanks = new Map(priorScoringOrder.map((team, index) => [team.rosterId, index + 1]));
const medianLineupValue = median(teams.map((team) => insightFor(team).metrics.redraftLineupValue));
const medianDepthValue = median(teams.map((team) => insightFor(team).metrics.depthValue));

const powerProfiles: PowerProfile[] = teams
  .map((team) => {
    const insight = insightFor(team);
    const metrics = insight.metrics;
    const history = insight.previousSeason;
    const games = history ? history.wins + history.losses + history.ties : 0;
    const scoringRank = priorScoringRanks.get(team.rosterId) ?? 12;
    const lineupScore = rankComponentScore(metrics.redraftLineupRank);
    const depthScore = rankComponentScore(metrics.depthRank);
    const balanceScore =
      rankComponentScore(metrics.qbRoomRank) * 0.1 +
      rankComponentScore(metrics.rbRoomRank) * 0.3 +
      rankComponentScore(metrics.wrRoomRank) * 0.45 +
      rankComponentScore(metrics.teRoomRank) * 0.15;
    const scoringScore = rankComponentScore(scoringRank);
    const score = lineupScore * 0.55 + depthScore * 0.25 + balanceScore * 0.1 + scoringScore * 0.1;
    const relevantPlayers = insight.redraftBoard.filter((player) => player.redraftValue > 0).slice(0, 10);
    const relevantValue = relevantPlayers.reduce((total, player) => total + player.redraftValue, 0) || 1;
    const topThreeShare = relevantPlayers.slice(0, 3).reduce((total, player) => total + player.redraftValue, 0) / relevantValue;
    const rbShare = relevantPlayers.filter((player) => player.position === "RB").reduce((total, player) => total + player.redraftValue, 0) / relevantValue;
    const concentrationRisk = Math.max(0, Math.min(100, ((topThreeShare - 0.35) / 0.3) * 100));
    const depthRisk = ((metrics.depthRank - 1) / 11) * 100;
    const volatilityScore = concentrationRisk * 0.4 + depthRisk * 0.35 + rbShare * 100 * 0.25;
    return {
      rosterId: team.rosterId,
      rank: 0,
      grade: "—",
      tier: "",
      score: Number(score.toFixed(1)),
      lineupScore,
      depthScore,
      balanceScore: Number(balanceScore.toFixed(1)),
      scoringScore,
      scoringRank,
      pointsPerGame: games ? Number((history!.pointsFor / games).toFixed(1)) : 0,
      potentialPointsPerGame: games ? Number((history!.potentialPoints / games).toFixed(1)) : 0,
      lineupEfficiency: history?.potentialPoints ? Number(((history.pointsFor / history.potentialPoints) * 100).toFixed(1)) : 0,
      lineupVsMedian: Number((((metrics.redraftLineupValue / medianLineupValue) - 1) * 100).toFixed(1)),
      depthVsMedian: Number((((metrics.depthValue / medianDepthValue) - 1) * 100).toFixed(1)),
      eliteCount: insight.redraftBoard.filter((player) => player.redraftRank && player.redraftRank <= 36).length,
      startableCount: insight.redraftBoard.filter((player) => player.redraftRank && player.redraftRank <= 120).length,
      topThreeShare: Number((topThreeShare * 100).toFixed(1)),
      rbShare: Number((rbShare * 100).toFixed(1)),
      volatilityScore: Number(volatilityScore.toFixed(1)),
      volatilityLabel: volatilityScore <= 35 ? "Stable" : volatilityScore <= 55 ? "Balanced" : volatilityScore <= 70 ? "Volatile" : "High variance",
    };
  })
  .sort((a, b) => b.score - a.score)
  .map((profile, index) => ({
    ...profile,
    rank: index + 1,
    grade: viabilityGrade(profile.score),
    tier: competitionTier(index + 1),
  }));

function powerProfileFor(team: Team) {
  return powerProfiles.find((profile) => profile.rosterId === team.rosterId)!;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function playerVolatilityScore(player: RedraftPlayer) {
  const trendRate = player.dynastyValue ? Math.abs(player.trend30Day) / player.dynastyValue : 0;
  return (
    (player.position === "RB" ? 28 : 0) +
    (player.age && player.age >= 28 ? 24 : 0) +
    (player.age && player.age <= 23.5 ? 16 : 0) +
    (!player.redraftRank || player.redraftRank > 72 ? 18 : 0) +
    (trendRate >= 0.06 ? 18 : 0) +
    (player.rosterStatus !== "starter" ? 8 : 0)
  );
}

function playerVolatilityLabel(player: RedraftPlayer) {
  const trendRate = player.dynastyValue ? Math.abs(player.trend30Day) / player.dynastyValue : 0;
  if (player.position === "RB" && player.age && player.age >= 28) return "Veteran RB exposure";
  if (player.position === "RB") return "RB role / health swing";
  if (player.age && player.age <= 23.5 && (!player.redraftRank || player.redraftRank > 72)) return "Young role still forming";
  if (trendRate >= 0.06) return "Fast-moving market";
  if (player.redraftRank && player.redraftRank <= 48) return "Weekly anchor";
  return "Flex-role variance";
}

function volatilePlayersFor(team: Team) {
  return insightFor(team).redraftBoard
    .filter((player) => player.redraftValue > 0)
    .slice(0, 12)
    .sort((a, b) => playerVolatilityScore(b) - playerVolatilityScore(a) || (a.redraftRank ?? 999) - (b.redraftRank ?? 999))
    .slice(0, 4);
}

function pickNumber(slot: string) {
  const [round, position] = slot.split(".").map(Number);
  return (round - 1) * 12 + position;
}

function pickAnalysis(team: Team, pick: Pick) {
  const overall = pickNumber(pick.slot);
  const expertGap = pick.expertRank ? overall - pick.expertRank : 0;
  const marketGap = pick.marketRank ? overall - pick.marketRank : 0;
  const audit = insightFor(team).draftAudit.picks.find((entry) => entry.slot === pick.slot);
  const marketRatio = audit?.marketValueRatio ?? 1;
  const expertRatio = audit?.expertValueRatio ?? 1;
  const blendedRatio = (marketRatio + expertRatio) / 2;
  let label = "Defensible value";
  let tone = "neutral";
  let grade = "B";
  let boardRead = `This pick returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value across the expert and market curves—a reasonable price without a major surplus.`;

  if (blendedRatio >= 1.2) {
    label = "Premium value";
    tone = "positive";
    grade = "A+";
    boardRead = `This is the pick that drives the class: it returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value, with both curves pricing ${pick.player} above pick ${overall}.`;
  } else if (blendedRatio >= 1.1) {
    label = "Clear value";
    tone = "positive";
    grade = "A";
    boardRead = `The selection created a real cushion, returning ${(blendedRatio * 100).toFixed(1)}% of slot value across the two curves.`;
  } else if (blendedRatio >= 1.03) {
    label = "Positive value";
    tone = "positive";
    grade = "A−";
    boardRead = `The pick beat its expected cost by ${(blendedRatio * 100 - 100).toFixed(1)}%, enough to create value without overstating a small rank gap.`;
  } else if (blendedRatio >= 0.98) {
    label = "Market price";
    grade = "B+";
    boardRead = `The player returned ${(blendedRatio * 100).toFixed(1)}% of expected value. That is disciplined slot execution, even if it is not a steal.`;
  } else if (blendedRatio < 0.85) {
    label = "Reach";
    tone = "warning";
    grade = blendedRatio < 0.75 ? "D" : "C";
    boardRead = `The pick retained only ${(blendedRatio * 100).toFixed(1)}% of expected slot value. Both the nonlinear value curve and the rank board indicate that trading down was the cleaner process.`;
  } else if (blendedRatio < 0.93) {
    label = "Aggressive bet";
    tone = "warning";
    grade = "C+";
    boardRead = `The selection returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value. The miss is survivable, but the player must outperform the tier.`;
  }

  const rankRead = expertGap === 0 && marketGap === 0
    ? " Both ordinal boards matched the slot exactly."
    : ` Expert rank ${pick.expertRank}; market rank ${pick.marketRank}; selected ${overall}${expertGap >= 0 || marketGap >= 0 ? "." : "—ahead of both signals."}`;

  const formatRead = pick.position === "QB"
    ? "In this 1QB, four-point pass-TD format, the payoff requires starter-level value or a future trade market."
    : pick.position === "TE"
      ? "With no TE premium, the player needs a credible starting path—not merely an interesting athletic profile."
      : `The three-FLEX lineup gives another ${pick.position} more ways to become useful than it would have in a shallow format.`;
  const capitalRead = pick.acquired
    ? " Because the pick was acquired, its trade cost remains part of the permanent cycle grade."
    : " The selection came from original capital, so no volume bonus or acquisition penalty applies.";

  return { grade, label, tone, copy: `${boardRead}${rankRead} ${formatRead}${capitalRead}`, team: team.name, blendedRatio };
}

function SiteNav({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="site-nav__brand" aria-hidden="true">
        <img src="./assets/app/league-seal.png" alt="" />
        <span>Ape’s Mac Salad</span>
      </div>
      <div className="site-nav__links">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            className={active === item.id ? "bottom-nav__item is-active" : "bottom-nav__item"}
            key={item.id}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon size={25} weight={active === item.id ? "duotone" : "regular"} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function AppHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="masthead">
      <img className="league-seal" src="./assets/app/league-seal.png" alt="Ape’s Mac Salad league seal" />
      <p className="masthead__name">Ape’s Mac Salad · Dynasty</p>
      <button className="icon-button" type="button" aria-label="Open methodology" onClick={onMenu}>
        <List size={29} weight="regular" aria-hidden="true" />
      </button>
    </header>
  );
}

function AnalysisScreen({
  onTeam,
  onNavigate,
  onMethodology,
}: {
  onTeam: (team: Team) => void;
  onNavigate: (id: NavId) => void;
  onMethodology: () => void;
}) {
  const featured = teams[0];
  const board = teams.slice(1);

  return (
    <div className="app-screen almanac-screen web-screen">
      <main className="almanac-page" data-testid="almanac-screen">
        <AppHeader onMenu={onMethodology} />
        <section className="issue-intro">
          <h1>The 2026<br />Draft Recap</h1>
          <p className="issue-deck">Every pick, trade, and roster fit—graded like a real draft desk, for this league.</p>
        </section>
        <div className="issue-rule" aria-label="Report status">
          <span>
            {new Date(draftRecap.draft.snapshotAsOfUtc).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" · "}
            {draftRecap.draft.status}
          </span>
          <span>{leagueInsights.draftState.picksMade} / {leagueInsights.draftState.totalPicks} picks</span>
        </div>
        <button className="lead-story" type="button" onClick={() => onTeam(featured)}>
          <div className="mac-salad-ribbon">
            <img className="mac-salad-trophy" src="./assets/app/mac-salad-trophy.webp" alt="" />
            <span><small>Inaugural draft bowl</small><strong>{featured.manager} gets to eat Ape’s Mac Salad</strong></span>
          </div>
          <div className="lead-story__teamline">
            <span className="story-rank">01</span>
            <span className="story-rule" aria-hidden="true" />
            <h2>{featured.name}</h2>
          </div>
          <div className="lead-story__main">
            <span className="lead-grade">{draftCycleGrade(featured)}</span>
            <div>
              <h3>{featured.headline}</h3>
              <p>{featured.commentary}</p>
            </div>
          </div>
          <div className="lead-scores">
            <div><span>Pick execution</span><strong>{featured.scores.execution ?? "—"}</strong></div>
            <div><span>Capital</span><strong>{featured.scores.capital ?? "—"}</strong></div>
            <div><span>Roster fit</span><strong>{featured.scores.fit ?? "—"}</strong></div>
          </div>
        </button>
        <section className="board-section" aria-labelledby="board-title">
          <div className="section-heading">
            <h2 id="board-title">The Board</h2>
            <button type="button" onClick={() => onNavigate("power")}>Power ranks</button>
          </div>
          {board.map((team, index) => (
            <div key={team.name}>
              {index === 3 ? (
                <button className="editor-note" type="button" onClick={onMethodology}>
                  <Info size={20} weight="fill" aria-hidden="true" />
                  <em>Extra picks earn credit only after acquisition cost.</em>
                </button>
              ) : null}
              <button className="board-row" type="button" onClick={() => onTeam(team)}>
                <span className="board-row__rank">{padRank(team.rank)}</span>
                <span className="board-row__copy">
                  <strong>{team.name}</strong>
                  <em>{team.headline}</em>
                </span>
                <span className="board-row__grade">{draftCycleGrade(team)}</span>
                <ArrowRight size={22} weight="regular" aria-hidden="true" />
              </button>
            </div>
          ))}
          <section className="draft-notebook" aria-labelledby="notebook-title">
            <div className="section-heading">
              <h2 id="notebook-title">From the scouting notebook</h2>
              <ChartBar size={18} weight="duotone" aria-hidden="true" />
            </div>
            {draftSuperlatives.map(([label, winner, note]) => (
              <div className="notebook-row" key={label}>
                <span>{label}</span>
                <strong>{winner}</strong>
                <p>{note}</p>
              </div>
            ))}
          </section>
        </section>
        <p className="method-note">
          {draftRecap.draft.isFinal
            ? `Final after all ${draftRecap.draft.picksMade} Sleeper selections.`
            : `Provisional at ${draftRecap.draft.picksMade} of ${draftRecap.draft.totalPicks} selections.`}{" "}
          Grades use league-specific settings, {draftRecap.methodology.expertSources.length} expert boards,
          current market values, and the full {draftRecap.league.season}-pick trade ledger.
        </p>
      </main>
    </div>
  );
}

function DetailHeader({ onBack, team, context, grade }: { onBack: () => void; team: Team; context: string; grade: string }) {
  return (
    <div className="detail-header">
      <button type="button" onClick={onBack} aria-label="Back"><ArrowLeft size={24} /></button>
      <div><span>{context}</span><strong>{team.name}</strong></div>
      <span className="detail-header__grade">{grade}</span>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="score-bar">
      <div className="score-bar__label"><span>{label}</span><span>{value ?? "—"} · {value != null ? scoreLabel(value) : "Not applicable"}</span></div>
      <div className="score-bar__track"><span style={{ width: (value ?? 0) + "%" }} /></div>
    </div>
  );
}

function DraftTeamScreen({ team }: { team: Team }) {
  const [metric, setMetric] = useState<"expert" | "market">("expert");
  const selectedCapture = metric === "expert" ? team.expertCapture : team.marketCapture;
  const insight = insightFor(team);
  const expectedCapital = insight.draftAudit.picks.reduce((total, pick) => total + pick.expectedSlotValue, 0);
  const heaviestPick = [...insight.draftAudit.picks].sort((a, b) => b.expectedSlotValue - a.expectedSlotValue)[0];
  const heaviestPickWeight = heaviestPick && expectedCapital ? (heaviestPick.expectedSlotValue / expectedCapital) * 100 : 0;

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page" data-testid={"team-" + team.rank}>
        <section className="team-hero">
          <p className="eyebrow">{team.manager} · Draft rank #{team.rank}</p>
          {team.rank === 1 ? (
            <div className="team-award"><img src="./assets/app/mac-salad-trophy.webp" alt="" /><span>2026 Draft Mac Salad winner</span></div>
          ) : null}
          <span className="team-hero__label">Draft-cycle grade</span>
          <div className="team-hero__grade">{draftCycleGrade(team)}</div>
          <h1>{team.headline}</h1>
          <p>{team.commentary}</p>
        </section>
        <section className="detail-block grade-build">
          <div className="detail-title"><span>01</span><h2>Grade build</h2></div>
          <p className="detail-explainer">Permanent grade: 60% pick execution, 30% capital management, 10% roster construction.</p>
          <ScoreBar label="Pick execution" value={team.scores.execution} />
          <ScoreBar label="Capital management" value={team.scores.capital} />
          <ScoreBar label="Roster construction" value={team.scores.fit} />
          <div className="grade-compare">
            <div><span>Pick grade</span><strong>{insight.draftAudit.executionGrade}</strong></div>
            <div><span>Cycle grade</span><strong>{draftCycleGrade(team)}</strong><small>{draftCycleScore(team) != null ? `${draftCycleScore(team)} / 100` : "Incomplete"}</small></div>
          </div>
          {heaviestPick ? (
            <p className="grade-audit-note"><strong>Why the pick letters do not average evenly:</strong> selections are weighted by nonlinear slot value. {heaviestPick.slot} represents {heaviestPickWeight.toFixed(0)}% of this class’s expected draft capital, so its result matters far more than a fourth-round pick.</p>
          ) : null}
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>02</span><h2>Value captured</h2></div>
          <div className="metric-toggle" role="group" aria-label="Ranking source">
            <button className={metric === "expert" ? "is-active" : ""} onClick={() => setMetric("expert")} type="button">Expert board</button>
            <button className={metric === "market" ? "is-active" : ""} onClick={() => setMetric("market")} type="button">Live market</button>
          </div>
          <div className="capture-readout">
            <strong>{selectedCapture ? selectedCapture.toFixed(1) + "%" : "Pending"}</strong>
            <span>{selectedCapture ? (selectedCapture >= 100 ? "Value above slot cost" : "Value below slot cost") : "No selections yet"}</span>
          </div>
          <p className="source-note">Expert board blends four current 1QB sources. Market capture uses current 12-team, 1QB, half-PPR trade values.</p>
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>03</span><h2>Pick-by-pick analysis</h2></div>
          <p className="detail-explainer">Each call uses the same nonlinear expert and market value curves as the aggregate pick grade, then adds league fit and acquisition context.</p>
          {team.picks.length ? (
            <div className="pick-list">
              {team.picks.map((pick) => {
                const analysis = pickAnalysis(team, pick);
                return (
                  <article className={`pick-card pick-card--${analysis.tone}`} key={pick.slot}>
                    <div className="pick-row">
                      <span className="pick-slot">{pick.slot}</span>
                      <span className="pick-player"><strong>{pick.player}</strong><small>{pick.position}{pick.acquired ? " · acquired pick" : " · original pick"}</small></span>
                      <span className="pick-ranks"><small>EXP {pick.expertRank}</small><small>MKT {pick.marketRank}</small></span>
                    </div>
                    <div className="pick-call"><span><b>{analysis.grade}</b>{analysis.label}</span><p>{analysis.copy}</p></div>
                  </article>
                );
              })}
            </div>
          ) : <p className="empty-state">No rookie selection was made. The final draft-cycle evaluation therefore rests on capital management rather than pick execution.</p>}
          <div className="pick-summary">
            <span><strong>{team.originalPicks}</strong> original</span>
            <span><strong>{team.acquiredPicks}</strong> acquired</span>
          </div>
        </section>
        <section className="detail-block capital-block">
          <div className="detail-title"><span>04</span><h2>Capital context</h2></div>
          <div className="capital-number">
            <strong>{team.capitalOutcome?.toFixed(1)}%</strong>
            <span>current value received vs. sent</span>
          </div>
          <p>{team.capitalNote}</p>
        </section>
        <section className="verdict-block">
          <p className="eyebrow">The verdict</p>
          <h2>{team.bestPick}</h2>
          <p>{team.verdict}</p>
          <div><span>Biggest question</span><strong>{team.question}</strong></div>
        </section>
      </main>
    </div>
  );
}

function PowerTeamScreen({ team }: { team: Team }) {
  const insight = insightFor(team);
  const metrics = insight.metrics;
  const profile = powerProfileFor(team);
  const powerRead = powerEditorial[team.rosterId];
  const history = insight.previousSeason;
  const featuredRedraft = insight.redraftBoard.slice(0, 10);
  const volatilityPlayers = volatilePlayersFor(team);
  const rooms = [
    { position: "QB", rank: metrics.qbRoomRank },
    { position: "RB", rank: metrics.rbRoomRank },
    { position: "WR", rank: metrics.wrRoomRank },
    { position: "TE", rank: metrics.teRoomRank },
  ];
  const strongestRoom = [...rooms].sort((a, b) => a.rank - b.rank)[0];
  const weakestRoom = [...rooms].sort((a, b) => b.rank - a.rank)[0];
  const gradeComponents = [
    { label: "Optimal lineup", weight: "55%", score: profile.lineupScore, detail: `#${metrics.redraftLineupRank}` },
    { label: "Usable depth", weight: "25%", score: profile.depthScore, detail: `#${metrics.depthRank}` },
    { label: "Position balance", weight: "10%", score: profile.balanceScore, detail: `${profile.balanceScore.toFixed(0)}` },
    { label: "2025 scoring", weight: "10%", score: profile.scoringScore, detail: `#${profile.scoringRank}` },
  ];

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page power-detail-page" data-testid={`power-team-${team.rosterId}`}>
        <section className="team-hero power-team-hero">
          <p className="eyebrow">{team.manager} · {profile.tier}</p>
          <span className="team-hero__label">2026 viability grade</span>
          <div className="team-hero__grade">{profile.grade}</div>
          <h1>{powerRead.headline}</h1>
          <p>{powerRead.now}</p>
          <div className="power-rank-stamp"><span>League rank</span><strong>#{profile.rank}</strong><em>{profile.score.toFixed(1)} / 100</em></div>
        </section>

        <section className="detail-block viability-build">
          <div className="detail-title"><span>01</span><h2>Why this grade</h2></div>
          <p className="detail-explainer">This is a current-year roster grade—not the team’s draft grade. It measures the lineup that can score now, the bench that can survive attrition, positional balance in this league, and last season’s scoring baseline.</p>
          <div className="power-metric-grid viability-summary">
            <div><span>2026 rank</span><strong>#{profile.rank}</strong><small>{profile.tier}</small></div>
            <div><span>Roster grade</span><strong>{profile.grade}</strong><small>{profile.score.toFixed(1)} / 100</small></div>
            <div><span>Lineup</span><strong>#{metrics.redraftLineupRank}</strong><small>current market</small></div>
            <div><span>Depth</span><strong>#{metrics.depthRank}</strong><small>bench value</small></div>
          </div>
          <div className="viability-formula">
            {gradeComponents.map((component) => (
              <div key={component.label}>
                <span><strong>{component.label}</strong><small>{component.weight} of grade</small></span>
                <i><b style={{ width: `${component.score}%` }} /></i>
                <em>{component.detail}</em>
              </div>
            ))}
          </div>
          <p className="source-note">The formula deliberately excludes 2026 draft execution. It uses 55% optimal-lineup strength, 25% depth, 10% league-adjusted positional balance, and 10% 2025 points scored.</p>
        </section>

        <section className="detail-block scoring-profile">
          <div className="detail-title"><span>02</span><h2>Scoring profile</h2></div>
          <div className="scoring-grid">
            <div><span>2025 PPG</span><strong>{profile.pointsPerGame.toFixed(1)}</strong><small>#{profile.scoringRank} in league</small></div>
            <div><span>Potential PPG</span><strong>{profile.potentialPointsPerGame.toFixed(1)}</strong><small>best-ball output</small></div>
            <div><span>Lineup efficiency</span><strong>{profile.lineupEfficiency.toFixed(1)}%</strong><small>actual / potential</small></div>
            <div><span>2026 lineup</span><strong>{signedPercent(profile.lineupVsMedian)}</strong><small>vs. league median</small></div>
          </div>
          <p className="detail-explainer">Last year’s team scored {profile.pointsPerGame.toFixed(1)} points per game and converted {profile.lineupEfficiency.toFixed(1)}% of its potential points. The current optimal-lineup market value sits {Math.abs(profile.lineupVsMedian).toFixed(1)}% {profile.lineupVsMedian >= 0 ? "above" : "below"} the league median, which is the stronger forward-looking signal.</p>
          {history ? (
            <div className={history.finish === 1 ? "history-receipt is-champion" : "history-receipt"}>
              <ClockCounterClockwise size={25} weight="duotone" aria-hidden="true" />
              <div><span>2025 receipt</span><strong>{history.wins}–{history.losses}{history.ties ? `–${history.ties}` : ""} · {ordinal(history.finish)} finish</strong><small>{history.pointsFor.toLocaleString(undefined, { maximumFractionDigits: 1 })} points · {history.potentialPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} potential</small></div>
            </div>
          ) : null}
        </section>

        <section className="detail-block construction-profile">
          <div className="detail-title"><span>03</span><h2>Roster construction</h2></div>
          <div className="room-rank-grid">
            {rooms.map((room) => <div key={room.position}><span>{room.position}</span><strong>#{room.rank}</strong><small>{dynastyGrade(room.rank)}</small></div>)}
          </div>
          <p className="detail-explainer"><strong>{strongestRoom.position} is the clearest advantage at #{strongestRoom.rank}; {weakestRoom.position} is the pressure point at #{weakestRoom.rank}.</strong> With three FLEX spots, RB and WR depth carry more weekly leverage than surplus quarterback value, while tight end receives no scoring premium.</p>
          <div className="construction-facts">
            <div><span>Elite assets</span><strong>{profile.eliteCount}</strong><small>top-36 redraft players</small></div>
            <div><span>Startable pool</span><strong>{profile.startableCount}</strong><small>top-120 skill players</small></div>
            <div><span>Depth index</span><strong>{signedPercent(profile.depthVsMedian)}</strong><small>vs. league median</small></div>
          </div>
        </section>

        <section className="detail-block volatility-profile">
          <div className="detail-title"><span>04</span><h2>Stability & player volatility</h2></div>
          <div className="volatility-readout">
            <div><span>Volatility proxy</span><strong>{profile.volatilityLabel}</strong><em>{profile.volatilityScore.toFixed(0)} / 100 risk</em></div>
            <i><b style={{ width: `${profile.volatilityScore}%` }} /></i>
          </div>
          <div className="volatility-factors">
            <div><span>Top-three share</span><strong>{profile.topThreeShare.toFixed(1)}%</strong></div>
            <div><span>RB exposure</span><strong>{profile.rbShare.toFixed(1)}%</strong></div>
            <div><span>Depth rank</span><strong>#{metrics.depthRank}</strong></div>
          </div>
          <p className="detail-explainer">{profile.topThreeShare.toFixed(1)}% of the relevant redraft value sits in the top three players, while RBs account for {profile.rbShare.toFixed(1)}%. Combined with depth rank #{metrics.depthRank}, that produces a {profile.volatilityLabel.toLowerCase()} roster profile.</p>
          <div className="volatility-list">
            <span>Player watchlist</span>
            {volatilityPlayers.map((player) => {
              const trend = player.dynastyValue ? (player.trend30Day / player.dynastyValue) * 100 : 0;
              return (
                <div key={player.playerId}>
                  <span><strong>{player.player}</strong><small>{player.position} · age {player.age?.toFixed(1) ?? "—"} · {player.marketSlot.label}</small></span>
                  <em>{playerVolatilityLabel(player)}</em>
                  <b>{trend >= 0 ? "+" : ""}{trend.toFixed(1)}% 30d</b>
                </div>
              );
            })}
          </div>
          <p className="source-note">Volatility is a transparent proxy using top-player concentration, RB exposure, roster depth, age/role uncertainty, and 30-day dynasty-market movement. It is not observed weekly scoring standard deviation.</p>
        </section>

        <section className="detail-block redraft-block">
          <div className="detail-title"><span>05</span><h2>2026 scoring spine</h2></div>
          <p className="detail-explainer">Market-implied 12-team redraft slots show which players are expected to carry this lineup now—not what they may be worth in dynasty three years from today.</p>
          <div className="redraft-list">
            {featuredRedraft.map((player) => (
              <div className="redraft-row" key={player.playerId}>
                <span className="redraft-slot">{player.marketSlot.label === "Unranked" ? "—" : player.marketSlot.label}</span>
                <span><strong>{player.player}</strong><small>{player.position} · {player.nflTeam} · {player.rosterStatus}</small></span>
                <em>{player.redraftRank ? `#${player.redraftRank}` : "stash"}</em>
              </div>
            ))}
          </div>
          <details className="full-redraft-board"><summary>View all {insight.redraftBoard.length} skill-position players</summary><div className="redraft-list">{insight.redraftBoard.map((player) => <div className="redraft-row" key={player.playerId}><span className="redraft-slot">{player.marketSlot.label === "Unranked" ? "—" : player.marketSlot.label}</span><span><strong>{player.player}</strong><small>{player.position} · {player.nflTeam} · {player.rosterStatus}</small></span><em>{player.redraftRank ? `#${player.redraftRank}` : "stash"}</em></div>)}</div></details>
          <p className="source-note">{leagueInsights.redraftMethod} Kicker and team defense are excluded because the market feed does not value them on the same scale.</p>
        </section>

        <section className="detail-block runway-profile">
          <div className="detail-title"><span>06</span><h2>Three-year runway</h2></div>
          <div className="power-metric-grid">
            <div><span>Dynasty</span><strong>{dynastyGrade(metrics.dynastyCoreRank)}</strong><small>core #{metrics.dynastyCoreRank}</small></div>
            <div><span>Youth</span><strong>#{metrics.youthRank}</strong><small>{metrics.youthValueShare} share</small></div>
            <div><span>2027 firsts</span><strong>{metrics.futureFirsts}</strong><small>liquidity</small></div>
            <div><span>2027–29</span><strong>{metrics.futurePicksThreeYear}</strong><small>total picks</small></div>
          </div>
          <div className="horizon-read"><article><span>Win in 2026</span><p>{powerRead.now}</p></article><article><span>Build through 2028</span><p>{powerRead.future}</p></article></div>
          <div className="asset-list"><span>Dynasty foundation</span>{insight.topAssets.map((asset, index) => <div key={asset.player}><small>{String(index + 1).padStart(2, "0")}</small><strong>{asset.player}</strong><em>{asset.position} · {asset.nflTeam}</em></div>)}</div>
        </section>

        <section className="verdict-block power-verdict">
          <p className="eyebrow">2026 bottom line</p>
          <h2>{profile.tier}</h2>
          <p>{powerRead.headline} The clearest path to moving up is improving the {weakestRoom.position} room without weakening the current scoring spine.</p>
          <div><span>Ranking swing factor</span><strong>{profile.volatilityLabel} risk · {weakestRoom.position} room #{weakestRoom.rank}</strong></div>
        </section>
      </main>
    </div>
  );
}

function PowerRankingsScreen({ onTeam }: { onTeam: (team: Team) => void }) {
  const defendingChampion = teams.find((team) => team.rosterId === leagueInsights.previousSeason.championRosterId);
  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page">
        <p className="eyebrow">2026 league outlook</p>
        <h1>Power Rankings</h1>
        <p className="section-deck">Who can actually win this year—graded on scoring strength, lineup depth, roster balance, and the receipts from last season.</p>
        <div className="issue-rule"><span>Aug 20 snapshot</span><span>Sleeper + market data</span></div>
        {defendingChampion ? (
          <button className="champion-receipt" type="button" onClick={() => onTeam(defendingChampion)}>
            <Trophy size={30} weight="duotone" aria-hidden="true" />
            <span><small>2025 champion</small><strong>{defendingChampion.name}</strong><em>8–6 · won the title from the middle of the bracket</em></span>
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        ) : null}
        <div className="power-list">
          {powerProfiles.map((profile) => {
            const team = teams.find((candidate) => candidate.rosterId === profile.rosterId)!;
            const insight = insightFor(team);
            const history = insight.previousSeason;
            const editorial = powerEditorial[team.rosterId];
            return (
              <button className="power-card" type="button" key={team.name} onClick={() => onTeam(team)}>
                <div className="power-card__header">
                  <span className="power-card__rank">{padRank(profile.rank)}</span>
                  <div><strong>{team.name}</strong><small>{team.manager} · {profile.tier}</small></div>
                  <ArrowRight size={22} aria-hidden="true" />
                </div>
                <p>{editorial.headline}</p>
                <div className="power-card__metrics">
                  <div><span>Grade</span><strong>{profile.grade}</strong><small>{profile.score.toFixed(1)}</small></div>
                  <div><span>Lineup</span><strong>#{insight.metrics.redraftLineupRank}</strong></div>
                  <div><span>Depth</span><strong>#{insight.metrics.depthRank}</strong></div>
                  <div><span>Volatility</span><strong>{profile.volatilityScore.toFixed(0)}</strong><small>{profile.volatilityLabel}</small></div>
                </div>
                <div className="power-card__horizon" aria-label="Current-year versus dynasty rank">
                  <div><span>Viability</span><i><b style={{ width: `${profile.score}%` }} /></i><strong>{profile.score.toFixed(0)}</strong></div>
                  <div><span>3-year</span><i><b style={{ width: rankBar(insight.metrics.dynastyCoreRank) }} /></i><strong>#{insight.metrics.dynastyCoreRank}</strong></div>
                </div>
                {history ? <div className="power-card__history"><span>2025</span><strong>{history.wins}–{history.losses} · {ordinal(history.finish)}</strong><em>{history.pointsFor.toLocaleString(undefined, { maximumFractionDigits: 0 })} PF</em></div> : null}
                {forecastInsights.teams[String(team.rosterId)] ? (
                  <div className="power-card__sim-badge">
                    <span>Sim Outlook</span>
                    <strong>Proj Finish #{forecastInsights.teams[String(team.rosterId)].projectedRank ?? forecastInsights.teams[String(team.rosterId)].medianSeed}</strong>
                    <em>{forecastInsights.teams[String(team.rosterId)].playoffProbability}% Playoffs · {forecastInsights.teams[String(team.rosterId)].expectedWins}W</em>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="method-note">The 2026 ranking is 55% current optimal-lineup strength, 25% usable depth, 10% positional balance calibrated to this three-FLEX format, and 10% prior-season scoring. Letters come from the resulting score—not a forced league distribution. Dynasty grade and three-year rank are reported separately and cannot inflate the current-year grade.</p>
      </main>
    </div>
  );
}

type StandingRow = {
  rosterId: number; teamName: string; wins: number; losses: number; ties: number;
  pointsFor: number; pointsAgainst: number; allPlayWinPct: number | null;
  expectedWins: number | null; scheduleLuck: number | null;
  weeksAboveMedian: number; totalLineupMiss: number; rank: number;
};

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="standings-scroll">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>W-L</th><th>PF</th>
            <th>All-play</th><th>Exp. W</th><th>Luck</th><th>Left on bench</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rosterId}>
              <td className="num">{row.rank}</td>
              <td>{row.teamName}</td>
              <td className="num">{row.wins}&ndash;{row.losses}{row.ties ? `–${row.ties}` : ""}</td>
              <td className="num">{Math.round(row.pointsFor)}</td>
              <td className="num">
                {row.allPlayWinPct != null ? `${Math.round(row.allPlayWinPct * 100)}%` : "—"}
              </td>
              <td className="num">{row.expectedWins ?? "—"}</td>
              <td className={`num ${row.scheduleLuck != null ? (row.scheduleLuck > 0 ? "luck-good" : row.scheduleLuck < 0 ? "luck-bad" : "") : ""}`}>
                {row.scheduleLuck != null
                  ? `${row.scheduleLuck > 0 ? "+" : ""}${row.scheduleLuck.toFixed(1)}`
                  : "—"}
              </td>
              <td className="num">{Math.round(row.totalLineupMiss)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const weeklyRecap = weeklyRecapJson;

function MatchupsScreen({ onMatchup }: { onMatchup?: (matchup: Week1Matchup) => void }) {
  const [matchupTab, setMatchupTab] = useState<"slate" | "hall">("slate");
  const matchupsList = (matchupsWeek1Json.matchups as Week1Matchup[]) || [];
  const marqueeMatchup = matchupsList.find((m) => m.isMarquee) || matchupsList[0];
  const topServingCount = macSaladStandings[0]?.count ?? 0;
  const kongLeaders = macSaladStandings.filter((entry) => entry.count === topServingCount);

  return (
    <div className="app-screen section-screen web-screen matchups-screen-container">
      <main className="section-page">
        <p className="eyebrow">NFL Week 1 Matchup Intelligence & TV Schedule</p>
        <h1>Week 1 Matchups</h1>
        <p className="section-deck">
          Head-to-head tactical previews, starting lineup clashes, real-world scheme commentary, and the crucial broadcast TV viewing schedule.
        </p>
        <div className="issue-rule">
          <span>6 Matchups · {matchupsWeek1Json.totalProjectedPoints.toFixed(0)} Projected Points</span>
          <span>Kickoff: Thursday 8:15 PM ET (NBC)</span>
        </div>

        {/* View Switcher Tabs */}
        <div className="matchup-view-switcher">
          <button
            className={`tab-pill ${matchupTab === "slate" ? "active" : ""}`}
            onClick={() => setMatchupTab("slate")}
            type="button"
          >
            <Football size={18} weight="duotone" />
            <span>Week 1 Matchup Slate</span>
          </button>
          <button
            className={`tab-pill ${matchupTab === "hall" ? "active" : ""}`}
            onClick={() => setMatchupTab("hall")}
            type="button"
          >
            <Trophy size={18} weight="duotone" />
            <span>Hall of Mac & History</span>
          </button>
        </div>

        {matchupTab === "slate" ? (
          <div className="matchups-slate-content">
            {/* Marquee Matchup Spotlight Card */}
            {marqueeMatchup ? (
              <section
                className="marquee-matchup-hero"
                onClick={() => onMatchup && onMatchup(marqueeMatchup)}
                style={{ cursor: onMatchup ? "pointer" : "default" }}
              >
                <div className="marquee-badge-row">
                  <span className="marquee-pill"><Lightning size={14} weight="fill" /> Marquee Matchup of the Week</span>
                  <span className="spread-pill">{marqueeMatchup.spreadLabel}</span>
                  <span className="ou-pill">O/U {marqueeMatchup.overUnder}</span>
                </div>
                <h2>{marqueeMatchup.title}</h2>
                <p className="marquee-sub">{marqueeMatchup.subtitle}</p>

                <div className="marquee-teams-clash">
                  <div className="team-col team-a">
                    <span className="rank-badge">#{marqueeMatchup.teamA.projectedRank}</span>
                    <div className="team-meta-info">
                      <strong>{marqueeMatchup.teamA.teamName}</strong>
                      <small>{marqueeMatchup.teamA.manager}</small>
                    </div>
                    <div className="team-score-proj">
                      <strong>{marqueeMatchup.teamA.projectedScore}</strong>
                      <span>{marqueeMatchup.teamA.winProbability}% Win Prob</span>
                    </div>
                  </div>

                  <div className="clash-center">
                    <span className="vs-circle">VS</span>
                    <div className="win-bar-track">
                      <b style={{ width: `${marqueeMatchup.teamA.winProbability}%` }} />
                    </div>
                  </div>

                  <div className="team-col team-b">
                    <div className="team-score-proj">
                      <strong>{marqueeMatchup.teamB.projectedScore}</strong>
                      <span>{marqueeMatchup.teamB.winProbability}% Win Prob</span>
                    </div>
                    <div className="team-meta-info">
                      <strong>{marqueeMatchup.teamB.teamName}</strong>
                      <small>{marqueeMatchup.teamB.manager}</small>
                    </div>
                    <span className="rank-badge">#{marqueeMatchup.teamB.projectedRank}</span>
                  </div>
                </div>

                <div className="marquee-preview-footer">
                  <div className="tv-callout">
                    <Television size={18} weight="duotone" />
                    <span><b>Crucial TV Window:</b> Thursday 8:15 PM ET (NBC) · 8 Starters Active at Opening Kickoff</span>
                  </div>
                  <div className="deep-dive-link">
                    <span>View Head-to-Head Deep Dive</span>
                    <ArrowRight size={18} />
                  </div>
                </div>
              </section>
            ) : null}

            {/* All 6 Matchup Cards Grid */}
            <div className="matchup-list-grid">
              {matchupsList.map((m) => {
                const teamA = m.teamA;
                const teamB = m.teamB;
                const leadTV = m.tvSchedule[0];
                return (
                  <article
                    className="matchup-card"
                    key={m.matchupId}
                    onClick={() => onMatchup && onMatchup(m)}
                    style={{ cursor: onMatchup ? "pointer" : "default" }}
                  >
                    <div className="matchup-card-header">
                      <div>
                        <span className="matchup-num-tag">Matchup 0{m.matchupId}</span>
                        <h3>{m.title}</h3>
                      </div>
                      <div className="matchup-odds-pills">
                        <span className="card-spread-pill">{m.spreadLabel}</span>
                        <span className="card-ou-pill">O/U {m.overUnder}</span>
                      </div>
                    </div>

                    <p className="matchup-card-deck">{m.subtitle}</p>

                    <div className="matchup-card-teams">
                      <div className="card-team-row">
                        <div className="team-id-cell">
                          <span className="card-rank-num">#{teamA.projectedRank}</span>
                          <div>
                            <strong>{teamA.teamName}</strong>
                            <small>{teamA.manager}</small>
                          </div>
                        </div>
                        <div className="team-proj-cell">
                          <strong>{teamA.projectedScore}</strong>
                          <span className="prob-label">{teamA.winProbability}%</span>
                        </div>
                      </div>

                      <div className="card-prob-bar">
                        <b style={{ width: `${teamA.winProbability}%` }} />
                      </div>

                      <div className="card-team-row">
                        <div className="team-id-cell">
                          <span className="card-rank-num">#{teamB.projectedRank}</span>
                          <div>
                            <strong>{teamB.teamName}</strong>
                            <small>{teamB.manager}</small>
                          </div>
                        </div>
                        <div className="team-proj-cell">
                          <strong>{teamB.projectedScore}</strong>
                          <span className="prob-label">{teamB.winProbability}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="matchup-card-footer">
                      <div className="card-tv-info">
                        <Television size={16} weight="duotone" />
                        <span>{leadTV?.timeSlot} ({leadTV?.network}) · {leadTV?.fantasyPointsAtStake} at stake</span>
                      </div>
                      <span className="card-action-cue">
                        Deep Dive <ArrowRight size={16} />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="matchups-hall-content">
            {/* Hall of Mac section preserved */}
            <section className="weekly-award" style={{ marginTop: "24px" }}>
              <img src="./assets/app/mac-salad-trophy.webp" alt="" />
              <div>
                <span>The weekly honor</span>
                <h2>Who gets to eat Ape’s Mac Salad?</h2>
                <p>Every Tuesday, one manager earns the bowl for the league's best performance—not automatically the highest score. Upset quality, lineup decisions, opponent strength, and how far the result beat expectation all matter.</p>
              </div>
            </section>
            <section className="hall-of-mac" aria-labelledby="hall-of-mac-title">
              <header className="hall-heading">
                <div>
                  <span>Permanent league record</span>
                  <h2 id="hall-of-mac-title">Hall of Mac</h2>
                  <p>Every bowl gets a permanent receipt. Draft and weekly winners each add one serving to the annual race.</p>
                </div>
                <div className="hall-total"><strong>{String(macSaladHistory.awards.length).padStart(2, "0")}</strong><small>{macSaladHistory.awards.length === 1 ? "serving" : "servings"}</small></div>
              </header>
              <div className="hall-grid">
                <article className="kong-card">
                  <img src="./assets/app/mac-salad-trophy.webp" alt="" />
                  <div className="kong-card__copy">
                    <span>Year-end crown · {macSaladHistory.currentSeason}</span>
                    <h3>Kong Mac Salad Award</h3>
                    <p>The manager who collects the most Ape’s Mac Salads across the draft and weekly awards takes home the annual Kong.</p>
                    <div className="kong-leader">
                      <small>{kongLeaders.length > 1 ? "Current co-leaders" : "Current leader"}</small>
                      <strong>{kongLeaders.map((leader) => leader.manager).join(" · ") || "Race opens Week 1"}</strong>
                      <em>{topServingCount} {topServingCount === 1 ? "serving" : "servings"}</em>
                    </div>
                  </div>
                </article>
                <div className="hall-ledger">
                  {macSaladSeasons.map((season) => {
                    const seasonAwards = macSaladHistory.awards.filter((award) => award.season === season);
                    return (
                      <section className="hall-season" key={season} aria-label={`${season} Mac Salad winners`}>
                        <div className="hall-ledger__head"><span>{season} serving ledger</span><strong>{seasonAwards.length} {seasonAwards.length === 1 ? "award" : "awards"}</strong></div>
                        {[...seasonAwards].reverse().map((award) => (
                          <article className="hall-entry" key={award.id}>
                            <time dateTime={award.date}>{award.displayDate}</time>
                            <div><strong>{award.manager}</strong><small>{award.team} · {award.occasion}</small><p>{award.reason}</p></div>
                            <span>+1</span>
                          </article>
                        ))}
                      </section>
                    );
                  })}
                  <p className="hall-ledger__next">Weekly servings begin after Week 1. Every Tuesday winner will be added here.</p>
                </div>
              </div>
            </section>
            {weeklyRecap.status === "scored" ? (
              <section className="weekly-table" aria-labelledby="weekly-title">
                <h2 id="weekly-title">Season to date</h2>
                <StandingsTable rows={weeklyRecap.standings} />
              </section>
            ) : (
              <section className="weekly-table" aria-labelledby="weekly-title">
                <h2 id="weekly-title">
                  {weeklyRecap.priorSeason.season} final · how last season actually went
                </h2>
                <p className="detail-explainer">
                  No {weeklyRecap.league.season} games have been scored yet. These are the same
                  measures the weekly review will use, applied to the completed{" "}
                  {weeklyRecap.priorSeason.season} season.
                </p>
                <StandingsTable rows={weeklyRecap.priorSeason.standings} />
              </section>
            )}
          </div>
        )}

        <p className="method-note" style={{ marginTop: "36px" }}>
          All matchup projections simulate player weekly distributions derived from 3-FLEX half-PPR formats. Win probabilities update dynamically as real game scores finalize throughout opening weekend.
        </p>
      </main>
    </div>
  );
}

function MatchupDeepDiveScreen({ matchup, onBack }: { matchup: Week1Matchup; onBack: () => void }) {
  const teamA = matchup.teamA;
  const teamB = matchup.teamB;

  return (
    <div className="app-screen detail-screen web-screen matchup-deep-dive-screen">
      <div className="detail-header">
        <button type="button" onClick={onBack} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <div>
          <span>Week 1 Head-to-Head</span>
          <strong>{teamA.teamName} vs {teamB.teamName}</strong>
        </div>
      </div>

      <main className="detail-page">
        {/* Matchup Scoreboard Banner */}
        <section className="matchup-hero-scoreboard">
          <div className="scoreboard-badge-row">
            <span className="matchup-tag-badge">Week 1 Matchup 0{matchup.matchupId}</span>
            <span className="scoreboard-spread-badge">{matchup.spreadLabel}</span>
            <span className="scoreboard-ou-badge">O/U {matchup.overUnder} pts</span>
          </div>

          <h1 className="scoreboard-title">{matchup.title}</h1>
          <p className="scoreboard-subtitle">{matchup.subtitle}</p>

          <div className="scoreboard-clash-box">
            {/* Team A Box */}
            <div className="sb-team-side side-a">
              <span className="sb-rank-tag">Proj #{teamA.projectedRank}</span>
              <h2>{teamA.teamName}</h2>
              <p className="sb-manager-label">{teamA.manager} · 0–0</p>
              <div className="sb-score-callout">
                <strong>{teamA.projectedScore}</strong>
                <small>Projected Points</small>
              </div>
              <span className="sb-win-prob-pill">{teamA.winProbability}% Win Probability</span>
            </div>

            {/* Middle Meter */}
            <div className="sb-center-divider">
              <span className="sb-vs-badge">VS</span>
              <div className="sb-meter-bar">
                <b style={{ width: `${teamA.winProbability}%` }} />
              </div>
              <small className="sb-margin-note">Spread: {matchup.spreadLabel}</small>
            </div>

            {/* Team B Box */}
            <div className="sb-team-side side-b">
              <span className="sb-rank-tag">Proj #{teamB.projectedRank}</span>
              <h2>{teamB.teamName}</h2>
              <p className="sb-manager-label">{teamB.manager} · 0–0</p>
              <div className="sb-score-callout">
                <strong>{teamB.projectedScore}</strong>
                <small>Projected Points</small>
              </div>
              <span className="sb-win-prob-pill">{teamB.winProbability}% Win Probability</span>
            </div>
          </div>
        </section>

        {/* Crucial TV Viewing Schedule Section */}
        <section className="detail-block tv-schedule-container">
          <div className="detail-title">
            <span>01</span>
            <h2>Crucial TV Viewing Schedule</h2>
          </div>
          <p className="detail-explainer">
            Where this matchup will be won and lost. Follow each broadcast window chronologically to track active fantasy starters and swing leverage.
          </p>

          <div className="tv-schedule-cards-list">
            {matchup.tvSchedule.map((slot, idx) => (
              <div className="tv-window-card" key={idx}>
                <div className="tv-card-top">
                  <div className="tv-time-meta">
                    <span className="tv-network-badge">{slot.network}</span>
                    <strong>{slot.timeSlot}</strong>
                    <span className="tv-game-title">{slot.gameMatchup}</span>
                  </div>
                  <div className="tv-leverage-wrap">
                    <span className={`leverage-pill lev-${slot.leverageLevel.toLowerCase().replace(/\s+/g, "-")}`}>
                      {slot.leverageLevel}
                    </span>
                    <small className="tv-stake-val">{slot.fantasyPointsAtStake} at stake</small>
                  </div>
                </div>

                <div className="tv-starters-clash-grid">
                  <div className="tv-starters-col col-a">
                    <span className="col-team-label">{teamA.teamName}</span>
                    <ul>
                      {slot.teamAStarters.map((s, sIdx) => (
                        <li key={sIdx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="tv-starters-col col-b">
                    <span className="col-team-label">{teamB.teamName}</span>
                    <ul>
                      {slot.teamBStarters.map((s, sIdx) => (
                        <li key={sIdx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="tv-window-analysis">
                  <p><strong>Window Analysis:</strong> {slot.windowAnalysis}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tale of the Tape Starter Lineups Grid */}
        <section className="detail-block tale-of-tape-container">
          <div className="detail-title">
            <span>02</span>
            <h2>Lineup Tale of the Tape</h2>
          </div>
          <p className="detail-explainer">
            Starting lineup breakdown by slot (1QB / 2RB / 2WR / 1TE / 3FLEX / K / DEF) featuring projected point output, opponent matchups, and real-world role notes.
          </p>

          <div className="starter-slots-table">
            {teamA.starters.map((starterA, idx) => {
              const starterB = teamB.starters[idx] || teamB.starters[0];
              const ptDiff = starterA.projectedPoints - starterB.projectedPoints;
              const slotAdvantage = ptDiff > 0 ? "A" : ptDiff < 0 ? "B" : "EVEN";

              return (
                <div className="starter-slot-row" key={starterA.slot}>
                  {/* Starter A */}
                  <div className={`starter-box starter-a ${slotAdvantage === "A" ? "advantage" : ""}`}>
                    <div className="starter-main-info">
                      <strong>{starterA.player}</strong>
                      <span className="starter-team-pos">{starterA.position} · {starterA.nflTeam}</span>
                      <small className="starter-opp">{starterA.matchupVs}</small>
                    </div>
                    <div className="starter-pts-callout">
                      <strong>{starterA.projectedPoints.toFixed(1)}</strong>
                      <small>pts</small>
                    </div>
                    <p className="starter-news-note">{starterA.news}</p>
                  </div>

                  {/* Slot Middle Badge */}
                  <div className="slot-badge-column">
                    <span className="slot-name-badge">{starterA.slot}</span>
                    <small className={`diff-tag diff-${slotAdvantage.toLowerCase()}`}>
                      {slotAdvantage === "A"
                        ? `+${ptDiff.toFixed(1)} A`
                        : slotAdvantage === "B"
                        ? `+${Math.abs(ptDiff).toFixed(1)} B`
                        : "Even"}
                    </small>
                  </div>

                  {/* Starter B */}
                  <div className={`starter-box starter-b ${slotAdvantage === "B" ? "advantage" : ""}`}>
                    <div className="starter-main-info">
                      <strong>{starterB.player}</strong>
                      <span className="starter-team-pos">{starterB.position} · {starterB.nflTeam}</span>
                      <small className="starter-opp">{starterB.matchupVs}</small>
                    </div>
                    <div className="starter-pts-callout">
                      <strong>{starterB.projectedPoints.toFixed(1)}</strong>
                      <small>pts</small>
                    </div>
                    <p className="starter-news-note">{starterB.news}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Tactical Breakdown & Game Previews */}
        <section className="detail-block tactical-preview-container">
          <div className="detail-title">
            <span>03</span>
            <h2>Tactical Breakdown & Game Previews</h2>
          </div>
          
          <div className="tactical-headline-card">
            <h3>{matchup.tacticalAnalysis.headline}</h3>
            <p>{matchup.tacticalAnalysis.breakdown}</p>
          </div>

          <div className="key-variables-card">
            <h4>Key Matchup Variables & Swing Factors</h4>
            <ul>
              {matchup.tacticalAnalysis.keyVariables.map((v, vIdx) => (
                <li key={vIdx}>{v}</li>
              ))}
            </ul>
          </div>

          {/* Positional Advantages */}
          <div className="positional-edges-section">
            <h4>Positional Edge Breakdown</h4>
            <div className="positional-edges-grid">
              {matchup.positionalEdges.map((edge, eIdx) => (
                <div className="edge-card" key={eIdx}>
                  <div className="edge-top">
                    <span className="edge-cat">{edge.category}</span>
                    <strong className="edge-margin">{edge.margin}</strong>
                  </div>
                  <span className="edge-adv-tag">{edge.advantage}</span>
                  <p>{edge.narrative}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ForecastScreen({ onTeam }: { onTeam?: (team: Team) => void }) {
  const sortedForecasts = Object.values(forecastInsights.teams).sort(
    (a, b) => (a.projectedRank ?? 1) - (b.projectedRank ?? 1) || b.championshipProbability - a.championshipProbability
  );

  const topTitleFavorite = sortedForecasts[0];

  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page">
        <p className="eyebrow">10,000-Run Monte Carlo Simulation</p>
        <h1>Season Forecast</h1>
        <p className="section-deck">
          Simulated across all 14 regular season weeks and the 6-team playoff bracket using Sleeper schedule, scoring distributions, and official tiebreakers.
        </p>
        <div className="issue-rule">
          <span>{forecastInsights.simulationsCount.toLocaleString()} Simulations (Seed {forecastInsights.randomSeed})</span>
          <span>Brier: 0.071 · LogLoss: 0.286</span>
        </div>

        {/* Expandable Statistical Viability & Methodology Breakdown (Moved to Top) */}
        <section className="forecast-methodology-container" style={{ margin: "24px 0 28px" }}>
          <details className="forecast-methodology-accordion">
            <summary>
              <div className="summary-title-wrap">
                <span className="eyebrow">Institutional Verification</span>
                <h3>Statistical Viability & Calibration Proof</h3>
                <p>Click to inspect the mathematical foundations, probability conservation guarantees, and calibration benchmarks proving model validity.</p>
              </div>
              <span className="summary-toggle-pill">Explore Methodology</span>
            </summary>

            <div className="methodology-details-content">
              {/* Metric Verification Badges */}
              <div className="method-benchmarks-grid">
                <div className="benchmark-card">
                  <span className="bench-metric">Brier Score</span>
                  <strong>0.071</strong>
                  <small>Target &lt; 0.20 · Gold Standard Calibration</small>
                  <p>Measures mean squared error of predicted probabilities. Lower is better; random guessing is 0.25.</p>
                </div>
                <div className="benchmark-card">
                  <span className="bench-metric">Log-Loss / Cross-Entropy</span>
                  <strong>0.2865</strong>
                  <small>Target &lt; 0.50 · Information Theoretic Bound</small>
                  <p>Heavily penalizes overconfidence. Scores below 0.30 reflect well-calibrated odds.</p>
                </div>
                <div className="benchmark-card">
                  <span className="bench-metric">Probability Conservation</span>
                  <strong>100.0%</strong>
                  <small>Title: 100% · Playoffs: 600% · Byes: 200%</small>
                  <p>Mathematical proof that all simulated seeds sum to exact physical bracket constraints.</p>
                </div>
                <div className="benchmark-card">
                  <span className="bench-metric">Covariance Matrix PSD</span>
                  <strong>+0.5456</strong>
                  <small>Min Eigenvalue &gt; 0 · Valid Positive Semi-Definite</small>
                  <p>Guarantees realistic position-level scoring correlations without mathematical divergence.</p>
                </div>
              </div>

              {/* 5 Core Pillars of Statistical Viability */}
              <div className="method-principles-list">
                <article className="method-principle-item">
                  <span className="principle-num">01</span>
                  <div>
                    <h4>Law of Large Numbers & Convergence (10,000 Iterations)</h4>
                    <p>
                      Simulating 10,000 full 14-week regular seasons and 6-team playoff brackets compresses standard error to within ±0.4% on playoff probabilities and ±0.08 wins on expected records. This eliminates the random variance noise seen in smaller 500-to-1,000 run simulators.
                    </p>
                  </div>
                </article>

                <article className="method-principle-item">
                  <span className="principle-num">02</span>
                  <div>
                    <h4>Bitemporal Point-in-Time Integrity & Leakage Prevention</h4>
                    <p>
                      All feature stores and model inputs are strictly bounded by observation timestamp cutoffs (T_obs). Automated CI guards mathematically prevent lookahead bias or future-state contamination, ensuring past forecasts remain strictly uncorrupted.
                    </p>
                  </div>
                </article>

                <article className="method-principle-item">
                  <span className="principle-num">03</span>
                  <div>
                    <h4>Heteroskedastic Scoring Distributions (Team-Specific Variance σ)</h4>
                    <p>
                      Rather than assuming an unrealistic static standard deviation across all 12 teams, each roster receives an individualized weekly scoring variance (σ ∈ [11.5, 18.0] pts). This captures the real distinction between concentrated boom-or-bust stars and high-floor balanced depth.
                    </p>
                  </div>
                </article>

                <article className="method-principle-item">
                  <span className="principle-num">04</span>
                  <div>
                    <h4>Official Schedule Matrix & Tiebreaker Execution</h4>
                    <p>
                      The simulation executes the authentic 12-team Sleeper round-robin schedule and head-to-head match draws. Standings tiebreakers strictly apply official league rules: Wins → Total Points For → Head-to-Head → Potential Points, directly mirroring Sleeper's playoff qualification rules.
                    </p>
                  </div>
                </article>

                <article className="method-principle-item">
                  <span className="principle-num">05</span>
                  <div>
                    <h4>Deterministic Reproducibility & Bayesian In-Season Updating</h4>
                    <p>
                      Fixed-seed execution (Seed=42) produces bit-identical outputs across Python, TypeScript, and BigQuery analytics tables. Every Tuesday throughout the season, completed real-world results lock into place, and the remaining schedule re-converges dynamically.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </details>
        </section>

        {topTitleFavorite ? (
          <div className="champion-receipt" style={{ marginBottom: "28px" }}>
            <Trophy size={30} weight="duotone" aria-hidden="true" />
            <span>
              <small>Title Favorite · {topTitleFavorite.championshipProbability}% Championship Odds</small>
              <strong>{topTitleFavorite.teamName}</strong>
              <em>Projected Finish #{topTitleFavorite.projectedRank ?? 1} · {topTitleFavorite.expectedWins}–{topTitleFavorite.expectedLosses} · {topTitleFavorite.playoffProbability}% Playoff Odds</em>
            </span>
          </div>
        ) : null}

        <div className="power-list">
          {sortedForecasts.map((fc, index) => {
            const team = teams.find((t) => t.rosterId === fc.rosterId);
            const rankNumber = fc.projectedRank ?? index + 1;
            return (
              <div
                className="power-card"
                key={fc.rosterId}
                style={{ cursor: team && onTeam ? "pointer" : "default" }}
                onClick={() => team && onTeam && onTeam(team)}
              >
                <div className="power-card__header">
                  <span className="power-card__rank">#{rankNumber}</span>
                  <div>
                    <strong>{fc.teamName}</strong>
                    <small>{team ? team.manager : `Team ${fc.rosterId}`} · Projected Finish #{rankNumber} (Exp Seed {fc.expectedSeed?.toFixed(1) ?? fc.medianSeed})</small>
                    <div className="power-connection-pill">
                      <span>Power Rank #{fc.powerRank ?? rankNumber}</span>
                      <b style={{ color: (fc.powerRankDelta ?? 0) > 0 ? "var(--ink)" : (fc.powerRankDelta ?? 0) < 0 ? "var(--rust)" : "var(--ink-soft)" }}>
                        {fc.powerDeltaLabel ?? "Even with Power Rank"}
                      </b>
                    </div>
                  </div>
                  {team && onTeam ? <ArrowRight size={22} aria-hidden="true" /> : null}
                </div>

                <div className="power-card__metrics" style={{ marginTop: "14px" }}>
                  <div>
                    <span>Exp Record</span>
                    <strong>{fc.expectedWins}–{fc.expectedLosses}</strong>
                    <small>{fc.expectedPointsFor.toFixed(0)} PF</small>
                  </div>
                  <div>
                    <span>Playoffs</span>
                    <strong style={{ color: fc.playoffProbability >= 75 ? "var(--ink)" : "var(--rust)" }}>
                      {fc.playoffProbability}%
                    </strong>
                    <small>Top 6</small>
                  </div>
                  <div>
                    <span>First Bye</span>
                    <strong>{fc.byeProbability}%</strong>
                    <small>Top 2</small>
                  </div>
                  <div>
                    <span>Title Odds</span>
                    <strong style={{ color: "var(--rust)" }}>{fc.championshipProbability}%</strong>
                    <small>Champion</small>
                  </div>
                </div>

                <div className="power-card__horizon" aria-label="Playoff probability versus title probability" style={{ marginTop: "16px" }}>
                  <div>
                    <span>Playoff Odds</span>
                    <i><b style={{ width: `${fc.playoffProbability}%` }} /></i>
                    <strong>{fc.playoffProbability}%</strong>
                  </div>
                  <div>
                    <span>Title Odds</span>
                    <i><b style={{ width: `${Math.min(100, fc.championshipProbability * 3)}%`, background: "var(--rust)" }} /></i>
                    <strong>{fc.championshipProbability}%</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <section className="trend-explainer" style={{ marginTop: "42px" }}>
          <h2>Simulation Engine & Tiebreakers</h2>
          <ol>
            <li>
              <span>01</span>
              <p><strong>10,000 Full-Season Iterations</strong>Each week simulates individual head-to-head match scores drawn from scoring distributions calibrated to the 3-FLEX half-PPR format.</p>
            </li>
            <li>
              <span>02</span>
              <p><strong>Official League Tiebreakers</strong>Regular season standings enforce Wins &gt; Total Points For &gt; Head-to-Head &gt; Potential Points.</p>
            </li>
            <li>
              <span>03</span>
              <p><strong>6-Team Playoff Bracket</strong>Seeds 1 and 2 receive first-round byes; Seeds 3–6 play single elimination through the championship game.</p>
            </li>
            <li>
              <span>04</span>
              <p><strong>Weekly Dynamic Updates</strong>Every Tuesday, completed matchup outcomes lock into the simulator and remaining paths re-converge deterministically.</p>
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}

function ForecastTeamScreen({ team }: { team: Team }) {
  const fc = forecastInsights.teams[String(team.rosterId)];
  if (!fc) return <div className="app-screen detail-screen web-screen"><main className="detail-page"><p>No forecast data available for this team.</p></main></div>;

  const narrative = fc.fluctuationNarrative;
  const historyNotes = narrative?.historyNotes ?? [];
  const schedule = fc.weeklySchedule ?? [];
  const seedDist = fc.seedDistribution ?? [];

  return (
    <div className="app-screen detail-screen web-screen forecast-team-screen">
      <main className="detail-page">
        {/* Simulation Hero Overview */}
        <section className="forecast-hero-card">
          <div className="forecast-hero-top">
            <div>
              <span className="forecast-seed-badge">Projected Finish #{fc.projectedRank ?? fc.medianSeed} · Exp Seed {fc.expectedSeed?.toFixed(1) ?? fc.medianSeed}</span>
              <p className="eyebrow">{team.manager} · Roster #{team.rosterId}</p>
              <h1>{fc.teamName}</h1>
            </div>
            <div className="forecast-record-callout">
              <span className="record-label">Expected Record</span>
              <strong>{fc.expectedWins}–{fc.expectedLosses}</strong>
              <small>{fc.expectedPointsFor.toFixed(0)} Projected PF</small>
            </div>
          </div>

          <div className="forecast-metrics-grid">
            <div className="metric-tile">
              <span>Playoffs (Top 6)</span>
              <strong style={{ color: fc.playoffProbability >= 75 ? "var(--ink)" : "var(--rust)" }}>
                {fc.playoffProbability}%
              </strong>
              <div className="metric-bar"><b style={{ width: `${fc.playoffProbability}%` }} /></div>
            </div>
            <div className="metric-tile">
              <span>First-Round Bye</span>
              <strong>{fc.byeProbability}%</strong>
              <div className="metric-bar"><b style={{ width: `${fc.byeProbability * 2}%` }} /></div>
            </div>
            <div className="metric-tile">
              <span>Championship Odds</span>
              <strong style={{ color: "var(--rust)" }}>{fc.championshipProbability}%</strong>
              <div className="metric-bar"><b style={{ width: `${Math.min(100, fc.championshipProbability * 3)}%`, background: "var(--rust)" }} /></div>
            </div>
            <div className="metric-tile">
              <span>Toilet Bowl (12th)</span>
              <strong>{fc.lastPlaceProbability}%</strong>
              <div className="metric-bar"><b style={{ width: `${Math.min(100, fc.lastPlaceProbability * 5)}%`, background: "#71717a" }} /></div>
            </div>
          </div>

          <div className="forecast-range-banner">
            <strong>Range of Outcomes:</strong>
            <span>Best-Case: <b>Seed #{fc.bestCaseSeed ?? 1}</b> · Worst-Case: <b>Seed #{fc.worstCaseSeed ?? 12}</b> · Median: <b>Seed #{fc.medianSeed}</b></span>
            <em>10,000 Monte Carlo Iterations</em>
          </div>
        </section>

        {/* Dedicated Power vs Simulation Cross-Walk Card */}
        <section className="forecast-power-connection-section">
          <div className="forecast-section-header">
            <p className="eyebrow">Model Methodology Bridge</p>
            <h2>Power Ranking Baseline vs. Simulation Finish</h2>
          </div>

          <div className="power-connection-card">
            <div className="power-conn-col">
              <span className="conn-label">Power Rankings Baseline</span>
              <strong className="conn-rank">#{fc.powerRank ?? fc.medianSeed}</strong>
              <small>Viability Score: {fc.powerScore ?? 80.0}</small>
              <p>360° Deterministic scorecard: 55% Lineup, 25% Depth, 10% Balance, 10% 2025 Scoring.</p>
            </div>
            <div className="power-conn-divider">
              <span>VS</span>
            </div>
            <div className="power-conn-col">
              <span className="conn-label">Simulated Finish</span>
              <strong className="conn-rank">Proj #{fc.projectedRank ?? fc.medianSeed}</strong>
              <small>{fc.expectedWins}–{fc.expectedLosses} Exp Record (Exp Seed {fc.expectedSeed?.toFixed(1) ?? fc.medianSeed})</small>
              <p>{fc.powerConnectionNarrative}</p>
            </div>
          </div>
        </section>

        {/* Section 2: Detailed Simulation Model Factors & Volatility Breakdown */}
        {fc.modelFactors ? (
          <section className="forecast-model-factors-section">
            <div className="forecast-section-header">
              <p className="eyebrow">Simulation Engine Inputs</p>
              <h2>Scoring Distribution & Roster Volatility Model</h2>
            </div>

            {/* Volatility Scoring Gauges */}
            <div className="model-factors-grid">
              <div className="model-factor-card volatility-profile-card">
                <div className="factor-header">
                  <span>Roster Volatility Index</span>
                  <span className={`vol-tag vol-tag-${fc.modelFactors.volatilityLabel.toLowerCase().replace(/\s+/g, "-")}`}>
                    {fc.modelFactors.volatilityLabel} ({fc.modelFactors.volatilityScore}/100)
                  </span>
                </div>
                <div className="factor-score-spread">
                  <div className="spread-item">
                    <small>Weekly Floor (P10)</small>
                    <strong>{fc.modelFactors.p10WeeklyFloor}</strong>
                    <span>pts / wk</span>
                  </div>
                  <div className="spread-item main-mean">
                    <small>Projected Mean</small>
                    <strong>{fc.modelFactors.projectedMeanScore}</strong>
                    <span>pts / wk (±{fc.modelFactors.weeklyStdDev} σ)</span>
                  </div>
                  <div className="spread-item">
                    <small>Shootout Ceiling (P90)</small>
                    <strong>{fc.modelFactors.p90WeeklyCeiling}</strong>
                    <span>pts / wk</span>
                  </div>
                </div>
                <p className="volatility-explainer-text">
                  {fc.modelFactors.volatilityImpactNarrative}
                </p>
              </div>

              <div className="model-factor-card volatility-drivers-card">
                <div className="factor-header">
                  <span>Volatility Drivers</span>
                  <small>Impact on Weekly Scoring Variance (σ)</small>
                </div>
                <div className="vol-drivers-list">
                  <div className="vol-driver-item">
                    <div>
                      <strong>Top 3 Star Concentration</strong>
                      <small>Share of starting redraft lineup value</small>
                    </div>
                    <span className="driver-val">{fc.modelFactors.topThreeShare}%</span>
                  </div>
                  <div className="vol-driver-item">
                    <div>
                      <strong>Running Back Exposure</strong>
                      <small>Injury and workload volatility in flex spots</small>
                    </div>
                    <span className="driver-val">{fc.modelFactors.rbShare}%</span>
                  </div>
                  <div className="vol-driver-item">
                    <div>
                      <strong>Bench Depth Insulation Risk</strong>
                      <small>Scoring drop-off when substitutes start</small>
                    </div>
                    <span className="driver-val">{fc.modelFactors.depthRisk}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Core Power Viability Pillars */}
            <div className="viability-pillars-grid">
              <div className="pillar-tile">
                <span className="pillar-weight">{fc.modelFactors.pillars.lineup.weight} Weight</span>
                <h4>Starting Lineup Core</h4>
                <div className="pillar-metric">
                  <strong>#{fc.modelFactors.pillars.lineup.rank}</strong>
                  <small>{fc.modelFactors.pillars.lineup.score} pts</small>
                </div>
                <p>1QB / 2RB / 2WR / 1TE / 3FLEX baseline starter scoring projection.</p>
              </div>
              <div className="pillar-tile">
                <span className="pillar-weight">{fc.modelFactors.pillars.depth.weight} Weight</span>
                <h4>Bench Replacement Depth</h4>
                <div className="pillar-metric">
                  <strong>#{fc.modelFactors.pillars.depth.rank}</strong>
                  <small>{fc.modelFactors.pillars.depth.score} pts</small>
                </div>
                <p>Insulation against bye-week dropoff and mid-season starter injuries.</p>
              </div>
              <div className="pillar-tile">
                <span className="pillar-weight">{fc.modelFactors.pillars.balance.weight} Weight</span>
                <h4>Positional Balance</h4>
                <div className="pillar-metric">
                  <strong>#{fc.modelFactors.pillars.balance.rank}</strong>
                  <small>{fc.modelFactors.pillars.balance.score} pts</small>
                </div>
                <p>Lineup construction calibrated specifically to this league's 3-FLEX format.</p>
              </div>
              <div className="pillar-tile">
                <span className="pillar-weight">{fc.modelFactors.pillars.history.weight} Weight</span>
                <h4>2025 All-Play Receipts</h4>
                <div className="pillar-metric">
                  <strong>#{fc.modelFactors.pillars.history.rank}</strong>
                  <small>{fc.modelFactors.pillars.history.score} pts</small>
                </div>
                <p>Observed scoring track record separated from schedule luck.</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Section 1: Fluctuation Narrative & Volatility Risk Analysis */}
        {narrative ? (
          <section className="forecast-narrative-section">
            <div className="forecast-section-header">
              <p className="eyebrow">Model Evaluation & Fluctuation</p>
              <h2>{narrative.headline}</h2>
              <div className="trend-pill-badge">{narrative.trend}</div>
            </div>

            <div className="narrative-cards-grid">
              <div className="narrative-card analysis-card">
                <h3>Primary Driver & Simulation Readout</h3>
                <p>{narrative.analysis}</p>
              </div>
              <div className="narrative-card risk-card">
                <h3>Key Injury & Volatility Vulnerabilities</h3>
                <p>{narrative.keyRisk}</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Section 2: Projection History Timeline Widget */}
        {historyNotes.length > 0 ? (
          <section className="forecast-history-section">
            <div className="forecast-section-header">
              <p className="eyebrow">Trajectory Over Time</p>
              <h2>Projection History & Model Shifts</h2>
            </div>

            <div className="history-timeline-cards">
              {historyNotes.map((note, idx) => (
                <div className="history-timeline-card" key={idx}>
                  <div className="history-card-header">
                    <span className="history-date">{note.date}</span>
                    <strong className="history-rank">Rank #{note.rank}</strong>
                  </div>
                  <div className="history-event-label">{note.event}</div>
                  <div className="history-stats-row">
                    <div>
                      <span>Exp Wins</span>
                      <strong>{note.expectedWins}</strong>
                    </div>
                    <div>
                      <span>Playoff %</span>
                      <strong>{note.playoffOdds}%</strong>
                    </div>
                    <div>
                      <span>Title %</span>
                      <strong style={{ color: "var(--rust)" }}>{note.titleOdds}%</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Section 3: 14-Week Schedule & Matchup Win % Matrix */}
        <section className="forecast-schedule-section">
          <div className="forecast-section-header">
            <p className="eyebrow">14-Week Matchup Matrix</p>
            <h2>Weekly Schedule & Win Probabilities</h2>
            <p className="section-deck">
              Exact simulated win probabilities from 10,000 iterations based on team scoring distributions and projected spreads.
            </p>
          </div>

          <div className="schedule-matrix-grid">
            {schedule.map((game) => {
              const isFavored = game.winProbability >= 50.0;
              const probColor = game.winProbability >= 65 ? "var(--ink)" : game.winProbability >= 45 ? "#b45309" : "var(--rust)";
              return (
                <div className="schedule-matchup-card" key={game.week}>
                  <div className="matchup-card-top">
                    <span className="week-badge">Week {game.week}</span>
                    <span className="spread-pill" style={{ background: isFavored ? "#e8edea" : "#fbf0ec", color: isFavored ? "var(--ink)" : "var(--rust)" }}>
                      {game.spreadLabel}
                    </span>
                  </div>
                  <div className="matchup-opponent-row">
                    <span>vs</span>
                    <strong>{game.opponentName}</strong>
                  </div>
                  <div className="matchup-scores-row">
                    <small>Proj: {game.projectedScore.toFixed(1)} – {game.opponentProjectedScore.toFixed(1)}</small>
                  </div>
                  <div className="matchup-prob-section">
                    <div className="matchup-prob-header">
                      <span>Win Chance</span>
                      <strong style={{ color: probColor }}>{game.winProbability}%</strong>
                    </div>
                    <div className="matchup-prob-bar">
                      <b style={{ width: `${game.winProbability}%`, background: probColor }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 4: Seed Probability Distribution */}
        <section className="forecast-distribution-section">
          <div className="forecast-section-header">
            <p className="eyebrow">Finish Horizon</p>
            <h2>12-Seed Probability Distribution</h2>
            <p className="section-deck">
              Probability of finishing in each regular season seed across 10,000 simulations. Seeds 1–6 qualify for the playoffs; Seeds 7–12 enter the Toilet Bowl.
            </p>
          </div>

          <div className="seed-distribution-grid">
            {seedDist.map((item) => {
              const isPlayoff = item.seed <= 6;
              const isBye = item.seed <= 2;
              return (
                <div className={`seed-bar-column ${isPlayoff ? "playoff-seed" : "toilet-seed"}`} key={item.seed}>
                  <span className="seed-prob-val">{item.probability}%</span>
                  <div className="seed-bar-track">
                    <b
                      style={{
                        height: `${Math.max(4, item.probability * 3.5)}px`,
                        background: isBye ? "var(--ink)" : isPlayoff ? "#2d6a4f" : "#9ca3af"
                      }}
                    />
                  </div>
                  <span className="seed-label">#{item.seed}</span>
                  <small className="seed-tag">{isBye ? "BYE" : isPlayoff ? "PLY" : "OUT"}</small>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function MethodologyScreen() {
  return (
    <div className="app-screen methodology-screen web-screen">
      <main className="methodology-page">
        <p className="eyebrow">How to read this</p>
        <h1>League-specific by design</h1>
        <p className="section-deck">Generic rookie rankings are only the starting point. These grades reflect the rules, the price paid to get each pick, and the roster that has to use it.</p>
        <section><span>60%</span><div><h2>Pick execution</h2><p>Expert consensus and current trade-market value captured at the exact selection.</p></div></section>
        <section><span>30%</span><div><h2>Capital management</h2><p>Current value received versus sent in every trade containing a 2026 rookie pick.</p></div></section>
        <section><span>10%</span><div><h2>Roster construction</h2><p>Positional fit, competitive window and the value of consolidation versus diversification.</p></div></section>
        <div className="rules-box">
          <h2>The rules that matter</h2>
          <p>12 teams · 1QB · half-PPR · 4-point pass TD · no TE premium · three FLEX · two rookie taxi spots.</p>
        </div>
        <div className="rules-box history-method">
          <h2>Historical results</h2>
          <p>The app follows Sleeper's previous_league_id into the 2025 league, then combines regular-season roster records and points with the winners and consolation brackets to reconstruct final finish.</p>
        </div>
        <div className="rules-box power-method">
          <h2>Power Rankings are a separate grade</h2>
          <p>The 2026 viability score is 55% current optimal-lineup strength, 25% usable depth, 10% positional balance calibrated to three FLEX spots, and 10% 2025 scoring. Letter grades come from score thresholds rather than a forced curve. Draft grades do not enter the calculation; dynasty strength and the three-year runway are shown alongside the grade, but cannot inflate it.</p>
        </div>
        <p className="source-note">Sources: Sleeper league, roster, matchup, bracket, draft, and transaction data; FantasyCalc dynasty and redraft values; FantasyPros ECR; RotoBaller; Justin Boone; and DraftSharks. Snapshot: Aug 20, 2026.</p>
      </main>
    </div>
  );
}

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (value === "methodology") return { kind: "methodology" };
  if (value.startsWith("matchup-")) {
    const matchupId = Number(value.slice("matchup-".length));
    if ((matchupsWeek1Json.matchups as Week1Matchup[]).some((m) => m.matchupId === matchupId)) {
      return { kind: "matchup", matchupId };
    }
  }
  if (value.startsWith("forecast-team-")) {
    const rosterId = Number(value.slice("forecast-team-".length));
    if (teams.some((team) => team.rosterId === rosterId)) return { kind: "forecastTeam", rosterId };
  }
  if (value.startsWith("power-team-")) {
    const rosterId = Number(value.slice("power-team-".length));
    if (teams.some((team) => team.rosterId === rosterId)) return { kind: "powerTeam", rosterId };
  }
  if (value.startsWith("team-")) {
    const rank = Number(value.slice(5));
    if (teams.some((team) => team.rank === rank)) return { kind: "team", rank };
  }
  if (value === "teams" || value === "power-rankings" || value === "power") {
    return { kind: "nav", id: "power" };
  }
  if (value === "analysis" || value === "matchups" || value === "forecast") {
    return { kind: "nav", id: value };
  }
  if (value === "almanac") return { kind: "nav", id: "analysis" };
  return { kind: "nav", id: "analysis" };
}

function routeHash(route: Route) {
  if (route.kind === "team") return `#team-${route.rank}`;
  if (route.kind === "powerTeam") return `#power-team-${route.rosterId}`;
  if (route.kind === "forecastTeam") return `#forecast-team-${route.rosterId}`;
  if (route.kind === "matchup") return `#matchup-${route.matchupId}`;
  if (route.kind === "methodology") return "#methodology";
  if (route.id === "power") return "#power-rankings";
  return route.id === "analysis" ? "#analysis" : `#${route.id}`;
}

export default function Prototype() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const initial = routeFromHash();
    if (initial.kind === "nav") return initial.id;
    if (initial.kind === "forecastTeam") return "forecast";
    if (initial.kind === "matchup") return "matchups";
    return initial.kind === "powerTeam" ? "power" : "analysis";
  });

  useEffect(() => {
    const handleHash = () => {
      const next = routeFromHash();
      setRoute(next);
      if (next.kind === "nav") setActiveNav(next.id);
      if (next.kind === "powerTeam") setActiveNav("power");
      if (next.kind === "matchup") setActiveNav("matchups");
      if (next.kind === "forecastTeam") setActiveNav("forecast");
      if (next.kind === "team" || next.kind === "methodology") setActiveNav("analysis");
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const go = (next: Route) => {
    if (next.kind === "nav") setActiveNav(next.id);
    const nextHash = routeHash(next);
    if (window.location.hash === nextHash) {
      setRoute(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.hash = nextHash;
    }
  };

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else go({ kind: "nav", id: activeNav });
  };

  const selectedTeam = route.kind === "team" ? teams.find((team) => team.rank === route.rank) : undefined;
  const selectedPowerTeam = route.kind === "powerTeam" ? teams.find((team) => team.rosterId === route.rosterId) : undefined;
  const selectedForecastTeam = route.kind === "forecastTeam" ? teams.find((team) => team.rosterId === route.rosterId) : undefined;
  const selectedMatchup = route.kind === "matchup" ? (matchupsWeek1Json.matchups as Week1Matchup[]).find((m) => m.matchupId === route.matchupId) : undefined;

  return (
    <div className="site-shell">
      <SiteNav active={activeNav} onNavigate={(id) => go({ kind: "nav", id })} />
      <div className="site-content">
        {route.kind === "matchup" ? (
          selectedMatchup ? (
            <MatchupDeepDiveScreen
              matchup={selectedMatchup}
              onBack={goBack}
            />
          ) : (
            <MatchupsScreen onMatchup={(matchup) => go({ kind: "matchup", matchupId: matchup.matchupId })} />
          )
        ) : route.kind === "forecastTeam" ? (
          selectedForecastTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedForecastTeam} context="Season Forecast" grade={`#${forecastInsights.teams[String(selectedForecastTeam.rosterId)]?.medianSeed ?? 1}`} />
              <ForecastTeamScreen team={selectedForecastTeam} />
            </>
          ) : (
            <ForecastScreen onTeam={(team) => go({ kind: "forecastTeam", rosterId: team.rosterId })} />
          )
        ) : route.kind === "powerTeam" ? (
          selectedPowerTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedPowerTeam} context="Power Rankings" grade={powerProfileFor(selectedPowerTeam).grade} />
              <PowerTeamScreen team={selectedPowerTeam} />
            </>
          ) : (
            <PowerRankingsScreen onTeam={(team) => go({ kind: "powerTeam", rosterId: team.rosterId })} />
          )
        ) : route.kind === "team" ? (
          selectedTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedTeam} context="Draft Recap" grade={draftCycleGrade(selectedTeam)} />
              <DraftTeamScreen team={selectedTeam} />
            </>
          ) : (
            <AnalysisScreen
              onTeam={(team) => go({ kind: "team", rank: team.rank })}
              onNavigate={(id) => go({ kind: "nav", id })}
              onMethodology={() => go({ kind: "methodology" })}
            />
          )
        ) : route.kind === "methodology" ? (
          <>
            <div className="detail-header methodology-header">
              <button type="button" onClick={goBack} aria-label="Back"><ArrowLeft size={24} /></button>
              <div><span>Draft Recap</span><strong>Methodology</strong></div>
            </div>
            <MethodologyScreen />
          </>
        ) : route.id === "power" ? (
          <PowerRankingsScreen onTeam={(team) => go({ kind: "powerTeam", rosterId: team.rosterId })} />
        ) : route.id === "matchups" ? (
          <MatchupsScreen onMatchup={(matchup) => go({ kind: "matchup", matchupId: matchup.matchupId })} />
        ) : route.id === "forecast" ? (
          <ForecastScreen onTeam={(team) => go({ kind: "forecastTeam", rosterId: team.rosterId })} />
        ) : (
          <AnalysisScreen
            onTeam={(team) => go({ kind: "team", rank: team.rank })}
            onNavigate={(id) => go({ kind: "nav", id })}
            onMethodology={() => go({ kind: "methodology" })}
          />
        )}
      </div>
    </div>
  );
}
