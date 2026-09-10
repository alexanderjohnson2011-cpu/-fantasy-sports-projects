import React, { useState } from "react";
import "./johnnys-jerks.css";
import { CapriSunIcon, LifeSaverIcon } from "./components/johnny/CapriSunLifeSaver";
import TrajectoryChart from "./components/johnny/TrajectoryChart";
import PowerTrajectoryChart from "./components/johnny/PowerTrajectoryChart";
import draftRecapJson from "./generated/johnnys-jerks/draft-recap.json";
import powerRankingsJson from "./generated/johnnys-jerks/power-rankings.json";
import matchupsJson from "./generated/johnnys-jerks/matchups-current.json";
import forecastJson from "./generated/johnnys-jerks/forecast-insights.json";

type TabId = "recap" | "power" | "matchups" | "forecast" | "cooler" | "methodology";

export default function JohnnysJerksApp() {
  const [activeTab, setActiveTab] = useState<TabId>("recap");
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const recap = draftRecapJson;
  const power = powerRankingsJson;
  const matchups = matchupsJson;
  const forecast = forecastJson;
  const methodology = recap.methodology;

  const toggleTeam = (rosterId: number) => {
    setExpandedTeam(expandedTeam === rosterId ? null : rosterId);
  };

  return (
    <div className="jj-root">
      {/* Top Navigation */}
      <header className="jj-header">
        <div className="jj-header-inner">
          <div className="jj-brand" onClick={() => setActiveTab("recap")}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <CapriSunIcon size={32} />
              <LifeSaverIcon size={28} />
            </div>
            <div>
              <div className="jj-brand-title">Johnny’s Jerks</div>
              <span className="jj-brand-subtitle">Redraft Post-Draft Desk · 2026</span>
            </div>
          </div>

          <nav className="jj-nav" aria-label="Sections">
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "recap" ? "active" : ""}`}
              onClick={() => setActiveTab("recap")}
            >
              Draft Recap
            </button>
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "power" ? "active" : ""}`}
              onClick={() => setActiveTab("power")}
            >
              Power Rankings
            </button>
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "matchups" ? "active" : ""}`}
              onClick={() => setActiveTab("matchups")}
            >
              Week 1 Matchups
            </button>
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "forecast" ? "active" : ""}`}
              onClick={() => setActiveTab("forecast")}
            >
              Season Forecast
            </button>
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "cooler" ? "active" : ""}`}
              onClick={() => setActiveTab("cooler")}
            >
              The Cooler 🏆
            </button>
            <button
              type="button"
              className={`jj-nav-btn ${activeTab === "methodology" ? "active" : ""}`}
              onClick={() => setActiveTab("methodology")}
            >
              Sources & Methodology 📖
            </button>
            <a
              href="#"
              className="jj-nav-btn"
              style={{
                textDecoration: "none",
                color: "#f6f2e9",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "4px",
                padding: "0.35rem 0.75rem",
                marginLeft: "auto",
                fontWeight: 600,
              }}
            >
              ← Ape’s Mac Salad
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Card */}
      <section className="jj-hero">
        <div className="jj-hero-card">
          <div>
            <div className="jj-hero-tag">
              <span>🧃</span> 2026 Inaugural Post-Draft Issue <span>🍬</span>
            </div>
            <h1 className="jj-hero-heading">
              Punched like a Capri Sun. Sweetened like a Life Saver.
            </h1>
            <p className="jj-hero-desc">
              Welcome to the official post-draft desk for <strong>Johnny’s Jerks</strong>. Zero dynasty baggage, zero future-pick speculation—just 100% pure 2026 redraft draft-value audit powered by the <strong>RosterAudit™ 3-Pillar Framework</strong>, Dynamic VORP positional scarcity, and weekly championship simulations.
            </p>
            <div className="jj-hero-stats">
              <div className="jj-stat-item">
                <span className="jj-stat-num">{recap.summary.draftWinnerGrade}</span>
                <span className="jj-stat-label">Top Grade ({recap.summary.draftWinnerManager})</span>
              </div>
              <div className="jj-stat-item">
                <span className="jj-stat-num">{recap.summary.totalPicks}</span>
                <span className="jj-stat-label">Picks Audited</span>
              </div>
              <div className="jj-stat-item">
                <span className="jj-stat-num">10,000</span>
                <span className="jj-stat-label">Simulations Run</span>
              </div>
              <div className="jj-stat-item">
                <span className="jj-stat-num">3-Pillar</span>
                <span className="jj-stat-label">RosterAudit™ Model</span>
              </div>
            </div>
          </div>
          <img
            src="./assets/johnny/capri_sun_lifesaver.jpg"
            alt="Capri Sun pouch and white Life Saver candy"
            className="jj-hero-art"
          />
        </div>
      </section>

      {/* Main Content Area */}
      <main className="jj-container">
        {activeTab === "recap" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <CapriSunIcon size={26} /> 2026 Post-Draft Report Cards
                </h2>
                <p className="jj-section-desc">
                  Ranked by RosterAudit™ Composite Score: <strong>40% Capital Efficiency (FFC ADP)</strong> · <strong>35% Positional Balance (1QB 2RB 2WR 1TE 2FLEX)</strong> · <strong>25% Star Power (Dynamic VORP)</strong>.
                </p>
              </div>
            </div>

            <div className="jj-grid-teams">
              {recap.teams.map((team: any) => {
                const gradeClass = team.cycleGrade.startsWith("A")
                  ? "jj-grade-a"
                  : team.cycleGrade.startsWith("B")
                  ? "jj-grade-b"
                  : team.cycleGrade.startsWith("C")
                  ? "jj-grade-c"
                  : "jj-grade-d";

                const isExpanded = expandedTeam === team.rosterId;
                const pillars = team.pillars || {};

                return (
                  <article key={team.rosterId} className="jj-team-card">
                    <div className="jj-card-top">
                      <div>
                        <span className="jj-rank-badge">#{team.rank} OVERALL · {team.cycleScore} PTS</span>
                        <h3 className="jj-team-title" style={{ marginTop: "0.25rem" }}>
                          {team.teamName}
                        </h3>
                        <span className="jj-team-manager">Manager: {team.managerName}</span>
                      </div>
                      <span className={`jj-grade-pill ${gradeClass}`}>{team.cycleGrade}</span>
                    </div>

                    <div className="jj-card-headline">{team.narrative.headline}</div>
                    <p className="jj-card-commentary">{team.narrative.commentary}</p>

                    {/* RosterAudit 3-Pillar Progress Breakdown */}
                    <div style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", marginBottom: "0.75rem", fontSize: "0.75rem" }}>
                      <div style={{ fontWeight: 800, color: "#facc15", marginBottom: "0.35rem", display: "flex", justifyContent: "space-between" }}>
                        <span>RosterAudit™ 3-Pillar Breakdown</span>
                        <span style={{ color: "#94a3b8" }}>{pillars.weights}</span>
                      </div>

                      {/* Pillar 1: Capital Efficiency */}
                      <div style={{ marginBottom: "0.3rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "#cbd5e1" }}>Capital Efficiency (40%):</span>
                          <strong style={{ color: "#38bdf8" }}>{pillars.capitalEfficiency} / 100</strong>
                        </div>
                        <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, pillars.capitalEfficiency)}%`, height: "100%", background: "#38bdf8" }} />
                        </div>
                      </div>

                      {/* Pillar 2: Positional Balance */}
                      <div style={{ marginBottom: "0.3rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "#cbd5e1" }}>Positional Balance (35%):</span>
                          <strong style={{ color: "#4ade80" }}>{pillars.positionalBalance} / 100</strong>
                        </div>
                        <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, pillars.positionalBalance)}%`, height: "100%", background: "#4ade80" }} />
                        </div>
                      </div>

                      {/* Pillar 3: Star Power */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "#cbd5e1" }}>Star Power VORP (25%):</span>
                          <strong style={{ color: "#f43f5e" }}>{pillars.starPower} / 100 ({pillars.top5Vorp} VORP)</strong>
                        </div>
                        <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, pillars.starPower)}%`, height: "100%", background: "#f43f5e" }} />
                        </div>
                      </div>
                    </div>

                    <div className="jj-pick-highlights">
                      <div>
                        <span className="jj-steal-badge">🍬 Best Pick:</span>{" "}
                        <span>{team.narrative.bestPick}</span>
                      </div>
                      <div style={{ color: "#94a3b8" }}>
                        <span>⚠️ Big Question:</span> <span>{team.narrative.biggestQuestion}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleTeam(team.rosterId)}
                      style={{
                        marginTop: "0.75rem",
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#38bdf8",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "0.4rem",
                        borderRadius: "0.375rem",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      {isExpanded ? "Hide Draft Picks ▲" : `View ${team.picks?.length || 0} Picks (ADP & Momentum) ▼`}
                    </button>

                    {isExpanded && team.picks && (
                      <div style={{ marginTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.5rem" }}>
                        <div style={{ maxHeight: "280px", overflowY: "auto", fontSize: "0.75rem" }}>
                          {team.picks.map((p: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                padding: "0.4rem 0",
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>
                                  <strong style={{ color: "#facc15" }}>{p.slot}</strong> #{p.overallPick} {p.player} ({p.position} · {p.nflTeam})
                                </span>
                                <span
                                  style={{
                                    color: p.verdict.includes("Steal")
                                      ? "#4ade80"
                                      : p.verdict.includes("Reach")
                                      ? "#f43f5e"
                                      : "#94a3b8",
                                    fontWeight: 700,
                                  }}
                                >
                                  {p.verdict}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.2rem", fontSize: "0.7rem", color: "#94a3b8" }}>
                                <span>FFC ADP: <strong style={{ color: "#ffffff" }}>{p.adp}</strong></span>
                                <span>Surplus: <strong style={{ color: p.surplus >= 0 ? "#4ade80" : "#f43f5e" }}>{p.surplus >= 0 ? `+${p.surplus}` : p.surplus}</strong></span>
                                {p.trend30Day !== 0 && (
                                  <span style={{ color: p.trend30Day > 0 ? "#4ade80" : "#fb7185", fontWeight: 700 }}>
                                    {p.trend30Day > 0 ? `📈 +${p.trend30Day}` : `📉 ${p.trend30Day}`}
                                  </span>
                                )}
                                {p.medicalNote && (
                                  <span style={{ color: "#facc15" }}>🩺 {p.medicalNote}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "power" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <LifeSaverIcon size={26} /> 2026 Redraft Power Rankings
                </h2>
                <p className="jj-section-desc">
                  Evaluated strictly on immediate weekly points projection, Top-5 starter VORP ceiling, and 6-slot bench insurance.
                </p>
              </div>
            </div>

            {(power as any).trendTimeline && (
              <div style={{ marginBottom: "1.5rem" }}>
                <PowerTrajectoryChart
                  mode="league"
                  timeline={(power as any).trendTimeline}
                  onSelectTeam={toggleTeam}
                />
              </div>
            )}

            <table className="jj-forecast-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team & Manager</th>
                  <th>Tier</th>
                  <th>Power Score</th>
                  <th>Grade</th>
                  <th>Proj Wins (MC)</th>
                  <th>Starters Value</th>
                  <th>Star Power VORP</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {power.rankings.map((r: any) => (
                  <tr key={r.rosterId}>
                    <td>
                      <strong style={{ color: r.rank <= 3 ? "#facc15" : "#ffffff", fontSize: "1.1rem" }}>
                        #{r.rank}
                      </strong>
                    </td>
                    <td>
                      <strong style={{ color: "#ffffff", display: "block" }}>{r.teamName}</strong>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{r.managerName}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: r.tier.includes("Championship") ? "#facc15" : r.tier.includes("Playoff") ? "#4ade80" : "#94a3b8",
                        }}
                      >
                        {r.tier}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: "#38bdf8" }}>{r.powerScore}</strong>
                    </td>
                    <td>
                      <strong>{r.grade}</strong>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <strong style={{ color: (r.projectedWins || 0) >= 8.5 ? "#4ade80" : (r.projectedWins || 0) >= 7.0 ? "#38bdf8" : "#facc15", fontSize: "0.95rem" }}>
                          {r.projectedWins !== undefined ? `${r.projectedWins}W` : "—"}
                        </strong>
                        {r.winDelta !== undefined && r.winDelta !== 0 && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: r.winDelta > 0 ? "#4ade80" : "#f43f5e",
                              background: r.winDelta > 0 ? "rgba(74, 222, 128, 0.15)" : "rgba(244, 63, 94, 0.15)",
                              padding: "0.1rem 0.35rem",
                              borderRadius: 4,
                            }}
                          >
                            {r.winDelta > 0 ? `▲ +${r.winDelta}` : `▼ ${r.winDelta}`}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        Pre: {r.preSeasonWins ? `${r.preSeasonWins}W` : "—"}
                      </span>
                    </td>
                    <td>{r.lineupStrength}</td>
                    <td>
                      <strong style={{ color: "#f43f5e" }}>{r.starPowerVorp} pts</strong>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>{r.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "matchups" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <span>🏈</span> Week 1 Opening Slate
                </h2>
                <p className="jj-section-desc">
                  Head-to-head tactical previews, implied score projections, and opening point spreads from the official Sleeper schedule.
                </p>
              </div>
            </div>

            <div>
              {matchups.matchups.map((m: any) => (
                <div key={m.matchupId} className="jj-matchup-card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem", padding: "1.2rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: m.hasLiveResults ? "#f43f5e" : "#38bdf8" }}>
                      {m.hasLiveResults ? "● Live Game Action" : (m.isMarquee ? "Marquee Matchup" : `Matchup 0${m.matchupId}`)}
                    </span>
                    <span className="jj-spread-label" style={{ background: m.hasLiveResults ? "rgba(244, 63, 94, 0.15)" : undefined, color: m.hasLiveResults ? "#f43f5e" : undefined }}>
                      {m.spreadLabel}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "1rem" }}>
                    <div className="jj-matchup-team">
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{m.team1.manager}</span>
                      <strong style={{ fontSize: "1.2rem", color: "#ffffff" }}>{m.team1.name}</strong>
                      <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "#38bdf8" }}>
                        {m.team1.actualScore > 0 ? (
                          <>
                            <strong style={{ color: "#f43f5e" }}>{m.team1.actualScore.toFixed(1)} live</strong> ({m.team1.liveProjectedTotal} proj)
                          </>
                        ) : (
                          <>Projected: <strong>{m.team1.projected} pts</strong></>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#facc15", marginTop: "0.2rem" }}>
                        {m.hasLiveResults ? `${m.team1.liveWinProbability}% live odds` : `Key: ${m.team1.keyPlayer}`}
                      </span>
                    </div>

                    <div className="jj-matchup-vs">
                      <span className="jj-vs-badge">VS</span>
                      <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        O/U: {m.impliedTotal}
                      </span>
                    </div>

                    <div className="jj-matchup-team right">
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{m.team2.manager}</span>
                      <strong style={{ fontSize: "1.2rem", color: "#ffffff" }}>{m.team2.name}</strong>
                      <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "#38bdf8" }}>
                        {m.team2.actualScore > 0 ? (
                          <>
                            <strong style={{ color: "#f43f5e" }}>{m.team2.actualScore.toFixed(1)} live</strong> ({m.team2.liveProjectedTotal} proj)
                          </>
                        ) : (
                          <>Projected: <strong>{m.team2.projected} pts</strong></>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#facc15", marginTop: "0.2rem" }}>
                        {m.hasLiveResults ? `${m.team2.liveWinProbability}% live odds` : `Key: ${m.team2.keyPlayer}`}
                      </span>
                    </div>
                  </div>

                  {m.gameShift && (
                    <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: 6, padding: "0.6rem 0.8rem", borderLeft: "3px solid #f43f5e", fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                      <strong style={{ color: "#ffffff", display: "block", marginBottom: 2 }}>{m.gameShift.headline}</strong>
                      {m.gameShift.shiftSummary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "forecast" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <span>🎲</span> 10,000-Run Monte Carlo Season Forecast
                </h2>
                <p className="jj-section-desc">
                  Simulated outcomes across a 14-week regular season schedule matrix, dynamically factoring in live completed game scoring and starter deltas.
                </p>
              </div>
            </div>

            {/* Interactive Trajectory Line Chart */}
            {forecast.trendTimeline && (
              <TrajectoryChart
                timeline={forecast.trendTimeline}
                onSelectTeam={toggleTeam}
              />
            )}

            <table className="jj-forecast-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Manager</th>
                  <th>Pre-Season</th>
                  <th>Live Exp Wins</th>
                  <th>Net Shift</th>
                  <th>Exp Losses</th>
                  <th>Playoff %</th>
                  <th>Title %</th>
                  <th>Toilet Bowl %</th>
                  <th>Outlook</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(forecast.teams).map((t: any) => (
                  <tr key={t.rosterId}>
                    <td>
                      <strong style={{ color: "#ffffff" }}>{t.teamName}</strong>
                    </td>
                    <td style={{ color: "#94a3b8" }}>{t.managerName}</td>
                    <td style={{ color: "#94a3b8" }}>
                      {t.preSeasonExpectedWins ?? t.expectedWins}W
                    </td>
                    <td>
                      <strong style={{ color: (t.expectedWins || 0) >= 8.5 ? "#4ade80" : (t.expectedWins || 0) >= 7.0 ? "#38bdf8" : "#facc15" }}>
                        {t.expectedWins}W
                      </strong>
                    </td>
                    <td>
                      {t.winDelta !== undefined ? (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: t.winDelta > 0 ? "#4ade80" : t.winDelta < 0 ? "#f43f5e" : "#94a3b8",
                            background: t.winDelta > 0 ? "rgba(74, 222, 128, 0.15)" : t.winDelta < 0 ? "rgba(244, 63, 94, 0.15)" : "rgba(255,255,255,0.05)",
                            padding: "0.15rem 0.4rem",
                            borderRadius: 4,
                          }}
                        >
                          {t.winDelta > 0 ? `▲ +${t.winDelta}W` : t.winDelta < 0 ? `▼ ${t.winDelta}W` : "0.0W"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ color: "#f43f5e" }}>{t.expectedLosses}</td>
                    <td>
                      <strong style={{ color: t.playoffProbability > 60 ? "#4ade80" : "#facc15" }}>
                        {t.playoffProbability}%
                      </strong>
                    </td>
                    <td>
                      <strong style={{ color: t.championshipProbability > 15 ? "#facc15" : "#ffffff" }}>
                        {t.championshipProbability}%
                      </strong>
                    </td>
                    <td style={{ color: t.lastPlaceProbability > 15 ? "#f43f5e" : "#94a3b8" }}>
                      {t.lastPlaceProbability}%
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>{t.outlook}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "cooler" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <span>🧊</span> The Cooler: Post-Draft Superlatives & Awards
                </h2>
                <p className="jj-section-desc">
                  Honoring the sharpest value snipes, wildest reach gambles, and deepest benches in Johnny’s Jerks.
                </p>
              </div>
            </div>

            <div className="jj-awards-grid">
              <div className="jj-award-card">
                <div className="jj-award-icon">🍬</div>
                <h3 className="jj-award-title">{recap.awards.lifeSaverOfDraft.title}</h3>
                <div className="jj-award-winner">
                  {recap.awards.lifeSaverOfDraft.pick?.player} ({recap.awards.lifeSaverOfDraft.pick?.slot})
                </div>
                <p className="jj-award-reason">
                  Selected by <strong>{recap.awards.lifeSaverOfDraft.pick?.team}</strong> ({recap.awards.lifeSaverOfDraft.pick?.manager}).{" "}
                  {recap.awards.lifeSaverOfDraft.reason}
                </p>
              </div>

              <div className="jj-award-card" style={{ borderColor: "rgba(244, 63, 94, 0.4)" }}>
                <div className="jj-award-icon">🧃</div>
                <h3 className="jj-award-title" style={{ color: "#fb7185" }}>
                  {recap.awards.capriSunPouchPunt.title}
                </h3>
                <div className="jj-award-winner">
                  {recap.awards.capriSunPouchPunt.pick?.player} ({recap.awards.capriSunPouchPunt.pick?.slot})
                </div>
                <p className="jj-award-reason">
                  Punted by <strong>{recap.awards.capriSunPouchPunt.pick?.team}</strong> ({recap.awards.capriSunPouchPunt.pick?.manager}).{" "}
                  {recap.awards.capriSunPouchPunt.reason}
                </p>
              </div>

              <div className="jj-award-card" style={{ borderColor: "rgba(74, 222, 128, 0.4)" }}>
                <div className="jj-award-icon">🌿</div>
                <h3 className="jj-award-title" style={{ color: "#4ade80" }}>
                  {recap.awards.mintConditionBench.title}
                </h3>
                <div className="jj-award-winner">{recap.awards.mintConditionBench.team}</div>
                <p className="jj-award-reason">
                  Managed by <strong>{recap.awards.mintConditionBench.manager}</strong>.{" "}
                  {recap.awards.mintConditionBench.reason}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "methodology" && (
          <div>
            <div className="jj-section-header">
              <div>
                <h2 className="jj-section-title">
                  <span>🔬</span> Data Architecture & Scoring Methodology
                </h2>
                <p className="jj-section-desc">
                  Transparent mathematical specification of market inputs, VORP replacement baselines, and RosterAudit™ weighting.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
              {/* Framework Card */}
              <div style={{ background: "var(--jj-card-bg)", border: "1px solid var(--jj-card-border)", borderRadius: "1rem", padding: "1.5rem" }}>
                <h3 style={{ color: "#facc15", marginTop: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <CapriSunIcon size={24} /> RosterAudit™ 3-Pillar Scoring Framework
                </h3>
                <p style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  Every team's draft report card grade (A+ through D) is computed using an objective 3-pillar formula:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.75rem", borderRadius: "0.5rem", borderLeft: "3px solid #38bdf8" }}>
                    <strong style={{ color: "#38bdf8" }}>1. Capital Efficiency (40%)</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "#94a3b8", fontSize: "0.75rem" }}>
                      Evaluates pick selection vs. Fantasy Football Calculator (FFC) consensus Half-PPR ADP tables. Surplus value generates Life Saver Steals; reaches are flagged as Capri Sun Punts.
                    </p>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.75rem", borderRadius: "0.5rem", borderLeft: "3px solid #4ade80" }}>
                    <strong style={{ color: "#4ade80" }}>2. Positional Balance (35%)</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "#94a3b8", fontSize: "0.75rem" }}>
                      Checks harmony across starting slots (1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF) and 6 bench slots. Penalizes over-concentration and structural roster holes.
                    </p>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.75rem", borderRadius: "0.5rem", borderLeft: "3px solid #f43f5e" }}>
                    <strong style={{ color: "#f43f5e" }}>3. Star Power (25%)</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "#94a3b8", fontSize: "0.75rem" }}>
                      Measures top-5 starter VORP ceiling against the league average ({methodology?.leagueAvgTop5Vorp || 454.2} VORP).
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic VORP Card */}
              <div style={{ background: "var(--jj-card-bg)", border: "1px solid var(--jj-card-border)", borderRadius: "1rem", padding: "1.5rem" }}>
                <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <LifeSaverIcon size={24} /> Dynamic VORP Replacement Baselines
                </h3>
                <p style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  Calculated against replacement baselines specifically tailored to this league's 12-team, 2 WR, 2 FLEX configuration:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginTop: "1rem" }}>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>QB (12 Starters)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: QB13 ({methodology?.replacementBaselines?.QB || 260.1} pts)</strong>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>RB (24 Starters + Flex)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: RB38 ({methodology?.replacementBaselines?.RB || 131.4} pts)</strong>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>WR (24 Starters + Flex)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: WR34 ({methodology?.replacementBaselines?.WR || 169.6} pts)</strong>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>TE (12 Starters)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: TE13 ({methodology?.replacementBaselines?.TE || 141.1} pts)</strong>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>Kicker (12 Starters)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: K13 ({methodology?.replacementBaselines?.K || 95.0} pts)</strong>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", padding: "0.6rem", borderRadius: "0.5rem" }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.7rem", display: "block" }}>Defense (12 Starters)</span>
                    <strong style={{ color: "#ffffff" }}>Baseline: DEF13 ({methodology?.replacementBaselines?.DEF || 95.0} pts)</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Sources List */}
            <div style={{ background: "var(--jj-card-bg)", border: "1px solid var(--jj-card-border)", borderRadius: "1rem", padding: "1.5rem" }}>
              <h3 style={{ color: "#ffffff", marginTop: 0, fontSize: "1.1rem" }}>
                Connected Data Ingestion Sources
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                {methodology?.sources?.map((s: any, idx: number) => (
                  <div key={idx} style={{ padding: "0.75rem", background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem", borderLeft: "3px solid #facc15" }}>
                    <strong style={{ color: "#ffffff", fontSize: "0.9rem" }}>{s.name}</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.4 }}>{s.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: "4rem", textAlign: "center", fontSize: "0.8rem", color: "#64748b" }}>
        <div>
          Johnny’s Jerks · 2026 Redraft Post-Draft Almanac · Shared Data Warehouse with Ape’s Mac Salad
        </div>
        <div style={{ marginTop: "0.25rem" }}>
          Punched with Capri Sun · Sweetened with Life Savers
        </div>
      </footer>
    </div>
  );
}
