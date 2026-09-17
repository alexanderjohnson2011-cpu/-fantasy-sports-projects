import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsLeftRight,
  BookOpenText,
  ChartBar,
  ChartLineUp,
  CheckCircle,
  ClockCounterClockwise,
  CurrencyDollar,
  Football,
  Info,
  Lightning,
  List,
  Newspaper,
  Sparkle,
  Television,
  TrendDown,
  TrendUp,
  Trophy,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "./prototype.css";

import draftRecapJson from "./generated/johnnys-jerks/draft-recap.json";
import weeklyRecapJson from "./generated/johnnys-jerks/weekly-recap.json";
import waiverAnalysisJson from "./generated/johnnys-jerks/waiver-wire-analysis.json";
import powerRankingsJson from "./generated/johnnys-jerks/power-rankings.json";
import matchupsCurrentJson from "./generated/johnnys-jerks/matchups-current.json";
import forecastInsightsJson from "./generated/johnnys-jerks/forecast-insights.json";
import TrajectoryChart from "./components/johnny/TrajectoryChart";
import PowerTrajectoryChart from "./components/johnny/PowerTrajectoryChart";

const JOHNNYS_LEAGUE_ID = "1401673232670539776";

type SleeperLiveSnapshot = {
  week: number;
  byRoster: Record<string, {
    matchupId: number;
    points: number;
    startersPlayed?: number;
    liveProjectedTotal?: number;
    liveWinProb?: number;
  }>;
  refreshedAt?: string;
  error?: string;
  isLiveAction?: boolean;
};

type NavId = "dashboard" | "recaps" | "matchups" | "waivers" | "power" | "forecast" | "hall" | "analysis";

type Route =
  | { kind: "nav"; id: NavId }
  | { kind: "team"; rank: number }
  | { kind: "powerTeam"; rosterId: number }
  | { kind: "matchup"; matchupId: number }
  | { kind: "forecastTeam"; rosterId: number }
  | { kind: "methodology" };

const navItems: Array<{ id: NavId; label: string; icon: typeof BookOpenText }> = [
  { id: "dashboard", label: "Front Page", icon: Newspaper },
  { id: "recaps", label: "Recaps", icon: ClockCounterClockwise },
  { id: "matchups", label: "Matchups", icon: Football },
  { id: "waivers", label: "Waivers & ROI", icon: CurrencyDollar },
  { id: "power", label: "Power Rankings", icon: ChartLineUp },
  { id: "forecast", label: "Season Forecast", icon: Lightning },
  { id: "hall", label: "The Cooler 🏆", icon: Trophy },
  { id: "analysis", label: "Draft Analysis", icon: BookOpenText },
];

function draftCycleGrade(team: any) {
  return (team.cycleGrade || "B").replace("-", "−");
}

function padRank(value: number) {
  return value < 10 ? `0${value}` : `${value}`;
}

function displayPlayerName(value: string) {
  const defense = /^Player ([A-Z]{2,3})$/.exec(value || "");
  return defense ? `${defense[1]} Defense` : value;
}

function displayStarterList(values: string[]) {
  return values.map((value) => value.replace(/^Player ([A-Z]{2,3}) \(DEF\)$/, "$1 Defense (DEF)")).join(" · ");
}

function scoreLabel(score: number) {
  if (score >= 95) return "Elite";
  if (score >= 90) return "Exceptional";
  if (score >= 85) return "Strong";
  if (score >= 80) return "Above average";
  if (score >= 75) return "Solid";
  if (score >= 70) return "Adequate";
  if (score >= 60) return "Marginal";
  return "Vulnerable";
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="score-bar">
      <div className="score-bar__label">
        <span>{label}</span>
        <span>{value ?? "—"} · {value != null ? scoreLabel(value) : "Not applicable"}</span>
      </div>
      <div className="score-bar__track">
        <span style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
      </div>
    </div>
  );
}

function ProbabilityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-bar">
      <div className="score-bar__label"><span>{label}</span><span>{value.toFixed(1).replace(".0", "")}%</span></div>
      <div className="score-bar__track"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
    </div>
  );
}

function DetailHeader({ onBack, title, context, grade }: { onBack: () => void; title: string; context: string; grade?: string }) {
  return (
    <div className="detail-header">
      <button type="button" onClick={onBack} aria-label="Back"><ArrowLeft size={24} /></button>
      <div><span>{context}</span><strong>{title}</strong></div>
      {grade && <span className="detail-header__grade">{grade}</span>}
    </div>
  );
}

