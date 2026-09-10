import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChartBar,
  ChartLineUp,
  CheckCircle,
  ClockCounterClockwise,
  Football,
  Info,
  Lightning,
  Sparkle,
  Television,
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
import powerRankingsJson from "./generated/johnnys-jerks/power-rankings.json";
import matchupsCurrentJson from "./generated/johnnys-jerks/matchups-current.json";
import forecastInsightsJson from "./generated/johnnys-jerks/forecast-insights.json";

const JOHNNYS_LEAGUE_ID = "1401673232670539776";

type SleeperLiveSnapshot = {
  week: number;
  byRoster: Record<string, { matchupId: number; points: number }>;
  refreshedAt?: string;
  error?: string;
};

type NavId = "analysis" | "power" | "matchups" | "forecast" | "hall";

type Route =
  | { kind: "nav"; id: NavId }
  | { kind: "team"; rank: number }
  | { kind: "powerTeam"; rosterId: number }
  | { kind: "matchup"; matchupId: number }
  | { kind: "forecastTeam"; rosterId: number }
  | { kind: "methodology" };

const navItems: Array<{ id: NavId; label: string; icon: typeof BookOpenText }> = [
  { id: "analysis", label: "Draft Recap", icon: BookOpenText },
  { id: "power", label: "Power Rankings", icon: ChartLineUp },
  { id: "matchups", label: "Matchups", icon: Football },
  { id: "forecast", label: "Season Forecast", icon: Lightning },
  { id: "hall", label: "The Cooler 🏆", icon: Trophy },
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
        const byRoster = Object.fromEntries((Array.isArray(rows) ? rows : []).map((row: any) => [
          String(row.roster_id),
          { matchupId: Number(row.matchup_id), points: Number(row.points || 0) },
        ]));
        if (!cancelled) setSnapshot({ week, byRoster, refreshedAt: new Date().toISOString() });
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

export default function JohnnysPrototype() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const initial = routeFromHash();
    if (initial.kind === "nav") return initial.id;
    if (initial.kind === "powerTeam") return "power";
    if (initial.kind === "matchup") return "matchups";
    if (initial.kind === "forecastTeam") return "forecast";
    return "analysis";
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
        <div className="site-nav__brand" onClick={() => go({ kind: "nav", id: "analysis" })} style={{ cursor: "pointer" }}>
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

              <div className="power-list">
                {power.map((team: any) => {
                  const sim = forecast.teams.find((entry: any) => entry.rosterId === team.rosterId);
                  return (
                    <button className="power-card" type="button" key={team.rosterId} onClick={() => go({ kind: "powerTeam", rosterId: team.rosterId })}>
                      <div className="power-card__header">
                        <span className="power-card__rank">{padRank(team.rank)}</span>
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
                      {sim ? <div className="power-card__sim-badge"><span>Simulation outlook</span><strong>Median seed #{sim.medianSeed}</strong><em>{sim.playoffProbability}% playoffs · {sim.expectedWins}W</em></div> : null}
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
                        <span className="matchup-num-tag" style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--rust)" }}>
                          {m.isMarquee ? "Marquee matchup" : `Matchup 0${m.matchupId}`}
                        </span>
                        <h3 style={{ margin: "4px 0 0", font: "600 1.25rem/1.1 var(--serif)" }}>{m.team1.name} vs {m.team2.name}</h3>
                      </div>
                      <div className="matchup-odds-pills" style={{ display: "flex", gap: 6 }}>
                        <span className="card-spread-pill" style={{ background: "var(--paper-deep)", padding: "3px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>{m.spreadLabel}</span>
                        <span className="card-ou-pill" style={{ background: "var(--paper-deep)", padding: "3px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>O/U {m.impliedTotal}</span>
                      </div>
                    </div>

                    <p className="matchup-card-deck" style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.4 }}>{m.flavor}</p>

                    <div className="matchup-card-teams" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{m.team1.name}</strong>
                          <small style={{ display: "block", color: "var(--ink-soft)" }}>Power #{m.team1.powerRank} · {m.team1.winProbability}% · {displayPlayerName(m.team1.keyPlayer)}</small>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ display: "block", fontSize: "1.1rem" }}>{sleeperLive.byRoster[String(m.team1.rosterId)] ? `${sleeperLive.byRoster[String(m.team1.rosterId)].points.toFixed(1)} live` : `${m.team1.projected} pts`}</strong>
                          {sleeperLive.byRoster[String(m.team1.rosterId)] ? <small style={{ color: "var(--ink-soft)" }}>{m.team1.projected} projected</small> : null}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{m.team2.name}</strong>
                          <small style={{ display: "block", color: "var(--ink-soft)" }}>Power #{m.team2.powerRank} · {m.team2.winProbability}% · {displayPlayerName(m.team2.keyPlayer)}</small>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ display: "block", fontSize: "1.1rem" }}>{sleeperLive.byRoster[String(m.team2.rosterId)] ? `${sleeperLive.byRoster[String(m.team2.rosterId)].points.toFixed(1)} live` : `${m.team2.projected} pts`}</strong>
                          {sleeperLive.byRoster[String(m.team2.rosterId)] ? <small style={{ color: "var(--ink-soft)" }}>{m.team2.projected} projected</small> : null}
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

              <div className="forecast-table-wrap">
                <table className="power-table" style={{ width: "100%", textAlign: "left", fontSize: "0.9rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--hairline)", color: "var(--ink-soft)" }}>
                      <th style={{ padding: "10px 8px" }}>Team</th>
                      <th style={{ padding: "10px 8px" }}>Manager</th>
                      <th style={{ padding: "10px 8px" }}>Exp Wins</th>
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
                        <td style={{ padding: "12px 8px", fontWeight: "bold", color: "#2e7d32" }}>{team.expectedWins}</td>
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
              <header className="masthead">
                <div className="masthead-issue">
                  <span>Vol. I · Issue No. 1</span>
                  <span>2026 Redraft Post-Draft Almanac</span>
                </div>
                <div className="masthead-main" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="masthead-title-wrap">
                    <h1 className="publication-name" style={{ font: "600 3.2rem/0.95 var(--serif)", margin: 0 }}>Johnny’s Jerks</h1>
                    <p className="publication-sub" style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: "0.95rem" }}>
                      Craig Invitational Redraft · 12 Teams · Half-PPR · 16 Rounds · 192 Selections
                    </p>
                  </div>
                  <img src="./assets/johnny/capri_sun_lifesaver.jpg" alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }} />
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
            <p className="eyebrow">{matchup.isMarquee ? "Marquee matchup" : `Matchup 0${matchup.matchupId}`} · O/U {matchup.impliedTotal}</p>
            <span className="team-hero__label">Opening line</span>
            <div style={{ font: "600 clamp(2rem, 7vw, 4.6rem)/0.95 var(--serif)", color: "var(--rust)", margin: "8px 0" }}>{matchup.spreadLabel}</div>
            <h1>{matchup.tacticalAnalysis.headline}</h1>
            <p>{matchup.tacticalAnalysis.breakdown}</p>
          </section>

          <section className="detail-block">
            <div className="detail-title"><span>01</span><h2>Projected tale of the tape</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginTop: 16 }}>
              {teams.map((team: any) => (
                <div key={team.rosterId} style={{ background: "var(--paper-deep)", padding: 18, borderRadius: 10, borderTop: team.winProbability >= 50 ? "4px solid var(--rust)" : "4px solid var(--hairline)" }}>
                  <span style={{ color: "var(--ink-soft)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Power #{team.powerRank} · Grade {team.grade}</span>
                  <h3 style={{ font: "600 1.5rem var(--serif)", margin: "5px 0 12px" }}>{team.name}</h3>
                  <div className="grade-compare" style={{ marginTop: 0 }}>
                    <div><span>Projected</span><strong>{team.projected}</strong><small>fantasy points</small></div>
                    <div><span>Win odds</span><strong>{team.winProbability}%</strong><small>opening model</small></div>
                    {liveScores.week === matchup.week && liveScores.byRoster[String(team.rosterId)] ? (
                      <div><span>Live</span><strong>{liveScores.byRoster[String(team.rosterId)].points.toFixed(1)}</strong><small>refreshes every 60 sec</small></div>
                    ) : null}
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
            <div className="detail-title"><span>04</span><h2>Projected starters</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 18, marginTop: 16 }}>
              {teams.map((team: any) => (
                <div key={team.rosterId}>
                  <h3 style={{ font: "600 1.3rem var(--serif)", margin: "0 0 8px" }}>{team.name}</h3>
                  {team.starters.map((player: any) => (
                    <div key={`${team.rosterId}-${player.slot}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
                      <span className={`position-chip pos-${player.position.toLowerCase()}`}>{player.slot}</span>
                      <div><strong style={{ fontSize: "0.88rem" }}>{displayPlayerName(player.player)}</strong><small style={{ display: "block", color: "var(--ink-soft)" }}>{player.nflTeam} {player.matchup} · {player.kickoff}</small></div>
                      <strong>{player.projectedPoints.toFixed(1)}</strong>
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
          <h1>{team.outlook}</h1>
          <p>The model centers this roster at {team.expectedWins}-{team.expectedLosses}, then replays weekly scoring volatility and a six-team playoff bracket across {forecastInsightsJson.simulationsCount.toLocaleString()} seeded seasons.</p>
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>01</span><h2>Range of outcomes</h2></div>
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
          <div style={{ padding: 18, background: "var(--paper-deep)", borderLeft: "4px solid var(--rust)", marginTop: 16 }}>
            <ClockCounterClockwise size={22} color="var(--rust)" weight="duotone" aria-hidden="true" />
            <strong style={{ display: "block", marginTop: 6 }}>Schedule status</strong>
            <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", lineHeight: 1.5 }}>{forecastInsightsJson.scheduleBasis}</p>
          </div>
          <p className="method-note">Power score {team.powerScore.toFixed(1)} · Simulation seed {forecastInsightsJson.randomSeed}. Forecasts are decision support, not guarantees.</p>
        </section>
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
  if (value === "power" || value === "power-rankings") return { kind: "nav", id: "power" };
  if (value === "matchups") return { kind: "nav", id: "matchups" };
  if (value === "forecast") return { kind: "nav", id: "forecast" };
  if (value === "hall" || value === "cooler") return { kind: "nav", id: "hall" };
  return { kind: "nav", id: "analysis" };
}

function routeHash(route: Route) {
  if (route.kind === "team") return `#team-${route.rank}`;
  if (route.kind === "powerTeam") return `#power-team-${route.rosterId}`;
  if (route.kind === "matchup") return `#matchup-${route.matchupId}`;
  if (route.kind === "forecastTeam") return `#forecast-team-${route.rosterId}`;
  if (route.kind === "methodology") return "#methodology";
  return route.id === "analysis" ? "#analysis" : `#${route.id}`;
}