function useSleeperLiveScores(): SleeperLiveSnapshot {
  const [snapshot, setSnapshot] = useState<SleeperLiveSnapshot>({ week: matchupsCurrentJson.week, byRoster: {} });

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | undefined;

    const refresh = async () => {
      activeController?.abort();
      activeController = new AbortController();
      try {
        const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${JOHNNYS_LEAGUE_ID}`, { signal: activeController.signal });
        if (!leagueResponse.ok) throw new Error(`League feed returned ${leagueResponse.status}`);
        const league = await leagueResponse.json();
        const week = Number(league?.settings?.leg || matchupsCurrentJson.week);
        const matchupResponse = await fetch(`https://api.sleeper.app/v1/league/${JOHNNYS_LEAGUE_ID}/matchups/${week}`, { signal: activeController.signal });
        if (!matchupResponse.ok) throw new Error(`Matchup feed returned ${matchupResponse.status}`);
        const rows = await matchupResponse.json();
        if (!Array.isArray(rows)) return;

        let hasAnyPoints = false;
        const byRoster: Record<string, any> = {};
        const grouped: Record<number, any[]> = {};

        for (const r of rows) {
          if (r.matchup_id) {
            grouped[r.matchup_id] = grouped[r.matchup_id] || [];
            grouped[r.matchup_id].push(r);
          }
          const pts = Number(r.points || 0);
          if (pts > 0) hasAnyPoints = true;
          const sp = r.starters_points || [];
          const playedCount = sp.filter((p: number) => p > 0).length;
          byRoster[String(r.roster_id)] = {
            matchupId: Number(r.matchup_id),
            points: pts,
            startersPlayed: playedCount,
          };
        }

        for (const [, pair] of Object.entries(grouped)) {
          if (pair.length === 2) {
            const r1 = pair[0];
            const r2 = pair[1];
            const p1 = Number(r1.points || 0);
            const p2 = Number(r2.points || 0);
            const sp1 = r1.starters_points || [];
            const sp2 = r2.starters_points || [];
            const played1 = sp1.filter((p: number) => p > 0).length;
            const played2 = sp2.filter((p: number) => p > 0).length;
            const rem1 = Math.max(0, (r1.starters?.length || 9) - played1);
            const rem2 = Math.max(0, (r2.starters?.length || 9) - played2);

            const remProj1 = rem1 * 11.5;
            const remProj2 = rem2 * 11.5;
            const liveProj1 = p1 + remProj1;
            const liveProj2 = p2 + remProj2;

            const remVariance = Math.sqrt(rem1 * 40.0 + rem2 * 40.0);
            const diff = liveProj1 - liveProj2;
            let winProb1 = 50.0;
            if (remVariance > 0.1) {
              winProb1 = Math.round(100.0 / (1.0 + Math.pow(10, -diff / Math.max(12, remVariance * 1.6))));
            } else {
              winProb1 = p1 > p2 ? 100 : (p1 < p2 ? 0 : 50);
            }
            const winProb2 = 100 - winProb1;

            byRoster[String(r1.roster_id)] = {
              matchupId: Number(r1.matchup_id),
              points: p1,
              startersPlayed: played1,
              liveProjectedTotal: Math.round(liveProj1 * 10) / 10,
              liveWinProb: winProb1,
            };
            byRoster[String(r2.roster_id)] = {
              matchupId: Number(r2.matchup_id),
              points: p2,
              startersPlayed: played2,
              liveProjectedTotal: Math.round(liveProj2 * 10) / 10,
              liveWinProb: winProb2,
            };
          }
        }

        if (!cancelled) setSnapshot({ week, byRoster, refreshedAt: new Date().toISOString(), isLiveAction: hasAnyPoints });
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          setSnapshot((current) => ({ ...current, error: (error as Error).message }));
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return snapshot;
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

function RecapsScreen() {
  const recapData = weeklyRecapJson;
  const [selectedWeek, setSelectedWeek] = useState<number>(recapData.activeWeek || 1);
  const [expandedMatchup, setExpandedMatchup] = useState<number | null>(null);

  const currentWeekRecap = recapData.weeks?.find((w: any) => w.week === selectedWeek) || recapData.weeks?.[0];
  const superlatives = currentWeekRecap?.superlatives;

  return (
    <div className="app-screen section-screen web-screen recaps-screen-container">
      <main className="section-page">
        <p className="eyebrow">Official Weekly Matchup Audit & AI Highlights</p>
        <h1>Matchup Recaps</h1>
        <p className="section-deck">
          Game-by-game breakdowns, AI tactical commentary, box scores with lineup efficiency, and weekly superlatives modeled directly on RosterAudit™.
        </p>

        {/* Week Selector */}
        <div className="recaps-week-picker">
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)" }}>Select Week:</span>
          {recapData.availableWeeks?.map((wk: number) => (
            <button
              key={wk}
              type="button"
              className={`week-btn ${selectedWeek === wk ? "active" : ""}`}
              onClick={() => setSelectedWeek(wk)}
            >
              Week 0{wk}
            </button>
          ))}
        </div>

        {/* Lead Editorial Card */}
        {currentWeekRecap ? (
          <div className="recaps-editorial-card">
            <h3>{currentWeekRecap.headline}</h3>
            <p>{currentWeekRecap.aiEditorialSummary}</p>
          </div>
        ) : null}

        {/* Superlatives Grid */}
        {superlatives ? (
          <div className="superlatives-section">
            <div className="superlatives-section-title">
              <Sparkle size={16} weight="fill" /> Weekly Superlatives & Highlights
            </div>
            <div className="superlatives-grid">
              {superlatives.nailbiter && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">⚡ Nailbiter of the Week</span>
                    <span className="superlative-metric">{superlatives.nailbiter.margin} pt margin</span>
                  </div>
                  <h4>{superlatives.nailbiter.winner}</h4>
                  <p className="superlative-narrative">{superlatives.nailbiter.score} · {superlatives.nailbiter.narrative}</p>
                </div>
              )}
              {superlatives.shootout && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">🔥 Shootout of the Week</span>
                    <span className="superlative-metric">{superlatives.shootout.combinedPoints} combined pts</span>
                  </div>
                  <h4>Matchup 0{superlatives.shootout.matchupId}</h4>
                  <p className="superlative-narrative">{superlatives.shootout.narrative}</p>
                </div>
              )}
              {superlatives.blowout && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">🔨 Blowout of the Week</span>
                    <span className="superlative-metric">+{superlatives.blowout.margin} pt margin</span>
                  </div>
                  <h4>{superlatives.blowout.winner}</h4>
                  <p className="superlative-narrative">{superlatives.blowout.score} · {superlatives.blowout.narrative}</p>
                </div>
              )}
              {superlatives.highRoller && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">👑 High Roller (Top Scorer)</span>
                    <span className="superlative-metric">{superlatives.highRoller.score} pts</span>
                  </div>
                  <h4>{superlatives.highRoller.teamName}</h4>
                  <p className="superlative-narrative">{superlatives.highRoller.narrative}</p>
                </div>
              )}
              {superlatives.toughBreak && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">💔 Tough Break / Bad Beat</span>
                    <span className="superlative-metric">{superlatives.toughBreak.score} pts</span>
                  </div>
                  <h4>{superlatives.toughBreak.teamName}</h4>
                  <p className="superlative-narrative">{superlatives.toughBreak.narrative}</p>
                </div>
              )}
              {superlatives.managerOfTheWeek && (
                <div className="superlative-item">
                  <div className="superlative-header">
                    <span className="superlative-tag">🧠 Manager of the Week</span>
                    <span className="superlative-metric">{superlatives.managerOfTheWeek.efficiency}% optimal</span>
                  </div>
                  <h4>{superlatives.managerOfTheWeek.teamName}</h4>
                  <p className="superlative-narrative">{superlatives.managerOfTheWeek.narrative}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* 6 Matchup Cards with AI Narrative & Box Scores */}
        <div className="recap-matchups-section">
          <div className="superlatives-section-title">
            <Football size={16} weight="fill" /> Game-by-Game Head-to-Head Audits
          </div>
          <div className="recap-matchups-grid">
            {currentWeekRecap?.matchups?.map((m: any) => {
              const isWinnerA = m.winnerRosterId === m.teamA.rosterId;
              const isExpanded = expandedMatchup === m.matchupId;
              return (
                <div key={m.matchupId} className="recap-matchup-card">
                  <div className="recap-matchup-header">
                    <div>
                      <span className="superlative-tag" style={{ color: "var(--ink-soft)" }}>
                        {m.isMarquee ? "★ Marquee Matchup" : `Matchup 0${m.matchupId}`}
                      </span>
                      <h3>{m.title}</h3>
                    </div>
                    <span className="superlative-metric">{m.margin.toFixed(2)} pt margin</span>
                  </div>

                  <div className="recap-clash-row">
                    {/* Team A */}
                    <div className={`recap-team-box ${isWinnerA ? "winner" : ""}`}>
                      <div className="recap-team-top">
                        <span className="recap-team-name">{m.teamA.teamName}</span>
                        <span className="recap-team-score">{m.teamA.points.toFixed(2)}</span>
                      </div>
                      <div className="recap-team-meta">
                        <span>{m.teamA.manager}</span>
                        <span>{m.teamA.lineupEfficiency}% efficiency · {m.teamA.benchPoints.toFixed(1)} bench pts</span>
                      </div>
                    </div>

                    {/* VS */}
                    <div className="recap-vs-divider">
                      <span className="recap-vs-badge">VS</span>
                      <span className="recap-margin-badge">{isWinnerA ? `+${m.margin.toFixed(2)}` : `-${m.margin.toFixed(2)}`}</span>
                    </div>

                    {/* Team B */}
                    <div className={`recap-team-box ${!isWinnerA ? "winner" : ""}`}>
                      <div className="recap-team-top">
                        <span className="recap-team-name">{m.teamB.teamName}</span>
                        <span className="recap-team-score">{m.teamB.points.toFixed(2)}</span>
                      </div>
                      <div className="recap-team-meta">
                        <span>{m.teamB.manager}</span>
                        <span>{m.teamB.lineupEfficiency}% efficiency · {m.teamB.benchPoints.toFixed(1)} bench pts</span>
                      </div>
                    </div>
                  </div>

                  <p className="recap-commentary-text">{m.commentary}</p>

                  <button
                    type="button"
                    className="recap-boxscore-toggle"
                    onClick={() => setExpandedMatchup(isExpanded ? null : m.matchupId)}
                  >
                    <List size={14} />
                    <span>{isExpanded ? "Hide Full Box Score" : "View Full Box Score & Starter Points"}</span>
                  </button>

                  {isExpanded ? (
                    <div className="recap-boxscore-container">
                      <div>
                        <h5 style={{ margin: "0 0 8px", fontFamily: "var(--sans)", fontSize: "0.85rem", fontWeight: 700 }}>
                          {m.teamA.teamName} Starters ({m.teamA.points.toFixed(2)} pts)
                        </h5>
                        <table className="boxscore-subtable">
                          <thead>
                            <tr>
                              <th className="pos-col">Pos</th>
                              <th>Player</th>
                              <th className="pts-col">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.teamA.starters?.map((p: any) => (
                              <tr key={p.playerId}>
                                <td className="pos-col">{p.position}</td>
                                <td>{p.name} <small style={{ color: "var(--ink-soft)" }}>({p.team})</small></td>
                                <td className="pts-col">{p.points.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h5 style={{ margin: "0 0 8px", fontFamily: "var(--sans)", fontSize: "0.85rem", fontWeight: 700 }}>
                          {m.teamB.teamName} Starters ({m.teamB.points.toFixed(2)} pts)
                        </h5>
                        <table className="boxscore-subtable">
                          <thead>
                            <tr>
                              <th className="pos-col">Pos</th>
                              <th>Player</th>
                              <th className="pts-col">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.teamB.starters?.map((p: any) => (
                              <tr key={p.playerId}>
                                <td className="pos-col">{p.position}</td>
                                <td>{p.name} <small style={{ color: "var(--ink-soft)" }}>({p.team})</small></td>
                                <td className="pts-col">{p.points.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Updated Standings Table */}
        <div style={{ marginTop: "36px" }}>
          <div className="superlatives-section-title">
            <Trophy size={16} weight="fill" /> Official League Standings & Efficiency After Week {selectedWeek}
          </div>
          <StandingsTable rows={recapData.standings as any} />
        </div>
      </main>
    </div>
  );
}

function FrontPageDashboard({
  onNavigate,
  onMatchup,
}: {
  onNavigate: (id: NavId) => void;
  onMatchup?: (matchupId: number) => void;
}) {
  const currentMatchups = matchupsCurrentJson;
  const currentWeek = currentMatchups.week || 2;
  const matchupsList = (currentMatchups.matchups as any[]) || [];
  const marqueeMatchup = matchupsList.find((m) => m.isMarquee) || matchupsList[0];
  const waiverData = waiverAnalysisJson;
  const recapData = weeklyRecapJson;
  const week1Recap = recapData.weeks?.find((w: any) => w.week === 1) || recapData.weeks?.[0];
  const superlatives = week1Recap?.superlatives;
  const forecast = forecastInsightsJson;

  const marqueeCrucialTV = marqueeMatchup?.tvSchedule?.find((s: any) => s.isCrucial) || marqueeMatchup?.tvSchedule?.[0];
  const standingsRows = recapData.standings || [];
  const avgLeagueScore = standingsRows.length
    ? (standingsRows.reduce((acc: number, r: any) => acc + (r.pointsFor || 0), 0) / standingsRows.length).toFixed(1)
    : "124.6";

  return (
    <div className="app-screen section-screen web-screen frontpage-dashboard-container">
      <main className="section-page">
        {/* Front Page Masthead */}
        <header className="frontpage-masthead">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--hairline)", paddingBottom: 8, marginBottom: 14 }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)" }}>
              Vol. I · 2026 Redraft Almanac · NFL Week 0{currentWeek} Active
            </span>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--rust)" }}>
              Official League Dashboard & Intelligence
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src="./assets/johnny/capri_sun_lifesaver.jpg" alt="" style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover" }} />
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Craig Invitational Post-Draft Almanac</p>
                <h1 style={{ font: "600 clamp(2.2rem, 6vw, 3.4rem)/0.95 var(--serif)", margin: "4px 0 0" }}>Johnny’s Jerks</h1>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)", display: "block" }}>12 Teams · Half-PPR · 16 Rounds · Daily Sync</span>
              <span style={{ fontSize: "0.75rem", color: "#2e7d32", fontWeight: 700 }}>● Automated Tuesday Refresh Active</span>
            </div>
          </div>
        </header>

        {/* 1. Macro Trends Strip */}
        <div className="macro-trends-strip">
          <div className="macro-trend-card accent-green">
            <span className="macro-trend-label">Week 01 Scoring Pace</span>
            <div className="macro-trend-value">{avgLeagueScore} pts</div>
            <p className="macro-trend-desc">League average team output; {superlatives?.highRoller?.teamName || "rLee3D"} set the high watermark.</p>
          </div>
          <div className="macro-trend-card accent-rust">
            <span className="macro-trend-label">Week {currentWeek} Marquee Spread</span>
            <div className="macro-trend-value">{marqueeMatchup?.spreadLabel || "±2.5 pts"}</div>
            <p className="macro-trend-desc">Headliner clash: {marqueeMatchup?.team1?.name} vs {marqueeMatchup?.team2?.name}.</p>
          </div>
          <div className="macro-trend-card accent-gold">
            <span className="macro-trend-label">Waiver Wire Outlay</span>
            <div className="macro-trend-value">${waiverData.summary?.totalFaabSpent || 0} FAAB</div>
            <p className="macro-trend-desc">{waiverData.summary?.totalMoves || 0} total moves executed across the league.</p>
          </div>
          <div className="macro-trend-card">
            <span className="macro-trend-label">Simulated Title Favorite</span>
            <div className="macro-trend-value">{forecast.teams?.[0]?.teamName || "Title Favorite"}</div>
            <p className="macro-trend-desc">Projected for {forecast.teams?.[0]?.expectedWins || 9.2}W with {forecast.teams?.[0]?.championshipProbability || 24}% title odds.</p>
          </div>
        </div>

        {/* 2. Game of the Week Hero Callout */}
        {marqueeMatchup ? (
          <section className="gotw-hero-card">
            <div className="gotw-eyebrow">
              <span className="gotw-tag">★ Game of the Week · Marquee Showdown</span>
              {marqueeCrucialTV ? (
                <span className="gotw-tv-pill">
                  <Television size={16} weight="duotone" />
                  {marqueeCrucialTV.timeSlot || marqueeCrucialTV.window} ({marqueeCrucialTV.network}) · {marqueeCrucialTV.fantasyPointsAtStake} pts at stake
                </span>
              ) : null}
            </div>

            <div className="gotw-clash-header">
              <div className="gotw-team-box">
                <span className="gotw-team-name">{marqueeMatchup.team1?.name}</span>
                <div className="gotw-team-meta">
                  <span>Power #{marqueeMatchup.team1?.powerRank}</span>
                  <strong>{marqueeMatchup.team1?.projected?.toFixed(1)} projected</strong>
                </div>
              </div>
              <div className="gotw-vs-circle">VS</div>
              <div className="gotw-team-box">
                <span className="gotw-team-name">{marqueeMatchup.team2?.name}</span>
                <div className="gotw-team-meta">
                  <span>Power #{marqueeMatchup.team2?.powerRank}</span>
                  <strong>{marqueeMatchup.team2?.projected?.toFixed(1)} projected</strong>
                </div>
              </div>
            </div>

            <p className="gotw-narrative">
              {marqueeMatchup.tacticalPreview?.keyStoryline || marqueeMatchup.flavor || "The premier showdown of the week features critical playoff seeding implications and high star-power matchups."}
            </p>

            <div className="gotw-cta-bar">
              <div className="gotw-odds-pills">
                <span className="gotw-pill">{marqueeMatchup.spreadLabel}</span>
                <span className="gotw-pill">O/U {marqueeMatchup.impliedTotal}</span>
                <span className="gotw-pill" style={{ color: "#2e7d32" }}>
                  {marqueeMatchup.team1?.winProbability}% win prob ({marqueeMatchup.team1?.name?.slice(0, 10)})
                </span>
              </div>
              <button
                type="button"
                className="gotw-link-btn"
                onClick={() => {
                  if (onMatchup) onMatchup(marqueeMatchup.matchupId);
                  else onNavigate("matchups");
                }}
              >
                <span>Full Tactical Preview & TV Schedule</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        ) : null}

        {/* 3. Executive Briefings Split Grid (Waivers + Recaps) */}
        <div className="frontpage-split-grid">
          {/* Waiver Wire Pulse Card */}
          <div className="dashboard-briefing-card">
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="macro-trend-label" style={{ color: "var(--rust)" }}>
                  <CurrencyDollar size={14} style={{ verticalAlign: "text-bottom" }} /> Waiver Wire Executive Pulse
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink-soft)" }}>
                  {waiverData.summary?.activeClaimCount} Transactions
                </span>
              </div>
              <h3>Transaction Trends & Move ROI</h3>
              <p>
                Franchises have invested <strong>${waiverData.summary?.totalFaabSpent} FAAB</strong> yielding <strong>{waiverData.summary?.totalPickupPoints} fantasy points</strong>.
                Top value heist: <strong>{waiverData.summary?.topPickupOverall?.player}</strong> ({waiverData.summary?.topPickupOverall?.manager}, {waiverData.summary?.topPickupOverall?.points} pts).
              </p>
              {(waiverData.spotlightNarratives as any[])?.[0] ? (
                <div style={{ background: "var(--paper-deep)", padding: "10px 12px", borderRadius: 6, fontSize: "0.82rem", borderLeft: "3px solid var(--rust)" }}>
                  <strong>{(waiverData.spotlightNarratives as any[])[0].title}:</strong> {(waiverData.spotlightNarratives as any[])[0].narrative}
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" className="gotw-link-btn" onClick={() => onNavigate("waivers")}>
                <span>Open Waiver Wire & Full ROI Ledger</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Recaps & Standings Pulse Card */}
          <div className="dashboard-briefing-card">
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="macro-trend-label" style={{ color: "#2e7d32" }}>
                  <ClockCounterClockwise size={14} style={{ verticalAlign: "text-bottom" }} /> Weekly Recap & Standings
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink-soft)" }}>
                  Week 01 Official Audit
                </span>
              </div>
              <h3>{week1Recap?.headline || "Week 1 Matchup Audit"}</h3>
              <p>
                {week1Recap?.aiEditorialSummary?.slice(0, 160) || "The opening week of the redraft season delivered fireworks, nailbiters, and major managerial decisions."}...
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0 0" }}>
                {superlatives?.nailbiter && (
                  <span className="gotw-pill" style={{ fontSize: "0.75rem" }}>
                    ⚡ Nailbiter: {superlatives.nailbiter.winner} (+{superlatives.nailbiter.margin} pt)
                  </span>
                )}
                {superlatives?.highRoller && (
                  <span className="gotw-pill" style={{ fontSize: "0.75rem" }}>
                    👑 High Roller: {superlatives.highRoller.teamName} ({superlatives.highRoller.score} pts)
                  </span>
                )}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" className="gotw-link-btn" onClick={() => onNavigate("recaps")}>
                <span>View Full Matchup Recaps & Box Scores</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Complete Edition Navigation Gateway */}
        <div style={{ marginTop: 32 }}>
          <div className="superlatives-section-title">
            <BookOpenText size={16} weight="fill" /> Full Publication Directory
          </div>
          <div className="portal-nav-grid">
            <div className="portal-card" onClick={() => onNavigate("recaps")}>
              <div className="portal-card-top"><ClockCounterClockwise size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Matchup Recaps</h4>
              <p>RosterAudit™ superlatives, AI game commentary, box scores, and standings.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("matchups")}>
              <div className="portal-card-top"><Football size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Week {currentWeek} Matchups</h4>
              <p>Head-to-head tactical previews, projected spreads, and NFL broadcast schedule.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("waivers")}>
              <div className="portal-card-top"><CurrencyDollar size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Waivers & Move ROI</h4>
              <p>FAAB velocity, manager bidding archetypes, immediate Sunday debuts, and season ROI.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("power")}>
              <div className="portal-card-top"><ChartLineUp size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Power Rankings</h4>
              <p>In-season roster viability graded on starters, depth, and star ceiling.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("forecast")}>
              <div className="portal-card-top"><Lightning size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Season Forecast</h4>
              <p>10,000-run Bayesian Monte Carlo simulation updating playoff & title odds.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("hall")}>
              <div className="portal-card-top"><Trophy size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>The Cooler 🏆</h4>
              <p>Permanent league record, draft honors, and Capri Sun & Life Saver winner.</p>
            </div>
            <div className="portal-card" onClick={() => onNavigate("analysis")}>
              <div className="portal-card-top"><BookOpenText size={22} weight="duotone" /><ArrowRight size={16} /></div>
              <h4>Draft Almanac</h4>
              <p>16-round draft ledger, pick value surplus benchmarks, and draft grades.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function WaiverWireScreen() {
  const waiverData = waiverAnalysisJson;
  const [activeSubTab, setActiveSubTab] = useState<"waivers" | "trades">("waivers");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredLedger = (waiverData.roiLedger || []).filter((item: any) => {
    const matchesPos = posFilter === "ALL" || item.position === posFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || item.playerName.toLowerCase().includes(q) || item.manager.toLowerCase().includes(q) || item.teamName.toLowerCase().includes(q);
    return matchesPos && matchesSearch;
  });

  const tradeEvaluations = (waiverData as any).tradeEvaluations || [];
  const tradeSummary = (waiverData as any).tradeSummary || {
    totalTrades: 0,
    totalPlayersTraded: 0,
    totalPicksTraded: 0,
    totalFaabTraded: 0,
  };

  return (
    <div className="app-screen section-screen web-screen waiver-screen-container">
      <main className="section-page">
        <p className="eyebrow">Transaction Intelligence & Asset Movement Audit</p>
        <h1>Transactions & Asset Audits</h1>
        <p className="section-deck">
          Auditing every waiver claim, free agent signing, and multi-asset trade. Evaluated on immediate debut impact, starting lineup frequency, net scoring yield, and asset ROI.
        </p>

        {/* Sub-Navigation Toggle: Pure Waivers vs Trade Audits */}
        <div className="transaction-subnav-container">
          <button
            type="button"
            className={`transaction-subnav-btn ${activeSubTab === "waivers" ? "is-active" : ""}`}
            onClick={() => setActiveSubTab("waivers")}
          >
            <CurrencyDollar size={18} weight={activeSubTab === "waivers" ? "bold" : "regular"} />
            <span>Waiver Wire & FAAB</span>
            <span className="count-badge">{waiverData.roiLedger?.length || 0}</span>
          </button>
          <button
            type="button"
            className={`transaction-subnav-btn ${activeSubTab === "trades" ? "is-active" : ""}`}
            onClick={() => setActiveSubTab("trades")}
          >
            <ArrowsLeftRight size={18} weight={activeSubTab === "trades" ? "bold" : "regular"} />
            <span>Trade Evaluations & Deal Audits</span>
            <span className="count-badge">{tradeSummary.totalTrades || 0}</span>
          </button>
        </div>

        {activeSubTab === "waivers" ? (
          <>
            {/* 1. Executive Stats Banner */}
            <div className="waiver-stats-banner">
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Total Transactions</span>
                <div className="waiver-stat-num">{waiverData.summary?.totalMoves || 0}</div>
                <span className="waiver-stat-sub">{waiverData.summary?.activeClaimCount || 0} completed player adds</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Total FAAB Committed</span>
                <div className="waiver-stat-num">${waiverData.summary?.totalFaabSpent || 0}</div>
                <span className="waiver-stat-sub">Across 12 franchise budgets</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Points from Pickups</span>
                <div className="waiver-stat-num">{waiverData.summary?.totalPickupPoints?.toFixed(1) || "0.0"} pts</div>
                <span className="waiver-stat-sub">Delivered to active rosters</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Top Value Heist</span>
                <div className="waiver-stat-num" style={{ fontSize: "1.3rem" }}>
                  {waiverData.summary?.topPickupOverall?.player || "None"}
                </div>
                <span className="waiver-stat-sub">
                  {waiverData.summary?.topPickupOverall?.manager} · {waiverData.summary?.topPickupOverall?.points} pts (${waiverData.summary?.topPickupOverall?.bid})
                </span>
              </div>
            </div>

            {/* 2. Spotlight Narrative Stories */}
            {waiverData.spotlightNarratives?.length ? (
              <div style={{ marginBottom: 36 }}>
                <div className="superlatives-section-title">
                  <Sparkle size={16} weight="fill" /> Breakthrough Franchise Wire Stories
                </div>
                <div className="spotlight-narratives-grid">
                  {waiverData.spotlightNarratives.map((s: any, idx: number) => (
                    <div key={idx} className="spotlight-narrative-card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--rust)" }}>
                          {s.title}
                        </span>
                        <span className="gotw-pill" style={{ fontSize: "0.7rem" }}>{s.impactLevel} Impact</span>
                      </div>
                      <p>{s.narrative}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 3. Manager Transaction Profiles & FAAB Gauges */}
            <div style={{ marginBottom: 36 }}>
              <div className="superlatives-section-title">
                <UsersThree size={16} weight="fill" /> Manager Bidding Archetypes & FAAB Velocity
              </div>
              <div className="manager-profiles-grid">
                {waiverData.managerProfiles?.map((m: any) => (
                  <div key={m.rosterId} className="manager-profile-card">
                    <div className="manager-profile-header">
                      <div>
                        <strong>{m.teamName}</strong>
                        <small>{m.manager}</small>
                      </div>
                      <span className="archetype-chip">{m.archetype}</span>
                    </div>

                    <div className="faab-meter-wrap">
                      <div className="faab-meter-label">
                        <span>FAAB Remaining: ${m.faabRemaining}</span>
                        <span>Spent: ${m.faabSpent} / $100</span>
                      </div>
                      <div className="faab-meter-bar">
                        <div className="faab-meter-fill" style={{ width: `${Math.max(0, Math.min(100, m.faabRemaining))}%` }} />
                      </div>
                    </div>

                    <div className="manager-profile-stats">
                      <div>
                        <span>Total Moves</span>
                        <strong>{m.totalMoves} ({m.waiverCount} W / {m.freeAgentCount} FA)</strong>
                      </div>
                      <div>
                        <span>Points Yield</span>
                        <strong>{m.pointsContributed?.toFixed(1)} pts</strong>
                      </div>
                      <div>
                        <span>Top Add</span>
                        <strong>{m.topPickup?.name || "—"}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Last Week's Immediate Impact */}
            {waiverData.immediateImpact?.length ? (
              <div style={{ marginBottom: 36 }}>
                <div className="superlatives-section-title">
                  <ClockCounterClockwise size={16} weight="fill" /> Immediate Impact: Recent Waiver Debut Audits
                </div>
                <p className="section-deck" style={{ fontSize: "0.85rem", margin: "0 0 16px" }}>
                  Did the latest claims pay off on Sunday? Tracking immediate fantasy output in their team debut.
                </p>
                <div className="immediate-impact-grid">
                  {waiverData.immediateImpact.map((item: any, idx: number) => {
                    const verdictClass = item.immediateVerdict.includes("Boom") ? "boom" : (
                      item.immediateVerdict.includes("Flex") ? "flex" : (
                        item.immediateVerdict.includes("Stash") ? "stash" : "miss"
                      )
                    );
                    return (
                      <div key={idx} className="immediate-impact-card">
                        <div className="immediate-card-top">
                          <span className="immediate-card-title">{item.playerName}</span>
                          <span className="gotw-pill">{item.position} · {item.nflTeam}</span>
                        </div>
                        <div className="immediate-card-manager">
                          Acquired by <strong>{item.manager}</strong> ({item.type.toUpperCase()}: ${item.bid})
                        </div>
                        <div className="immediate-score-row">
                          <span>
                            Debut: <strong>{item.debutPoints.toFixed(1)} pts</strong> {item.startedInDebut ? "(Started)" : "(Benched)"}
                          </span>
                          <span className={`verdict-tag ${verdictClass}`}>{item.immediateVerdict}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 5. Complete Season Move ROI Ledger Table */}
            <div style={{ marginTop: 24 }}>
              <div className="superlatives-section-title">
                <CurrencyDollar size={16} weight="fill" /> Season-Long Move ROI Ledger
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, margin: "14px 0" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["ALL", "RB", "WR", "TE", "QB", "DEF", "K"].map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      className={`week-btn ${posFilter === pos ? "active" : ""}`}
                      onClick={() => setPosFilter(pos)}
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Search player, manager, team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--hairline)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                    fontFamily: "var(--sans)",
                    fontSize: "0.85rem",
                    width: 240,
                  }}
                />
              </div>

              <div className="roi-table-wrap">
                <table className="roi-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>Manager</th>
                      <th>Acquired</th>
                      <th>Cost</th>
                      <th>Starts</th>
                      <th>Pts Scored</th>
                      <th>Pts / $</th>
                      <th>Current Franchise Role</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((row: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{row.playerName}</strong> <small style={{ color: "var(--ink-soft)" }}>({row.nflTeam})</small></td>
                        <td><span className="gotw-pill" style={{ fontSize: "0.72rem" }}>{row.position}</span></td>
                        <td>{row.manager}</td>
                        <td>Wk {row.acquiredWeek} ({row.type.toUpperCase()})</td>
                        <td>${row.bid}</td>
                        <td>{row.startsCount}</td>
                        <td style={{ fontWeight: 700, color: row.totalPoints > 0 ? "#2e7d32" : "inherit" }}>
                          {row.totalPoints.toFixed(1)}
                        </td>
                        <td>{row.pointsPerDollar > 0 ? `${row.pointsPerDollar}x` : "—"}</td>
                        <td style={{ fontWeight: row.currentRole.includes("Leading") ? 700 : 400, color: row.currentRole.includes("Leading") ? "#1b5e20" : "inherit" }}>
                          {row.currentRole}
                        </td>
                        <td>
                          <span className={`roi-badge ${row.verdictClass}`}>
                            {row.verdictBadge}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Trade Audits View */}
            <div className="waiver-stats-banner">
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Total Deals Completed</span>
                <div className="waiver-stat-num">{tradeSummary.totalTrades}</div>
                <span className="waiver-stat-sub">Across 12 league franchises</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Players Relocated</span>
                <div className="waiver-stat-num">{tradeSummary.totalPlayersTraded}</div>
                <span className="waiver-stat-sub">Moved between active rosters</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">Draft Picks Exchanged</span>
                <div className="waiver-stat-num">{tradeSummary.totalPicksTraded}</div>
                <span className="waiver-stat-sub">Draft capital exchanged in trades</span>
              </div>
              <div className="waiver-stat-box">
                <span className="waiver-stat-label">FAAB Re-Routed</span>
                <div className="waiver-stat-num" style={{ fontSize: "1.3rem" }}>
                  ${tradeSummary.totalFaabTraded}
                </div>
                <span className="waiver-stat-sub">Budget currency included in deals</span>
              </div>
            </div>

            {tradeEvaluations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 24px", background: "var(--paper)", border: "1px dashed var(--hairline)", borderRadius: 8, margin: "24px 0" }}>
                <ArrowsLeftRight size={44} style={{ color: "var(--ink-soft)", opacity: 0.5, marginBottom: 12 }} />
                <h3 style={{ font: "600 1.25rem var(--serif)", margin: "0 0 8px" }}>No Completed Trades on the Wire</h3>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", maxWidth: 500, margin: "0 auto", lineHeight: 1.4 }}>
                  The Trade Evaluation Desk is live and actively monitoring league activity. When franchises agree to player, draft pick, or FAAB exchanges, comprehensive forensic evaluations and net point audits will automatically display here.
                </p>
              </div>
            ) : (
              <div className="trade-audits-list">
                <div className="superlatives-section-title" style={{ marginTop: 8 }}>
                  <ArrowsLeftRight size={16} weight="bold" /> Completed Deal Audits & Net Asset Production
                </div>
                <p className="section-deck" style={{ fontSize: "0.85rem", margin: "0 0 16px" }}>
                  Auditing both sides of every completed trade: players acquired vs surrendered, draft picks exchanged, post-trade fantasy points delivered, and net scoring margin.
                </p>

                {tradeEvaluations.map((trade: any) => (
                  <div key={trade.tradeId} className="trade-audit-card">
                    <div className="trade-audit-header">
                      <div className="trade-audit-meta">
                        <span className={`trade-week-pill ${trade.isPreseason ? "is-preseason" : ""}`}>
                          {trade.period || (trade.isPreseason ? "Preseason" : `Week ${trade.leg}`)}
                        </span>
                        <span>{trade.date}</span>
                      </div>
                      <span className={`trade-verdict-badge ${trade.verdictClass}`}>
                        {trade.verdict}
                      </span>
                    </div>

                    <div className="trade-sides-wrapper">
                      {trade.teams.map((t: any, tidx: number) => {
                        const netDiff = t.netPoints;
                        const isPos = netDiff > 0;
                        const isNeg = netDiff < 0;
                        return (
                          <div key={tidx} className="trade-side-box">
                            <div className="trade-team-header">
                              <div className="trade-team-title">{t.teamName}</div>
                              <div className="trade-team-manager">{t.manager}</div>
                            </div>

                            {/* Received Assets */}
                            <div className="trade-asset-section">
                              <span className="trade-asset-label">Acquired Assets</span>
                              <div className="trade-asset-chips">
                                {t.receivedPlayers.map((p: any) => (
                                  <span key={p.id} className="trade-player-chip">
                                    <span className="trade-pos-tag">{p.position}</span>
                                    <span>{p.name}</span>
                                    <span className="trade-pts-tag">+{p.points.toFixed(1)} pts ({p.starts} st)</span>
                                  </span>
                                ))}
                                {t.receivedPicks.map((pick: string, pidx: number) => {
                                  const detail = t.receivedPicksDetails?.[pidx];
                                  const dp = detail?.draftedPlayer;
                                  return (
                                    <span key={pidx} className="trade-pick-chip">
                                      <span>🎟️ {pick}</span>
                                      {dp && (
                                        <span className="trade-drafted-player">
                                          <span className="trade-drafted-arrow">➔</span>
                                          <span className="trade-drafted-slot">#{dp.pickSlot}</span>
                                          <strong className="trade-drafted-name">{dp.playerName}</strong>
                                          <span className="trade-drafted-pos">{dp.position}</span>
                                          {dp.points > 0 ? (
                                            <span className="trade-drafted-pts">+{dp.points.toFixed(1)} pts ({dp.starts} st)</span>
                                          ) : (
                                            <span className="trade-drafted-pts is-zero">0.0 pts</span>
                                          )}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                                {t.receivedFaab > 0 && (
                                  <span className="trade-faab-chip">
                                    💰 +${t.receivedFaab} FAAB
                                  </span>
                                )}
                                {!t.receivedPlayers.length && !t.receivedPicks.length && !t.receivedFaab && (
                                  <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>None</span>
                                )}
                              </div>
                            </div>

                            {/* Sent Assets */}
                            <div className="trade-asset-section">
                              <span className="trade-asset-label">Surrendered Assets</span>
                              <div className="trade-asset-chips">
                                {t.sentPlayers.map((p: any) => (
                                  <span key={p.id} className="trade-player-chip" style={{ opacity: 0.85 }}>
                                    <span className="trade-pos-tag" style={{ background: "#666" }}>{p.position}</span>
                                    <span>{p.name}</span>
                                    <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>({p.points.toFixed(1)} pts)</span>
                                  </span>
                                ))}
                                {t.sentPicks.map((pick: string, pidx: number) => {
                                  const detail = t.sentPicksDetails?.[pidx];
                                  const dp = detail?.draftedPlayer;
                                  return (
                                    <span key={pidx} className="trade-pick-chip is-surrendered">
                                      <span>🎟️ {pick}</span>
                                      {dp && (
                                        <span className="trade-drafted-player">
                                          <span className="trade-drafted-arrow">➔</span>
                                          <span className="trade-drafted-slot">#{dp.pickSlot}</span>
                                          <span className="trade-drafted-name">{dp.playerName}</span>
                                          <span className="trade-drafted-pos">{dp.position}</span>
                                          {dp.points > 0 ? (
                                            <span className="trade-drafted-pts">({dp.points.toFixed(1)} pts)</span>
                                          ) : (
                                            <span className="trade-drafted-pts is-zero">0.0 pts</span>
                                          )}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                                {t.sentFaab > 0 && (
                                  <span className="trade-faab-chip" style={{ opacity: 0.85 }}>
                                    💰 -${t.sentFaab} FAAB
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Net return strip */}
                            <div className="trade-net-return-strip">
                              <div>
                                <span>
                                  {t.totalRealizedPoints !== undefined && t.rookiePointsReceived > 0 ? (
                                    <>Realized Yield: <strong>{t.totalRealizedPoints.toFixed(1)} pts</strong> ({t.totalRealizedStarts} st)</>
                                  ) : (
                                    <>Post-Trade Yield: <strong>{t.totalPointsReceived.toFixed(1)} pts</strong> ({t.startsReceived} st)</>
                                  )}
                                </span>
                                {t.rookiePointsReceived > 0 && (
                                  <span className="trade-rookie-yield-sub">
                                    {" "}(+{t.rookiePointsReceived.toFixed(1)} pts from rookies)
                                  </span>
                                )}
                                {t.strategicRole && (
                                  <div style={{ fontSize: "0.74rem", color: "var(--ink-soft)", marginTop: 2, fontWeight: 600 }}>
                                    {t.strategicRole}
                                  </div>
                                )}
                              </div>
                              {t.statusBadge ? (
                                <span className={`trade-net-delta is-${t.statusType || (isPos ? "positive" : isNeg ? "negative" : "even")}`}>
                                  {t.statusBadge}
                                </span>
                              ) : (
                                <span className={`trade-net-delta ${isPos ? "is-positive" : isNeg ? "is-negative" : "is-even"}`}>
                                  Net: {netDiff > 0 ? `+${netDiff.toFixed(1)}` : netDiff.toFixed(1)} pts
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Editorial narrative */}
                    <div className="trade-audit-narrative">
                      {trade.analysis}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function JohnnysPrototype() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const initial = routeFromHash();
    if (initial.kind === "nav") return initial.id;
    if (initial.kind === "powerTeam") return "power";
    if (initial.kind === "matchup") return "matchups";
    if (initial.kind === "forecastTeam") return "forecast";
    if (initial.kind === "team" || initial.kind === "methodology") return "analysis";
    return "dashboard";
  });

  useEffect(() => {
    document.title = "Johnny’s Jerks · 2026 Redraft Post-Draft Almanac";
    document.documentElement.style.overflowY = "auto";
    document.documentElement.style.height = "auto";
    document.body.style.overflowY = "auto";
    document.body.style.overflowX = "hidden";
    document.body.style.height = "auto";
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.style.height = "auto";
      rootEl.style.minHeight = "100%";
      rootEl.style.overflow = "visible";
    }
  }, []);

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

  const recap = draftRecapJson;
  const teams = recap.teams;
  const power = powerRankingsJson.rankings;
  const matchups = matchupsCurrentJson.matchups;
  const hasTvSchedule = matchups.some((matchup: any) => matchup.tvSchedule.length > 0);
  const forecast = forecastInsightsJson;
  const sleeperLive = useSleeperLiveScores();

  const selectedTeam = route.kind === "team" ? teams.find((t: any) => t.rank === route.rank) : undefined;
  const selectedPowerTeam = route.kind === "powerTeam" ? power.find((t: any) => t.rosterId === route.rosterId) : undefined;
  const selectedForecastTeam = route.kind === "forecastTeam" ? forecast.teams.find((t: any) => t.rosterId === route.rosterId) : undefined;
  const selectedMatchup = route.kind === "matchup" ? matchups.find((m: any) => m.matchupId === route.matchupId) : undefined;

  return (
    <div className="site-shell">
      <style>{`
        html, body, #root {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }
        .site-shell, .site-content, .web-screen, .section-page, .detail-page {
          height: auto !important;
          min-height: 100% !important;
          overflow: visible !important;
        }
      `}</style>
      {/* Site Navigation Sidebar / Topbar */}
      <nav className="bottom-nav" aria-label="Primary">
        <div className="site-nav__brand" onClick={() => go({ kind: "nav", id: "dashboard" })} style={{ cursor: "pointer" }}>
          <img src="./assets/johnny/capri_sun_lifesaver.jpg" alt="Johnny's Jerks emblem" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
          <span>Johnny’s Jerks</span>
        </div>
        <div className="site-nav__links">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                className={activeNav === item.id ? "bottom-nav__item is-active" : "bottom-nav__item"}
                key={item.id}
                onClick={() => go({ kind: "nav", id: item.id })}
                aria-current={activeNav === item.id ? "page" : undefined}
              >
                <Icon size={20} weight={activeNav === item.id ? "fill" : "regular"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Viewport */}
      <div className="site-content">
        {route.kind === "powerTeam" && selectedPowerTeam ? (
          <>
            <DetailHeader onBack={goBack} title={selectedPowerTeam.teamName} context="Power Rankings" grade={selectedPowerTeam.grade} />
            <PowerTeamScreen team={selectedPowerTeam} />
          </>
        ) : route.kind === "matchup" && selectedMatchup ? (
          <MatchupDeepDiveScreen matchup={selectedMatchup} liveScores={sleeperLive} onBack={goBack} />
        ) : route.kind === "forecastTeam" && selectedForecastTeam ? (
          <>
            <DetailHeader onBack={goBack} title={selectedForecastTeam.teamName} context="Season Forecast" grade={`#${selectedForecastTeam.medianSeed}`} />
            <ForecastTeamScreen team={selectedForecastTeam} />
          </>
        ) : route.kind === "team" && selectedTeam ? (
          <>
            <DetailHeader onBack={goBack} title={selectedTeam.teamName} context="Draft Recap" grade={draftCycleGrade(selectedTeam)} />
            <div className="app-screen detail-screen web-screen">
              <main className="detail-page">
                <section className="team-hero">
                  <p className="eyebrow">{selectedTeam.managerName} · Draft Rank #{selectedTeam.rank}</p>
                  {selectedTeam.rank === 1 && (
                    <div className="team-award">
                      <img src="./assets/johnny/capri_sun_lifesaver.jpg" alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />
                      <span>2026 Draft Winner · Life Saver Gold</span>
                    </div>
                  )}
                  <span className="team-hero__label">RosterAudit™ Grade</span>
                  <div className="team-hero__grade">{draftCycleGrade(selectedTeam)}</div>
                  <h1>{selectedTeam.narrative.headline}</h1>
                  <p>{selectedTeam.narrative.commentary}</p>
                </section>

                {/* Detail Block 01: RosterAudit 3-Pillar Grade Build */}
                <section className="detail-block grade-build">
                  <div className="detail-title"><span>01</span><h2>RosterAudit™ 3-Pillar Grade Build</h2></div>
                  <p className="detail-explainer">
                    Evaluated on 40% Capital Efficiency (FFC ADP), 35% Positional Balance (1QB 2RB 2WR 1TE 2FLEX), and 25% Star Power (Dynamic VORP).
                  </p>
                  <ScoreBar label="Capital Efficiency (FFC Consensus ADP)" value={selectedTeam.pillars.capitalEfficiency} />
                  <ScoreBar label="Positional Balance (1QB 2RB 2WR 1TE 2FLEX 1K 1DEF)" value={selectedTeam.pillars.positionalBalance} />
                  <ScoreBar label="Star Power (Top-5 Starter VORP Ceiling)" value={selectedTeam.pillars.starPower} />
                  <div className="grade-compare">
                    <div><span>Star Power VORP</span><strong>{selectedTeam.pillars.top5Vorp} pts</strong></div>
                    <div><span>Composite Score</span><strong>{draftCycleGrade(selectedTeam)}</strong><small>{selectedTeam.cycleScore} / 100</small></div>
                  </div>
                </section>

                {/* Detail Block 02: Pick-by-Pick Audit across 16 rounds */}
                <section className="detail-block picks-audit">
                  <div className="detail-title"><span>02</span><h2>Complete 16-Round Draft Ledger</h2></div>
                  <p className="detail-explainer">Every selection benchmarked against Fantasy Football Calculator (FFC) ADP and FantasyCalc 30-day trend momentum.</p>
                  <div className="picks-table-wrap">
                    <table className="picks-table" style={{ width: "100%", textAlign: "left", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--hairline)", color: "var(--ink-soft)" }}>
                          <th style={{ padding: "8px 6px" }}>Slot</th>
                          <th style={{ padding: "8px 6px" }}>Pick</th>
                          <th style={{ padding: "8px 6px" }}>Player</th>
                          <th style={{ padding: "8px 6px" }}>Pos</th>
                          <th style={{ padding: "8px 6px" }}>Team</th>
                          <th style={{ padding: "8px 6px" }}>FFC ADP</th>
                          <th style={{ padding: "8px 6px" }}>Surplus</th>
                          <th style={{ padding: "8px 6px" }}>Verdict</th>
                          <th style={{ padding: "8px 6px" }}>Signal / Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTeam.picks.map((p: any) => (
                          <tr key={p.overallPick} style={{ borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                            <td style={{ padding: "8px 6px", fontWeight: "bold" }}>{p.slot}</td>
                            <td style={{ padding: "8px 6px", color: "var(--ink-soft)" }}>#{p.overallPick}</td>
                            <td style={{ padding: "8px 6px", fontWeight: "bold" }}>{p.player}</td>
                            <td style={{ padding: "8px 6px" }}><span className={`position-chip pos-${p.position.toLowerCase()}`}>{p.position}</span></td>
                            <td style={{ padding: "8px 6px" }}>{p.nflTeam}</td>
                            <td style={{ padding: "8px 6px" }}>{p.adp}</td>
                            <td style={{ padding: "8px 6px", color: p.surplus >= 0 ? "#2e7d32" : "#c62828", fontWeight: "bold" }}>
                              {p.surplus >= 0 ? `+${p.surplus}` : p.surplus}
                            </td>
                            <td style={{ padding: "8px 6px", fontWeight: "bold", color: p.verdict.includes("Steal") ? "#2e7d32" : p.verdict.includes("Reach") ? "#c62828" : "inherit" }}>
                              {p.verdict}
                            </td>
                            <td style={{ padding: "8px 6px", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                              {p.trend30Day !== 0 && (
                                <span style={{ color: p.trend30Day > 0 ? "#2e7d32" : "#c62828", marginRight: 8, fontWeight: 700 }}>
                                  {p.trend30Day > 0 ? `📈 +${p.trend30Day}` : `📉 ${p.trend30Day}`}
                                </span>
                              )}
                              {p.medicalNote && <span>🩺 {p.medicalNote}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </main>
            </div>
          </>
        ) : route.kind === "methodology" ? (
          <>
            <div className="detail-header methodology-header">
              <button type="button" onClick={goBack} aria-label="Back"><ArrowLeft size={24} /></button>
              <div><span>Johnny’s Jerks</span><strong>RosterAudit™ & VORP Methodology</strong></div>
            </div>
            <div className="app-screen section-screen web-screen">
              <main className="section-page">
                <p className="eyebrow">Institutional Verification</p>
                <h1>RosterAudit™ & Dynamic VORP Engine</h1>
                <p className="section-deck">
                  The complete mathematical formulation and connected data feeds powering the 2026 Johnny’s Jerks draft audit and season simulations.
                </p>

                <div className="issue-rule" style={{ margin: "20px 0 28px" }}>
                  <span>FFC Consensus ADP · NFLverse Identity Registry · Dynamic VORP</span>
                  <span>12 Teams · Half-PPR · 16 Rounds</span>
                </div>

                <section className="detail-block">
                  <div className="detail-title"><span>01</span><h2>RosterAudit™ 3-Pillar Scoring Framework</h2></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
                    <div style={{ padding: 16, background: "var(--paper-deep)", borderRadius: 8, borderLeft: "3px solid var(--ink)" }}>
                      <strong style={{ fontSize: "1.1rem" }}>Capital Efficiency (40%)</strong>
                      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                        Benchmarks every pick against official Fantasy Football Calculator (FFC) Half-PPR consensus ADP. Nonlinear expected value decay curve credits surplus value and penalizes reaches.
                      </p>
                    </div>
                    <div style={{ padding: 16, background: "var(--paper-deep)", borderRadius: 8, borderLeft: "3px solid #2e7d32" }}>
                      <strong style={{ fontSize: "1.1rem" }}>Positional Balance (35%)</strong>
                      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                        Audits roster harmony tailored specifically to this league's 1QB, 2RB, 2WR, 1TE, 2FLEX, 1K, 1DEF starting requirements. Penalizes early over-drafting of QBs/TEs and rewards deep RB/WR stability.
                      </p>
                    </div>
                    <div style={{ padding: 16, background: "var(--paper-deep)", borderRadius: 8, borderLeft: "3px solid #c62828" }}>
                      <strong style={{ fontSize: "1.1rem" }}>Star Power (25%)</strong>
                      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                        Measures top-5 starter VORP ceiling relative to the 12-team replacement baseline ({recap.methodology.leagueAvgTop5Vorp} VORP league average).
                      </p>
                    </div>
                  </div>
                </section>

                <section className="detail-block" style={{ marginTop: 24 }}>
                  <div className="detail-title"><span>02</span><h2>Dynamic VORP Replacement Baselines</h2></div>
                  <p className="detail-explainer">Baseline thresholds established from 12-team starter allocations:</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>QB (12 Starters)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: QB13 ({recap.methodology.replacementBaselines.QB} pts)</strong>
                    </div>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>RB (24 Starters + Flex)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: RB38 ({recap.methodology.replacementBaselines.RB} pts)</strong>
                    </div>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>WR (24 Starters + Flex)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: WR34 ({recap.methodology.replacementBaselines.WR} pts)</strong>
                    </div>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>TE (12 Starters)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: TE13 ({recap.methodology.replacementBaselines.TE} pts)</strong>
                    </div>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>Kicker (12 Starters)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: K13 ({recap.methodology.replacementBaselines.K} pts)</strong>
                    </div>
                    <div style={{ padding: 12, background: "var(--paper-deep)", borderRadius: 6 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>Defense (12 Starters)</span>
                      <strong style={{ display: "block", fontSize: "1rem" }}>Baseline: DEF13 ({recap.methodology.replacementBaselines.DEF} pts)</strong>
                    </div>
                  </div>
                </section>
              </main>
            </div>
          </>
        ) : route.kind === "nav" && route.id === "dashboard" ? (
          <FrontPageDashboard onNavigate={(id) => go({ kind: "nav", id })} onMatchup={(matchupId) => go({ kind: "matchup", matchupId })} />
        ) : route.kind === "nav" && route.id === "waivers" ? (
          <WaiverWireScreen />
        ) : route.kind === "nav" && route.id === "recaps" ? (
          <RecapsScreen />
        ) : route.kind === "nav" && route.id === "power" ? (
          <div className="app-screen section-screen web-screen">
            <main className="section-page">
              <p className="eyebrow">League-wide Redraft Viability</p>
              <h1>Power Rankings</h1>
              <p className="section-deck">
                Who can win this year—graded on projected starters, usable depth, positional balance, and top-five VORP. Draft execution is deliberately excluded.
              </p>

              <div className="issue-rule" style={{ margin: "20px 0 28px" }}>
                <span>12 Rosters · Current-season model</span>
                <span>50% lineup · 25% depth · 15% ceiling · 10% balance</span>
              </div>

              {/* Movers & Shakers Showcase Banner */}
              {(() => {
                const timelineTeams = (powerRankingsJson as any).trendTimeline?.teams || [];
                const johnnyRisers = timelineTeams
                  .filter((t: any) => t.rankDelta > 0)
                  .sort((a: any, b: any) => b.rankDelta - a.rankDelta)
                  .slice(0, 3);
                const johnnyFallers = timelineTeams
                  .filter((t: any) => t.rankDelta < 0)
                  .sort((a: any, b: any) => a.rankDelta - b.rankDelta)
                  .slice(0, 3);

                if (!johnnyRisers.length && !johnnyFallers.length) return null;

                return (
                  <div className="movers-shakers-showcase">
                    <div className="movers-header">
                      <span className="eyebrow" style={{ color: "var(--rust)" }}>
                        Milestone Movement Audit & Trajectory Shifts
                      </span>
                      <h2>Weekly Movers & Shakers</h2>
                      <p>
                        Auditing rank velocity and scoring trajectory against the pre-season draft baseline. Driven by live player scoring, starting lineup efficiency, and usable depth.
                      </p>
                    </div>

                    <div className="movers-grid">
                      {/* Top Risers */}
                      <div className="mover-column">
                        <div className="mover-col-title risers">
                          <TrendUp size={16} weight="bold" />
                          <span>Top Risers & Momentum Gainers</span>
                        </div>
                        {johnnyRisers.map((t: any) => (
                          <div key={t.rosterId} className="mover-card riser" onClick={() => go({ kind: "powerTeam", rosterId: t.rosterId })} style={{ cursor: "pointer" }}>
                            <div className="mover-card-top">
                              <div>
                                <strong className="mover-card-title">{t.teamName}</strong>
                                <small className="mover-card-manager" style={{ display: "block" }}>{t.managerName}</small>
                              </div>
                              <div className="mover-rank-strip">
                                <span className="mover-badge is-up">
                                  ▲ +{t.rankDelta} (#{t.preSeasonRank} → #{t.currentRank})
                                </span>
                              </div>
                            </div>
                            <p className="mover-narrative">
                              {t.commentary}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Steepest Fallers */}
                      <div className="mover-column">
                        <div className="mover-col-title fallers">
                          <TrendDown size={16} weight="bold" />
                          <span>Steepest Slips & Depth Pressure</span>
                        </div>
                        {johnnyFallers.map((t: any) => (
                          <div key={t.rosterId} className="mover-card faller" onClick={() => go({ kind: "powerTeam", rosterId: t.rosterId })} style={{ cursor: "pointer" }}>
                            <div className="mover-card-top">
                              <div>
                                <strong className="mover-card-title">{t.teamName}</strong>
                                <small className="mover-card-manager" style={{ display: "block" }}>{t.managerName}</small>
                              </div>
                              <div className="mover-rank-strip">
                                <span className="mover-badge is-down">
                                  ▼ {t.rankDelta} (#{t.preSeasonRank} → #{t.currentRank})
                                </span>
                              </div>
                            </div>
                            <p className="mover-narrative">
                              {t.commentary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(powerRankingsJson as any).trendTimeline && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <PowerTrajectoryChart
                    mode="league"
                    timeline={(powerRankingsJson as any).trendTimeline}
                    onSelectTeam={(rosterId) => go({ kind: "powerTeam", rosterId })}
                  />
                </div>
              )}

              <div className="power-list">
                {power.map((team: any) => {
                  const sim = forecast.teams.find((entry: any) => entry.rosterId === team.rosterId);
                  const timelineTeam = (powerRankingsJson as any).trendTimeline?.teams?.find((t: any) => t.rosterId === team.rosterId);
                  const rankDelta = timelineTeam?.rankDelta ?? 0;
                  const preRank = timelineTeam?.preSeasonRank;

                  return (
                    <button className="power-card" type="button" key={team.rosterId} onClick={() => go({ kind: "powerTeam", rosterId: team.rosterId })}>
                      <div className="power-card__header">
                        <div className="power-card__rank-group">
                          <span className="power-card__rank">{padRank(team.rank)}</span>
                          {timelineTeam && (
                            <span className={`rank-delta-pill ${rankDelta > 0 ? "is-up" : rankDelta < 0 ? "is-down" : "is-same"}`}>
                              {rankDelta > 0 ? `▲ +${rankDelta}` : rankDelta < 0 ? `▼ ${rankDelta}` : "— Even"}
                            </span>
                          )}
                          {preRank ? (
                            <small style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                              Prev: #{preRank}
                            </small>
                          ) : null}
                        </div>
                        <div><strong>{team.teamName}</strong><small>{team.managerName} · {team.tier}</small></div>
                        <ArrowRight size={22} aria-hidden="true" />
                      </div>
                      <p>{team.headline}</p>
                      <div className="power-card__metrics">
                        <div><span>Grade</span><strong>{team.grade}</strong><small>{team.powerScore.toFixed(1)}</small></div>
                        <div><span>Lineup</span><strong>#{team.components.lineup.rank}</strong><small>{team.weeklyProjection.toFixed(1)} / wk</small></div>
                        <div><span>Depth</span><strong>#{team.components.depth.rank}</strong></div>
                        <div><span>Volatility</span><strong>{team.volatilityScore.toFixed(0)}</strong><small>{team.volatilityLabel}</small></div>
                      </div>
                      <div className="power-card__horizon" aria-label="Power-score component strength">
                        <div><span>Viability</span><i><b style={{ width: `${team.powerScore}%` }} /></i><strong>{team.powerScore.toFixed(0)}</strong></div>
                        <div><span>Star ceiling</span><i><b style={{ width: `${team.components.star.score}%` }} /></i><strong>#{team.components.star.rank}</strong></div>
                      </div>

                      {/* Movement Commentary */}
                      {timelineTeam?.commentary && (
                        <div className="power-card__movement-section">
                          <div className="power-card__movement-header">
                            <span>Movement vs Pre-Season</span>
                            <span className={`mover-score-delta ${rankDelta > 0 ? "pos" : rankDelta < 0 ? "neg" : ""}`}>
                              {rankDelta > 0 ? `▲ Up ${rankDelta} spots` : rankDelta < 0 ? `▼ Down ${Math.abs(rankDelta)} spots` : "Unchanged"}
                            </span>
                          </div>
                          <p className="power-card__movement-why">{timelineTeam.commentary}</p>
                        </div>
                      )}

                      {sim ? (
                        <div className="power-card__sim-badge">
                          <span>Simulation outlook</span>
                          <strong>Median seed #{sim.medianSeed}</strong>
                          <em>
                            {sim.playoffProbability}% playoffs · {team.projectedWins ?? sim.expectedWins}W
                            {team.winDelta !== undefined && team.winDelta !== 0 ? ` (${team.winDelta > 0 ? "+" : ""}${team.winDelta}W)` : ""}
                          </em>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="method-note">{powerRankingsJson.methodology} Open any team for the scoring profile, room-by-room construction, volatility watch, and projected scoring spine.</p>
            </main>
          </div>
        ) : route.kind === "nav" && route.id === "matchups" ? (
          <div className="app-screen section-screen web-screen">
            <main className="section-page">
              <p className="eyebrow">Weekly Field Guide · Official Sleeper Pairings</p>
              <h1>Week {matchupsCurrentJson.week} Matchups</h1>
              <p className="section-deck">
                A matchup-by-matchup game plan with win odds, lineup pressure points, and every relevant NFL television window.
              </p>

              <div className="issue-rule" style={{ margin: "20px 0 28px" }}>
                <span>{matchups.length} Head-to-Head Clashes</span>
                <span>{sleeperLive.error ? "Sleeper live feed unavailable" : sleeperLive.refreshedAt ? "Sleeper live · refreshes every 60 seconds" : "Connecting to Sleeper live scores…"}</span>
              </div>

              {sleeperLive.week !== matchupsCurrentJson.week ? (
                <div style={{ border: "1px solid rgba(198,40,40,0.25)", background: "rgba(198,40,40,0.05)", padding: 12, marginBottom: 20, color: "var(--ink-soft)" }}>
                  Sleeper has advanced to Week {sleeperLive.week}. Run the weekly refresh command to regenerate matchup analysis for the new slate.
                </div>
              ) : null}

              <div className="matchup-list-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
                {matchups.map((m: any) => (
                  <button
                    className="matchup-card"
                    type="button"
                    key={m.matchupId}
                    onClick={() => go({ kind: "matchup", matchupId: m.matchupId })}
                    style={{ background: "var(--paper)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 18, textAlign: "left", width: "100%", color: "inherit", cursor: "pointer" }}
                  >
                    <div className="matchup-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <span className="matchup-num-tag" style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: m.hasLiveResults ? "#dc2626" : "var(--rust)" }}>
                          {m.hasLiveResults ? "● Live Game Action" : (m.isMarquee ? "Marquee matchup" : `Matchup 0${m.matchupId}`)}
                        </span>
                        <h3 style={{ margin: "4px 0 0", font: "600 1.25rem/1.1 var(--serif)" }}>{m.team1.name} vs {m.team2.name}</h3>
                      </div>
                      <div className="matchup-odds-pills" style={{ display: "flex", gap: 6 }}>
                        <span className="card-spread-pill" style={{ background: m.hasLiveResults ? "rgba(220, 38, 38, 0.1)" : "var(--paper-deep)", color: m.hasLiveResults ? "#b91c1c" : "inherit", padding: "3px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>{m.spreadLabel}</span>
                        <span className="card-ou-pill" style={{ background: "var(--paper-deep)", padding: "3px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>O/U {m.impliedTotal}</span>
                      </div>
                    </div>

                    <p className="matchup-card-deck" style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.4 }}>{m.flavor}</p>

                    <div className="matchup-card-teams" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{m.team1.name}</strong>
                          <small style={{ display: "block", color: "var(--ink-soft)" }}>
                            Power #{m.team1.powerRank} · {m.hasLiveResults ? `${m.team1.liveWinProbability}% live` : `${m.team1.winProbability}%`} · {displayPlayerName(m.team1.keyPlayer)}
                          </small>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ display: "block", fontSize: "1.1rem" }}>
                            {m.team1.actualScore > 0 ? `${m.team1.actualScore.toFixed(1)} live` : (sleeperLive.byRoster[String(m.team1.rosterId)] ? `${sleeperLive.byRoster[String(m.team1.rosterId)].points.toFixed(1)} live` : `${m.team1.projected} pts`)}
                          </strong>
                          <small style={{ color: "var(--ink-soft)" }}>
                            {m.team1.startersPlayedCount > 0 ? `${m.team1.liveProjectedTotal} live proj` : `${m.team1.projected} projected`}
                          </small>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{m.team2.name}</strong>
                          <small style={{ display: "block", color: "var(--ink-soft)" }}>
                            Power #{m.team2.powerRank} · {m.hasLiveResults ? `${m.team2.liveWinProbability}% live` : `${m.team2.winProbability}%`} · {displayPlayerName(m.team2.keyPlayer)}
                          </small>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ display: "block", fontSize: "1.1rem" }}>
                            {m.team2.actualScore > 0 ? `${m.team2.actualScore.toFixed(1)} live` : (sleeperLive.byRoster[String(m.team2.rosterId)] ? `${sleeperLive.byRoster[String(m.team2.rosterId)].points.toFixed(1)} live` : `${m.team2.projected} pts`)}
                          </strong>
                          <small style={{ color: "var(--ink-soft)" }}>
                            {m.team2.startersPlayedCount > 0 ? `${m.team2.liveProjectedTotal} live proj` : `${m.team2.projected} projected`}
                          </small>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--hairline)", marginTop: 14, paddingTop: 12, color: "var(--rust)", fontWeight: 700, fontSize: "0.8rem" }}>
                      <span>{m.tvSchedule.length ? `${m.tvSchedule.length} viewing windows` : "TV guide pending"}</span>
                      <span>Open preview <ArrowRight size={16} aria-hidden="true" /></span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="method-note">
                Fantasy pairings and live scores come directly from Sleeper. {hasTvSchedule
                  ? `NFL kickoff times and broadcast networks are mapped from the sourced 2026 Week ${matchupsCurrentJson.week} schedule; local-market Sunday availability varies by location.`
                  : "The NFL kickoff and broadcast guide is pending a trusted schedule capture for this week."}
              </p>
            </main>
          </div>
        ) : route.kind === "nav" && route.id === "forecast" ? (
          <div className="app-screen section-screen web-screen">
            <main className="section-page">
              <p className="eyebrow">10,000-Run Monte Carlo Simulation</p>
              <h1>Season Forecast</h1>
              <p className="section-deck">
                {forecast.methodology}
              </p>

              <div className="issue-rule" style={{ margin: "20px 0 28px" }}>
                <span>{forecast.simulationsCount.toLocaleString()} Seeded Simulations</span>
                <span>Random seed {forecast.randomSeed}</span>
              </div>

              {/* Forecast Movers & Shakers Showcase Banner */}
              {(() => {
                const jfRisers = [...forecast.teams]
                  .filter((t: any) => (t.winDelta ?? 0) > 0)
                  .sort((a: any, b: any) => (b.winDelta ?? 0) - (a.winDelta ?? 0))
                  .slice(0, 3);
                const jfFallers = [...forecast.teams]
                  .filter((t: any) => (t.winDelta ?? 0) < 0)
                  .sort((a: any, b: any) => (a.winDelta ?? 0) - (b.winDelta ?? 0))
                  .slice(0, 3);

                if (!jfRisers.length && !jfFallers.length) return null;

                return (
                  <div className="movers-shakers-showcase">
                    <div className="movers-header">
                      <span className="eyebrow" style={{ color: "var(--rust)" }}>
                        10,000-Run Monte Carlo Velocity & Playoff Shifts
                      </span>
                      <h2>Forecast Movers & Shakers</h2>
                      <p>
                        Tracking expected win and playoff probability shifts against the pre-season baseline across 10,000 seeded simulations. Explaining why team trajectories are rising or falling.
                      </p>
                    </div>

                    <div className="movers-grid">
                      {/* Surging Contenders */}
                      <div className="mover-column">
                        <div className="mover-col-title risers">
                          <TrendUp size={16} weight="bold" />
                          <span>Surging Win Projections</span>
                        </div>
                        {jfRisers.map((team: any) => (
                          <div key={team.rosterId} className="mover-card riser" onClick={() => go({ kind: "forecastTeam", rosterId: team.rosterId })} style={{ cursor: "pointer" }}>
                            <div className="mover-card-top">
                              <div>
                                <strong className="mover-card-title">{team.teamName}</strong>
                                <small className="mover-card-manager" style={{ display: "block" }}>{team.managerName} · Exp Finish #{team.medianSeed}</small>
                              </div>
                              <div className="mover-rank-strip">
                                <span className="forecast-shift-badge pos">
                                  ▲ +{team.winDelta.toFixed(1)}W ({team.playoffProbability}% Playoffs)
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0", flexWrap: "wrap" }}>
                              <span className="forecast-driver-pill">LIVE_SCORING_SURGE</span>
                              <span className="forecast-trend-tag">SURGING</span>
                            </div>
                            <p className="mover-narrative">
                              {team.outlook}
                            </p>
                            {team.trajectory?.length > 0 && (
                              <div className="forecast-timeline-steps" style={{ marginTop: 6 }}>
                                <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "0.68rem" }}>Trajectory:</span>
                                {team.trajectory.map((step: any, sIdx: number) => (
                                  <span key={sIdx} className="forecast-timeline-step">
                                    {step.milestone}: <strong>{step.expectedWins}W</strong> ({step.playoffOdds}%) {sIdx < team.trajectory.length - 1 ? "→" : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Slipping Projections */}
                      <div className="mover-column">
                        <div className="mover-col-title fallers">
                          <TrendDown size={16} weight="bold" />
                          <span>Downward Projections & Risk</span>
                        </div>
                        {jfFallers.map((team: any) => (
                          <div key={team.rosterId} className="mover-card faller" onClick={() => go({ kind: "forecastTeam", rosterId: team.rosterId })} style={{ cursor: "pointer" }}>
                            <div className="mover-card-top">
                              <div>
                                <strong className="mover-card-title">{team.teamName}</strong>
                                <small className="mover-card-manager" style={{ display: "block" }}>{team.managerName} · Exp Finish #{team.medianSeed}</small>
                              </div>
                              <div className="mover-rank-strip">
                                <span className="forecast-shift-badge neg">
                                  ▼ {team.winDelta.toFixed(1)}W ({team.playoffProbability}% Playoffs)
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0", flexWrap: "wrap" }}>
                              <span className="forecast-driver-pill">EFFICIENCY_CONTRACTION</span>
                              <span className="forecast-trend-tag">SLIPPING</span>
                            </div>
                            <p className="mover-narrative">
                              {team.outlook}
                            </p>
                            {team.trajectory?.length > 0 && (
                              <div className="forecast-timeline-steps" style={{ marginTop: 6 }}>
                                <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "0.68rem" }}>Trajectory:</span>
                                {team.trajectory.map((step: any, sIdx: number) => (
                                  <span key={sIdx} className="forecast-timeline-step">
                                    {step.milestone}: <strong>{step.expectedWins}W</strong> ({step.playoffOdds}%) {sIdx < team.trajectory.length - 1 ? "→" : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(forecast as any).trendTimeline && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <TrajectoryChart
                    timeline={(forecast as any).trendTimeline}
                    onSelectTeam={(rosterId) => go({ kind: "forecastTeam", rosterId })}
                  />
                </div>
              )}

              <div className="forecast-table-wrap">
                <table className="power-table" style={{ width: "100%", textAlign: "left", fontSize: "0.9rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--hairline)", color: "var(--ink-soft)" }}>
                      <th style={{ padding: "10px 8px" }}>Team</th>
                      <th style={{ padding: "10px 8px" }}>Manager</th>
                      <th style={{ padding: "10px 8px" }}>Pre-Season</th>
                      <th style={{ padding: "10px 8px" }}>Exp Wins</th>
                      <th style={{ padding: "10px 8px" }}>Shift</th>
                      <th style={{ padding: "10px 8px" }}>Exp Losses</th>
                      <th style={{ padding: "10px 8px" }}>Playoff %</th>
                      <th style={{ padding: "10px 8px" }}>Title %</th>
                      <th style={{ padding: "10px 8px" }}>Toilet Bowl %</th>
                      <th style={{ padding: "10px 8px" }}>Season Outlook</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.teams.map((team: any) => (
                      <tr key={team.rosterId} style={{ borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                        <td style={{ padding: "12px 8px", fontWeight: "bold" }}>
                          <button
                            type="button"
                            onClick={() => go({ kind: "forecastTeam", rosterId: team.rosterId })}
                            style={{ background: "none", border: 0, padding: 0, color: "var(--ink)", font: "inherit", fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                          >
                            {team.teamName} <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        </td>
                        <td style={{ padding: "12px 8px", color: "var(--ink-soft)" }}>{team.managerName}</td>
                        <td style={{ padding: "12px 8px", color: "var(--ink-soft)" }}>{team.preSeasonExpectedWins ?? team.expectedWins}W</td>
                        <td style={{ padding: "12px 8px", fontWeight: "bold", color: "#2e7d32" }}>{team.expectedWins}W</td>
                        <td style={{ padding: "12px 8px" }}>
                          {team.winDelta !== undefined ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: team.winDelta > 0 ? "#2e7d32" : team.winDelta < 0 ? "#c62828" : "var(--ink-soft)",
                              }}
                            >
                              {team.winDelta > 0 ? `▲ +${team.winDelta}W` : team.winDelta < 0 ? `▼ ${team.winDelta}W` : "0.0W"}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", color: "#c62828" }}>{team.expectedLosses}</td>
                        <td style={{ padding: "12px 8px", fontWeight: "bold" }}>{team.playoffProbability}%</td>
                        <td style={{ padding: "12px 8px", fontWeight: "bold", color: "var(--rust)" }}>{team.championshipProbability}%</td>
                        <td style={{ padding: "12px 8px", color: team.lastPlaceProbability > 15 ? "#c62828" : "var(--ink-soft)" }}>{team.lastPlaceProbability}%</td>
                        <td style={{ padding: "12px 8px", fontSize: "0.8rem", color: "var(--ink-soft)" }}>{team.outlook}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="method-note">{forecast.scheduleBasis} Open any team to see the simulation range and playoff path.</p>
            </main>
          </div>
        ) : route.kind === "nav" && route.id === "hall" ? (
          <div className="app-screen section-screen web-screen">
            <main className="section-page">
              <p className="eyebrow">Permanent League Record</p>
              <h1>The Cooler: Superlatives & Honors</h1>
              <p className="section-deck">
                Who earned the silver pouch and frosted white Life Saver? Honoring the highest-value draft steals and wildest reaches.
              </p>

              <section className="weekly-award" style={{ marginTop: "24px", display: "flex", gap: 24, alignItems: "center", background: "var(--paper)", padding: 24, borderRadius: 12, border: "1px solid var(--hairline)" }}>
                <img src="./assets/johnny/capri_sun_lifesaver.jpg" alt="Capri Sun and Life Saver" style={{ width: 140, height: 140, borderRadius: 10, objectFit: "cover", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }} />
                <div>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "var(--rust)" }}>The Highest Honor</span>
                  <h2 style={{ font: "600 2rem/1.1 var(--serif)", margin: "4px 0 8px" }}>Who gets Johnny’s Capri Sun & Life Saver?</h2>
                  <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                    Awarded to the manager who squeezed the sweetest draft-capital surplus from the 16-round board. Winner: <strong>{recap.summary.draftWinner}</strong> ({recap.summary.draftWinnerManager}) with an <strong>{recap.summary.draftWinnerGrade}</strong> grade.
                  </p>
                </div>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 24 }}>
                <div style={{ padding: 18, background: "var(--paper)", border: "1px solid var(--hairline)", borderRadius: 8 }}>
                  <span style={{ fontSize: "1.5rem" }}>🍬</span>
                  <h3 style={{ font: "600 1.2rem var(--serif)", margin: "6px 0 4px" }}>{recap.awards.lifeSaverOfDraft.title}</h3>
                  <strong>{recap.awards.lifeSaverOfDraft.pick?.player} ({recap.awards.lifeSaverOfDraft.pick?.slot})</strong>
                  <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    Drafted by {recap.awards.lifeSaverOfDraft.pick?.team}. {recap.awards.lifeSaverOfDraft.reason}
                  </p>
                </div>

                <div style={{ padding: 18, background: "var(--paper)", border: "1px solid var(--hairline)", borderRadius: 8 }}>
                  <span style={{ fontSize: "1.5rem" }}>🧃</span>
                  <h3 style={{ font: "600 1.2rem var(--serif)", margin: "6px 0 4px" }}>{recap.awards.capriSunPouchPunt.title}</h3>
                  <strong>{recap.awards.capriSunPouchPunt.pick?.player} ({recap.awards.capriSunPouchPunt.pick?.slot})</strong>
                  <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    Punted by {recap.awards.capriSunPouchPunt.pick?.team}. {recap.awards.capriSunPouchPunt.reason}
                  </p>
                </div>

                <div style={{ padding: 18, background: "var(--paper)", border: "1px solid var(--hairline)", borderRadius: 8 }}>
                  <span style={{ fontSize: "1.5rem" }}>🌿</span>
                  <h3 style={{ font: "600 1.2rem var(--serif)", margin: "6px 0 4px" }}>{recap.awards.mintConditionBench.title}</h3>
                  <strong>{recap.awards.mintConditionBench.team}</strong>
                  <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    Managed by {recap.awards.mintConditionBench.manager}. {recap.awards.mintConditionBench.reason}
                  </p>
                </div>
              </div>
            </main>
          </div>
        ) : (
          /* Default: Draft Recap (AnalysisScreen) */
          <div className="app-screen section-screen web-screen">
            <main className="section-page">
              <header className="jj-recap-masthead" style={{ display: "flex", flexDirection: "column", width: "100%", gap: "10px", marginBottom: "16px" }}>
                <div
                  className="masthead-issue"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    borderBottom: "1px solid var(--hairline)",
                    paddingBottom: "8px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-soft)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <a href="/" style={{ textDecoration: "none", color: "var(--accent-dark, #0b3329)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ← Ape’s Mac Salad
                    </a>
                    <span style={{ opacity: 0.4 }}>|</span>
                    <span style={{ whiteSpace: "nowrap" }}>Vol. I · Issue No. 1</span>
                  </div>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginLeft: "8px" }}>
                    2026 Redraft Post-Draft Almanac
                  </span>
                </div>
                <div className="masthead-main" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", width: "100%" }}>
                  <div className="masthead-title-wrap" style={{ flex: 1, minWidth: 0 }}>
                    <h1 className="publication-name" style={{ font: "600 clamp(2.2rem, 7.5vw, 3.2rem)/0.95 var(--serif)", margin: 0, letterSpacing: "-0.02em" }}>
                      Johnny’s Jerks
                    </h1>
                    <p className="publication-sub" style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: "0.88rem", lineHeight: 1.35 }}>
                      Craig Invitational Redraft · 12 Teams · Half-PPR · 16 Rounds · 192 Selections
                    </p>
                  </div>
                  <img
                    src="./assets/johnny/capri_sun_lifesaver.jpg"
                    alt=""
                    style={{ width: 68, height: 68, borderRadius: 8, objectFit: "cover", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", flexShrink: 0 }}
                  />
                </div>
              </header>

              <div className="issue-rule" style={{ margin: "16px 0 24px" }}>
                <span>RosterAudit™ 3-Pillar Scoring: 40% Capital · 35% Balance · 25% Star Power</span>
                <button type="button" onClick={() => go({ kind: "methodology" })} style={{ background: "none", border: "none", color: "var(--rust)", fontWeight: "bold", cursor: "pointer", font: "inherit" }}>
                  View Methodology & Sources →
                </button>
              </div>

              {/* Lead Feature Article */}
              <article className="lead-story" style={{ marginBottom: 28 }}>
                <p className="eyebrow">2026 Draft Winner · Official Audit</p>
                <h2 style={{ font: "600 2.2rem/1.05 var(--serif)", margin: "4px 0 8px" }}>
                  {recap.summary.draftWinner}: Masterclass in 16-Round Redraft Execution
                </h2>
                <p style={{ color: "var(--ink-soft)", lineHeight: 1.5, fontSize: "0.95rem" }}>
                  Led by {recap.summary.draftWinnerManager}, the roster captured top marks across the RosterAudit™ framework, blending elite FFC ADP efficiency with high-floor positional balance. Snatched key value anchors while dodging high-risk reaches.
                </p>
              </article>

              {/* The Board */}
              <section className="board-section" aria-labelledby="board-title">
                <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--hairline)", paddingBottom: 8, marginBottom: 12 }}>
                  <h2 id="board-title" style={{ margin: 0, font: "600 1.6rem var(--serif)" }}>The Board</h2>
                  <button type="button" onClick={() => go({ kind: "nav", id: "power" })} style={{ background: "none", border: "none", color: "var(--rust)", fontWeight: "bold", cursor: "pointer", font: "inherit" }}>
                    Power Rankings →
                  </button>
                </div>

                {teams.map((team: any) => (
                  <button
                    className="board-row"
                    type="button"
                    key={team.rosterId}
                    onClick={() => go({ kind: "team", rank: team.rank })}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="board-row__rank">{padRank(team.rank)}</span>
                    <span className="board-row__copy">
                      <strong>{team.teamName}</strong>
                      <em>{team.narrative.headline}</em>
                    </span>
                    <span className="board-row__grade">{draftCycleGrade(team)}</span>
                    <ArrowRight size={22} weight="regular" aria-hidden="true" />
                  </button>
                ))}
              </section>

              {/* From the Scouting Notebook */}
              <section className="draft-notebook" aria-labelledby="notebook-title" style={{ marginTop: 32 }}>
                <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--hairline)", paddingBottom: 8, marginBottom: 12 }}>
                  <h2 id="notebook-title" style={{ margin: 0, font: "600 1.5rem var(--serif)" }}>From the Scouting Notebook</h2>
                  <ChartBar size={20} weight="duotone" aria-hidden="true" />
                </div>
                <div className="notebook-row" style={{ padding: "10px 0", borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--rust)", fontWeight: 700 }}>Best Value Steal (Life Saver of the Draft)</span>
                  <strong style={{ display: "block", fontSize: "1.05rem" }}>{recap.awards.lifeSaverOfDraft.pick?.player} ({recap.awards.lifeSaverOfDraft.pick?.slot})</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--ink-soft)", fontSize: "0.85rem" }}>{recap.awards.lifeSaverOfDraft.reason}</p>
                </div>
                <div className="notebook-row" style={{ padding: "10px 0", borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--rust)", fontWeight: 700 }}>Wildest Reach (Capri Sun Pouch Punt)</span>
                  <strong style={{ display: "block", fontSize: "1.05rem" }}>{recap.awards.capriSunPouchPunt.pick?.player} ({recap.awards.capriSunPouchPunt.pick?.slot})</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--ink-soft)", fontSize: "0.85rem" }}>{recap.awards.capriSunPouchPunt.reason}</p>
                </div>
                <div className="notebook-row" style={{ padding: "10px 0", borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--rust)", fontWeight: 700 }}>30-Day Market Risers (FantasyCalc Trends)</span>
                  <strong style={{ display: "block", fontSize: "1.05rem" }}>Jayden Daniels (+58.0) · Carnell Tate (+42.5) · Jameson Williams (+35.0)</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                    Managers capitalizing on late camp momentum gained critical VORP equity.
                  </p>
                </div>
                <div className="notebook-row" style={{ padding: "10px 0" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--rust)", fontWeight: 700 }}>Injury & Medical Clearance Watch</span>
                  <strong style={{ display: "block", fontSize: "1.05rem" }}>Chuba Hubbard (Hamstring Strain Monitor) · Luther Burden (Lower-Body Tag)</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                    RotoWire and Sleeper active designations tracked daily across all 12 rosters.
                  </p>
                </div>
              </section>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function PowerTeamScreen({ team }: { team: any }) {
  const rooms = Object.entries(team.positionRooms) as Array<[string, any]>;

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page">
        <section className="team-hero">
          <p className="eyebrow">Current-season power rank #{team.rank} · {team.managerName}</p>
          <span className="team-hero__label">Redraft Viability</span>
          <div className="team-hero__grade">{team.grade}</div>
          <h1>{team.headline}</h1>
          <p>{team.currentCase}</p>
        </section>

        {team.powerTrend && (
          <PowerTrajectoryChart
            mode="team"
            teamTrend={team.powerTrend}
            teamName={team.teamName}
            managerName={team.managerName}
            teamColor={team.color}
          />
        )}

        <section className="detail-block grade-build">
          <div className="detail-title"><span>01</span><h2>Why this power grade</h2></div>
          <p className="detail-explainer">This is a forward-looking redraft grade. Draft-day value is intentionally excluded.</p>
          <ScoreBar label={`Projected starting lineup · ${team.components.lineup.weight}`} value={team.components.lineup.score} />
          <ScoreBar label={`Usable bench depth · ${team.components.depth.weight}`} value={team.components.depth.score} />
          <ScoreBar label={`Top-five VORP ceiling · ${team.components.star.weight}`} value={team.components.star.score} />
          <ScoreBar label={`Positional balance · ${team.components.balance.weight}`} value={team.components.balance.score} />
          <div className="grade-compare">
            <div><span>Weekly projection</span><strong>{team.weeklyProjection.toFixed(1)} pts</strong><small>Lineup rank #{team.components.lineup.rank}</small></div>
            <div><span>Composite score</span><strong>{team.powerScore.toFixed(1)}</strong><small>{team.tier}</small></div>
          </div>
        </section>

        <section className="detail-block">
          <div className="detail-title"><span>02</span><h2>Roster construction map</h2></div>
          <p className="detail-explainer">League-relative room ranks reveal where this roster can create—and concede—weekly separation.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
            {rooms.map(([position, room]) => (
              <div key={position} style={{ background: "var(--paper-deep)", borderRadius: 8, padding: 14, borderLeft: position === team.strongestRoom ? "3px solid #2e7d32" : position === team.weakestRoom ? "3px solid #c62828" : "3px solid var(--hairline)" }}>
                <span style={{ color: "var(--ink-soft)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>{position} room</span>
                <strong style={{ display: "block", font: "600 1.45rem var(--serif)", marginTop: 3 }}>League #{room.rank}</strong>
                <small style={{ color: "var(--ink-soft)", lineHeight: 1.4 }}>{room.players.map(displayPlayerName).join(" · ")}</small>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
            <div style={{ padding: 16, borderRadius: 8, border: "1px solid rgba(46,125,50,0.25)", background: "rgba(46,125,50,0.05)" }}>
              <CheckCircle size={22} color="#2e7d32" weight="duotone" aria-hidden="true" />
              <strong style={{ display: "block", marginTop: 6 }}>Clearest advantage: {team.strongestRoom}</strong>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>The league’s #{team.positionRooms[team.strongestRoom].rank} room by projected scoring.</span>
            </div>
            <div style={{ padding: 16, borderRadius: 8, border: "1px solid rgba(198,40,40,0.25)", background: "rgba(198,40,40,0.05)" }}>
              <Warning size={22} color="#c62828" weight="duotone" aria-hidden="true" />
              <strong style={{ display: "block", marginTop: 6 }}>Pressure point: {team.weakestRoom}</strong>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{team.pressurePoint}</span>
            </div>
          </div>
        </section>

        <section className="detail-block">
          <div className="detail-title"><span>03</span><h2>Volatility & roster watch</h2></div>
          <div className="grade-compare">
            <div><span>Volatility</span><strong>{team.volatilityScore.toFixed(0)} · {team.volatilityLabel}</strong><small>Lower is steadier</small></div>
            <div><span>Concentration</span><strong>{team.topThreeShare.toFixed(1)}%</strong><small>Top-three scoring share</small></div>
            <div><span>RB share</span><strong>{team.rbShare.toFixed(1)}%</strong><small>Projected roster scoring</small></div>
          </div>
          {team.injuryFlags.length ? (
            <div style={{ marginTop: 16 }}>
              {team.injuryFlags.map((flag: any) => (
                <div key={flag.player} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <Warning size={18} color="#c62828" aria-hidden="true" />
                  <div><strong>{flag.player} · {flag.status}{flag.starter ? " · projected starter" : ""}</strong><small style={{ display: "block", color: "var(--ink-soft)" }}>{flag.note || "Monitor availability before lineup lock."}</small></div>
                </div>
              ))}
            </div>
          ) : <p className="method-note">No active health flags in the current roster snapshot.</p>}
        </section>

        <section className="detail-block picks-audit">
          <div className="detail-title"><span>04</span><h2>Projected scoring spine</h2></div>
          <p className="detail-explainer">The ten players carrying the largest share of this roster’s 2026 scoring outlook.</p>
          <div className="picks-table-wrap">
            <table className="picks-table" style={{ width: "100%", textAlign: "left", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--hairline)", color: "var(--ink-soft)" }}><th style={{ padding: "8px 6px" }}>Player</th><th style={{ padding: "8px 6px" }}>Pos</th><th style={{ padding: "8px 6px" }}>Role</th><th style={{ padding: "8px 6px" }}>Season</th><th style={{ padding: "8px 6px" }}>Weekly</th><th style={{ padding: "8px 6px" }}>Status</th></tr></thead>
              <tbody>
                {team.scoringSpine.map((player: any) => (
                  <tr key={`${player.player}-${player.slot}`} style={{ borderBottom: "1px solid rgba(11,51,41,0.08)" }}>
                    <td style={{ padding: "9px 6px", fontWeight: 700 }}>{displayPlayerName(player.player)}<small style={{ display: "block", color: "var(--ink-soft)" }}>{player.nflTeam} · pick {player.slot}</small></td>
                    <td style={{ padding: "9px 6px" }}><span className={`position-chip pos-${player.position.toLowerCase()}`}>{player.position}</span></td>
                    <td style={{ padding: "9px 6px" }}>{player.starter ? "Starter" : "Bench"}</td>
                    <td style={{ padding: "9px 6px", fontWeight: 700 }}>{player.seasonProjection.toFixed(1)}</td>
                    <td style={{ padding: "9px 6px" }}>{player.weeklyProjection.toFixed(1)}</td>
                    <td style={{ padding: "9px 6px", color: player.injuryStatus === "Healthy" ? "#2e7d32" : "#c62828" }}>{player.injuryStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 18, padding: 18, borderLeft: "4px solid var(--rust)", background: "var(--paper-deep)" }}>
            <Sparkle size={22} color="var(--rust)" weight="duotone" aria-hidden="true" />
            <strong style={{ display: "block", margin: "6px 0 4px" }}>Bottom line</strong>
            <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.5 }}>{team.verdict}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function MatchupDeepDiveScreen({ matchup, liveScores, onBack }: { matchup: any; liveScores: SleeperLiveSnapshot; onBack: () => void }) {
  const teams = [matchup.team1, matchup.team2];
  return (
    <>
      <DetailHeader onBack={onBack} title={matchup.title} context={`Week ${matchup.week} Matchup Preview`} />
      <div className="app-screen detail-screen web-screen">
        <main className="detail-page">
          <section className="team-hero">
            <p className="eyebrow">{matchup.hasLiveResults ? "● Live Game Action" : (matchup.isMarquee ? "Marquee matchup" : `Matchup 0${matchup.matchupId}`)} · O/U {matchup.impliedTotal}</p>
            <span className="team-hero__label">{matchup.hasLiveResults ? "Active live line" : "Opening line"}</span>
            <div style={{ font: "600 clamp(2rem, 7vw, 4.6rem)/0.95 var(--serif)", color: matchup.hasLiveResults ? "#dc2626" : "var(--rust)", margin: "8px 0" }}>{matchup.spreadLabel}</div>
            <h1>{matchup.tacticalAnalysis.headline}</h1>
            <p>{matchup.tacticalAnalysis.breakdown}</p>
          </section>

          {matchup.gameShift ? (
            <section className="detail-block" style={{ background: "rgba(220, 38, 38, 0.04)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#b91c1c", fontWeight: 700, fontSize: "0.8rem", textTransform: "uppercase" }}>
                <Lightning size={18} weight="fill" />
                <span>Post-Game Shift Intelligence</span>
              </div>
              <h3 style={{ font: "600 1.35rem/1.2 var(--serif)", margin: "8px 0 6px" }}>{matchup.gameShift.headline}</h3>
              <p style={{ margin: "0 0 12px", color: "var(--ink-soft)", fontSize: "0.88rem", lineHeight: 1.5 }}>{matchup.gameShift.shiftSummary}</p>
              {matchup.gameShift.keyPerformers && matchup.gameShift.keyPerformers.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {matchup.gameShift.keyPerformers.map((kp: any) => (
                    <span
                      key={kp.player}
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: kp.performance === "underperformed" ? "rgba(220, 38, 38, 0.1)" : kp.performance === "overperformed" ? "rgba(22, 163, 74, 0.1)" : "var(--paper)",
                        color: kp.performance === "underperformed" ? "#b91c1c" : kp.performance === "overperformed" ? "#15803d" : "inherit",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      {kp.player} ({kp.team}): {kp.actualPoints} pts ({kp.delta > 0 ? `+${kp.delta}` : kp.delta} vs proj)
                    </span>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="detail-block">
            <div className="detail-title"><span>01</span><h2>{matchup.hasLiveResults ? "Live & projected tale of the tape" : "Projected tale of the tape"}</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginTop: 16 }}>
              {teams.map((team: any) => (
                <div key={team.rosterId} style={{ background: "var(--paper-deep)", padding: 18, borderRadius: 10, borderTop: (matchup.hasLiveResults ? (team.liveWinProbability || team.winProbability) : team.winProbability) >= 50 ? "4px solid var(--rust)" : "4px solid var(--hairline)" }}>
                  <span style={{ color: "var(--ink-soft)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Power #{team.powerRank} · Grade {team.grade}</span>
                  <h3 style={{ font: "600 1.5rem var(--serif)", margin: "5px 0 12px" }}>{team.name}</h3>
                  <div className="grade-compare" style={{ marginTop: 0 }}>
                    {team.startersPlayedCount > 0 ? (
                      <div><span>Live score</span><strong style={{ color: "var(--rust)" }}>{team.actualScore.toFixed(1)}</strong><small>{team.startersPlayedCount} played</small></div>
                    ) : (
                      <div><span>Projected</span><strong>{team.projected}</strong><small>opening pts</small></div>
                    )}
                    <div><span>Live finish</span><strong>{team.liveProjectedTotal || team.projected}</strong><small>projected total</small></div>
                    <div><span>Win odds</span><strong>{team.liveWinProbability || team.winProbability}%</strong><small>{team.startersPlayedCount > 0 ? "live odds" : "opening model"}</small></div>
                  </div>
                  <p style={{ margin: "12px 0 0", color: "var(--ink-soft)", fontSize: "0.85rem" }}><strong style={{ color: "var(--ink)" }}>{displayPlayerName(team.keyPlayer)}</strong> is the projected scoring anchor at {team.keyPlayerProjection} points.</p>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-block">
            <div className="detail-title"><span>02</span><h2>How this matchup swings</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 16, marginTop: 16 }}>
              <div>
                <span className="eyebrow">Key variables</span>
                {matchup.tacticalAnalysis.keyVariables.map((item: string) => (
                  <div key={item} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--hairline)" }}><Lightning size={17} color="var(--rust)" weight="duotone" aria-hidden="true" /><span style={{ color: "var(--ink-soft)", fontSize: "0.86rem", lineHeight: 1.4 }}>{item}</span></div>
                ))}
              </div>
              <div>
                <span className="eyebrow">Positional edges</span>
                {matchup.positionalEdges.map((edge: any) => (
                  <div key={edge.category} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--hairline)" }}>
                    <div><strong>{edge.category}</strong><small style={{ display: "block", color: "var(--ink-soft)" }}>{edge.advantage}</small></div>
                    <strong style={{ color: edge.advantage === "Even" ? "var(--ink-soft)" : "var(--rust)" }}>{edge.margin}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="detail-block">
            <div className="detail-title"><span>03</span><h2>TV schedule & fantasy leverage</h2></div>
            <p className="detail-explainer">{matchup.tvSchedule.length ? "Chronological viewing guide for every NFL game containing a projected starter from this fantasy matchup." : "No trusted NFL kickoff and broadcast fixture has been captured for this week yet."}</p>
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {!matchup.tvSchedule.length ? (
                <div style={{ background: "var(--paper-deep)", borderRadius: 9, padding: 16, borderLeft: "4px solid var(--hairline)", color: "var(--ink-soft)" }}>
                  TV guide pending. Fantasy pairings and live team scores remain available from Sleeper.
                </div>
              ) : null}
              {matchup.tvSchedule.map((window: any) => (
                <article key={`${window.kickoffAt}-${window.gameMatchup}`} style={{ background: "var(--paper-deep)", borderRadius: 9, padding: 16, borderLeft: window.leverageLevel === "Decisive" ? "4px solid var(--rust)" : "4px solid var(--hairline)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div><span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--rust)", fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase" }}><Television size={17} weight="duotone" aria-hidden="true" />{window.timeSlot} · {window.network}</span><strong style={{ display: "block", font: "600 1.25rem var(--serif)", marginTop: 4 }}>{window.gameMatchup}</strong></div>
                    <div style={{ textAlign: "right" }}><strong>{window.fantasyPointsAtStake.toFixed(1)} pts</strong><small style={{ display: "block", color: "var(--ink-soft)" }}>{window.leverageLevel} leverage</small></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
                    <div><small style={{ color: "var(--ink-soft)" }}>{matchup.team1.name}</small><strong style={{ display: "block", fontSize: "0.84rem", marginTop: 2 }}>{window.team1Starters.length ? displayStarterList(window.team1Starters) : "No projected starters"}</strong></div>
                    <div><small style={{ color: "var(--ink-soft)" }}>{matchup.team2.name}</small><strong style={{ display: "block", fontSize: "0.84rem", marginTop: 2 }}>{window.team2Starters.length ? displayStarterList(window.team2Starters) : "No projected starters"}</strong></div>
                  </div>
                  <p style={{ margin: "10px 0 0", color: "var(--ink-soft)", fontSize: "0.82rem", lineHeight: 1.4 }}>{window.windowAnalysis}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="detail-block picks-audit">
            <div className="detail-title"><span>04</span><h2>{matchup.hasLiveResults ? "Starters & live box score" : "Projected starters"}</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 18, marginTop: 16 }}>
              {teams.map((team: any) => (
                <div key={team.rosterId}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <h3 style={{ font: "600 1.3rem var(--serif)", margin: 0 }}>{team.name}</h3>
                    {team.startersPlayedCount > 0 && (
                      <span style={{ fontSize: "0.8rem", color: "var(--rust)", fontWeight: 700 }}>
                        {team.actualScore.toFixed(1)} pts logged ({team.startersRemainingCount} left)
                      </span>
                    )}
                  </div>
                  {team.starters.map((player: any) => (
                    <div key={`${team.rosterId}-${player.slot}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
                      <span className={`position-chip pos-${player.position.toLowerCase()}`}>{player.slot}</span>
                      <div>
                        <strong style={{ fontSize: "0.88rem" }}>{displayPlayerName(player.player)}</strong>
                        <small style={{ display: "block", color: "var(--ink-soft)" }}>
                          {player.nflTeam} {player.matchup} · {player.kickoff}
                        </small>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {player.hasPlayed ? (
                          <>
                            <strong style={{ display: "block", fontSize: "0.92rem", color: player.performance === "overperformed" ? "#16a34a" : player.performance === "underperformed" ? "#dc2626" : "inherit" }}>
                              {player.actualPoints.toFixed(1)} pts
                            </strong>
                            <small style={{ display: "block", fontSize: "0.72rem", color: player.performance === "overperformed" ? "#16a34a" : player.performance === "underperformed" ? "#dc2626" : "var(--ink-soft)" }}>
                              {player.delta > 0 ? `+${player.delta.toFixed(1)}` : player.delta.toFixed(1)} vs proj
                            </small>
                          </>
                        ) : (
                          <>
                            <strong style={{ display: "block", fontSize: "0.92rem" }}>{player.projectedPoints.toFixed(1)}</strong>
                            <small style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)" }}>proj</small>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="method-note">Broadcast windows use the official 2026 NFL Week 1 schedule. Sunday afternoon networks remain subject to local-market coverage.</p>
          </section>
        </main>
      </div>
    </>
  );
}

function ForecastTeamScreen({ team }: { team: any }) {
  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page">
        <section className="team-hero">
          <p className="eyebrow">Power rank #{team.powerRank} · {team.managerName}</p>
          <span className="team-hero__label">Median simulated seed</span>
          <div className="team-hero__grade">#{team.medianSeed}</div>
          {team.winDelta !== undefined && team.winDelta !== 0 && (
            <div style={{ marginTop: 8 }}>
              <span className={`rank-delta-pill ${team.winDelta > 0 ? "is-up" : "is-down"}`}>
                {team.winDelta > 0 ? `▲ +${team.winDelta.toFixed(1)}W vs Pre-Season` : `▼ ${team.winDelta.toFixed(1)}W vs Pre-Season`}
              </span>
            </div>
          )}
          <h1>{team.outlook}</h1>
          <p>The model centers this roster at {team.expectedWins}-{team.expectedLosses} (Pre-Season: {team.preSeasonExpectedWins ?? team.expectedWins}W), then replays weekly scoring volatility and a six-team playoff bracket across {forecastInsightsJson.simulationsCount.toLocaleString()} seeded seasons.</p>
        </section>

        {team.trajectory && team.trajectory.length > 0 && (
          <section className="detail-block">
            <div className="detail-title"><span>01</span><h2>Projection Trajectory & Milestones</h2></div>
            <p className="detail-explainer">Tracking the evolution of this team’s expected wins and playoff odds through pre-season and live scoring events.</p>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {team.trajectory.map((step: any, sIdx: number) => (
                <div key={sIdx} style={{ background: "var(--paper-deep)", padding: "12px 16px", borderRadius: 8, borderLeft: "3px solid var(--rust)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.95rem" }}>{step.milestone}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>{step.date}</span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink)", marginTop: 4 }}>
                    <span>Event: <strong>{step.event}</strong></span> · <span>Proj Wins: <strong style={{ color: "#2e7d32" }}>{step.expectedWins}W</strong></span> · <span>Playoff Odds: <strong>{step.playoffOdds}%</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="detail-block">
          <div className="detail-title"><span>02</span><h2>Range of outcomes</h2></div>
          <div className="grade-compare">
            <div><span>Playoffs</span><strong>{team.playoffProbability}%</strong><small>Any playoff berth</small></div>
            <div><span>Championship</span><strong>{team.championshipProbability}%</strong><small>Wins playoff bracket</small></div>
            <div><span>Last place</span><strong>{team.lastPlaceProbability}%</strong><small>Regular-season finish</small></div>
          </div>
          <ProbabilityBar label="Playoff probability" value={team.playoffProbability} />
          <ProbabilityBar label="Championship probability" value={team.championshipProbability} />
          <ProbabilityBar label="Avoid-last probability" value={100 - team.lastPlaceProbability} />
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>02</span><h2>What the model knows</h2></div>
          <p className="detail-explainer">{forecastInsightsJson.methodology}</p>
          <div style={{ padding: "14px 18px", background: "rgba(46, 125, 50, 0.05)", border: "1px solid rgba(46, 125, 50, 0.2)", borderLeft: "5px solid #2e7d32", borderRadius: 6, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle size={20} color="#2e7d32" weight="fill" aria-hidden="true" />
              <strong style={{ color: "var(--ink)", fontSize: "0.95rem" }}>Sleeper Schedule Verified (Weeks 1–14)</strong>
            </div>
            <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", lineHeight: 1.5, fontSize: "0.85rem" }}>
              {forecastInsightsJson.scheduleBasis}
            </p>
          </div>
          <p className="method-note">Power score {team.powerScore.toFixed(1)} · Simulation seed {forecastInsightsJson.randomSeed}. Forecasts are decision support, not guarantees.</p>
        </section>
        {team.weeklySchedule && team.weeklySchedule.length > 0 && (
          <section className="detail-block">
            <div className="detail-title"><span>03</span><h2>14-Week Matchup Schedule</h2></div>
            <p className="detail-explainer">
              Each simulated 10,000-run season tests this roster across all official regular-season Sleeper pairings:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", marginTop: "12px" }}>
              {team.weeklySchedule.map((w: any) => (
                <div
                  key={w.week}
                  style={{
                    padding: "8px 12px",
                    background: "var(--paper-deep)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Week {w.week}
                    </span>
                    <strong style={{ display: "block", fontSize: "0.85rem", color: "var(--ink)" }}>
                      vs {w.opponentManager}
                    </strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: w.winProbability >= 50 ? "#2e7d32" : "var(--rust)" }}>
                      {w.winProbability}% win
                    </span>
                    <span style={{ display: "block", fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                      {w.spreadLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (value === "methodology") return { kind: "methodology" };
  if (value.startsWith("team-")) {
    const rank = Number(value.slice(5));
    return { kind: "team", rank };
  }
  if (value.startsWith("power-team-")) {
    const rosterId = Number(value.slice("power-team-".length));
    return { kind: "powerTeam", rosterId };
  }
  if (value.startsWith("matchup-")) {
    const matchupId = Number(value.slice("matchup-".length));
    return { kind: "matchup", matchupId };
  }
  if (value.startsWith("forecast-team-")) {
    const rosterId = Number(value.slice("forecast-team-".length));
    return { kind: "forecastTeam", rosterId };
  }
  if (value === "recaps" || value === "recap") return { kind: "nav", id: "recaps" };
  if (value === "waivers" || value === "waiver" || value === "roi") return { kind: "nav", id: "waivers" };
  if (value === "power" || value === "power-rankings") return { kind: "nav", id: "power" };
  if (value === "matchups") return { kind: "nav", id: "matchups" };
  if (value === "forecast") return { kind: "nav", id: "forecast" };
  if (value === "hall" || value === "cooler") return { kind: "nav", id: "hall" };
  if (value === "analysis" || value === "draft" || value === "almanac" || value === "draft-analysis") return { kind: "nav", id: "analysis" };
  if (value === "dashboard" || value === "front" || value === "home") return { kind: "nav", id: "dashboard" };
  return { kind: "nav", id: "dashboard" };
}

function routeHash(route: Route) {
  if (route.kind === "team") return `#team-${route.rank}`;
  if (route.kind === "powerTeam") return `#power-team-${route.rosterId}`;
  if (route.kind === "matchup") return `#matchup-${route.matchupId}`;
  if (route.kind === "forecastTeam") return `#forecast-team-${route.rosterId}`;
  if (route.kind === "methodology") return "#methodology";
  if (route.id === "dashboard") return "#dashboard";
  if (route.id === "waivers") return "#waivers";
  return route.id === "analysis" ? "#analysis" : `#${route.id}`;
}
