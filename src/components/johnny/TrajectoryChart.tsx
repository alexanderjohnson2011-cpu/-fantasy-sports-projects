import React, { useState } from "react";

export interface TrajectoryPoint {
  milestone: string;
  date: string;
  expectedWins: number;
  playoffOdds?: number;
  rank?: number;
  event?: string;
}

export interface TrajectoryTeam {
  rosterId: number;
  teamName: string;
  managerName: string;
  color: string;
  powerRank: number;
  preSeasonWins: number;
  currentWins: number;
  delta: number;
  points: number[];
}

export interface TrajectoryChartProps {
  timeline: {
    milestones: Array<{ id: string; label: string; date: string; description: string }>;
    teams: TrajectoryTeam[];
    biggestRiser?: TrajectoryTeam;
    biggestFaller?: TrajectoryTeam;
  };
  onSelectTeam?: (rosterId: number) => void;
}

export default function TrajectoryChart({ timeline, onSelectTeam }: TrajectoryChartProps) {
  const [hoveredRosterId, setHoveredRosterId] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "contenders" | "movers">("all");

  const milestones = timeline.milestones || [];
  const teams = timeline.teams || [];

  // Chart dimensions & scaling
  const width = 740;
  const height = 300;
  const paddingLeft = 50;
  const paddingRight = 140;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Y-axis range: 1 to 11.5 wins
  const minY = 1.0;
  const maxY = 11.5;

  const getY = (wins: number) => {
    const clamped = Math.max(minY, Math.min(maxY, wins));
    return paddingTop + chartHeight - ((clamped - minY) / (maxY - minY)) * chartHeight;
  };

  const getX = (index: number) => {
    if (milestones.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (milestones.length - 1)) * chartWidth;
  };

  // Filter teams based on view
  const visibleTeams = teams.filter((team) => {
    if (selectedFilter === "contenders") return team.powerRank <= 4;
    if (selectedFilter === "movers") return Math.abs(team.delta) >= 0.2;
    return true;
  });

  const activeTeam = teams.find((t) => t.rosterId === hoveredRosterId) || null;

  return (
    <div className="jj-trajectory-wrap" style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
      {/* Header controls */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>📈</span>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#ffffff" }}>
              Projected Wins Trajectory Over Time
            </h3>
          </div>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
            Tracking 10,000-run Monte Carlo regular-season win expectations across each model run milestone.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.35rem" }}>
          {(["all", "contenders", "movers"] as const).map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setSelectedFilter(filterKey)}
              style={{
                background: selectedFilter === filterKey ? "#38bdf8" : "rgba(30, 41, 59, 0.8)",
                color: selectedFilter === filterKey ? "#0f172a" : "#cbd5e1",
                border: "1px solid",
                borderColor: selectedFilter === filterKey ? "#38bdf8" : "rgba(255,255,255,0.1)",
                borderRadius: 6,
                padding: "0.3rem 0.65rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {filterKey === "all" ? "All 12 Teams" : filterKey === "contenders" ? "Top Contenders" : "Biggest Movers"}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id="gridFade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {[2, 4, 6, 7, 8, 10].map((winValue) => {
            const y = getY(winValue);
            const isPlayoffCutoff = winValue === 7;
            return (
              <g key={winValue}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke={isPlayoffCutoff ? "rgba(250, 204, 21, 0.35)" : "rgba(255, 255, 255, 0.08)"}
                  strokeDasharray={isPlayoffCutoff ? "4 4" : undefined}
                  strokeWidth={isPlayoffCutoff ? 1.5 : 1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={isPlayoffCutoff ? "#facc15" : "#64748b"}
                  fontSize="10"
                  fontFamily="inherit"
                  fontWeight={isPlayoffCutoff ? "bold" : "normal"}
                >
                  {winValue}W
                </text>
                {isPlayoffCutoff && (
                  <text
                    x={width - paddingRight + 6}
                    y={y + 3}
                    fill="#facc15"
                    fontSize="9"
                    fontFamily="inherit"
                    fontWeight="bold"
                  >
                    Playoff Cut line (~7.0W)
                  </text>
                )}
              </g>
            );
          })}

          {/* Milestone Columns */}
          {milestones.map((m, idx) => {
            const x = getX(idx);
            return (
              <g key={m.id}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeDasharray="2 2"
                />
                <text
                  x={x}
                  y={height - paddingBottom + 16}
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="inherit"
                >
                  {m.label}
                </text>
                <text
                  x={x}
                  y={height - paddingBottom + 28}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="inherit"
                >
                  {m.date}
                </text>
              </g>
            );
          })}

          {/* Team Trajectory Lines */}
          {visibleTeams.map((team) => {
            const isHovered = hoveredRosterId === team.rosterId;
            const isDimmed = hoveredRosterId !== null && !isHovered;
            const pointsStr = team.points
              .map((val, idx) => `${getX(idx)},${getY(val)}`)
              .join(" ");

            const endX = getX(team.points.length - 1);
            const endY = getY(team.points[team.points.length - 1]);

            return (
              <g
                key={team.rosterId}
                onMouseEnter={() => setHoveredRosterId(team.rosterId)}
                onMouseLeave={() => setHoveredRosterId(null)}
                onClick={() => onSelectTeam?.(team.rosterId)}
                style={{ cursor: "pointer" }}
              >
                {/* Invisible wider stroke for easy hover targeting */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                />

                {/* Visible Trajectory Line */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={team.color}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeOpacity={isDimmed ? 0.18 : isHovered ? 1.0 : 0.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: "all 0.15s ease" }}
                />

                {/* Milestone Node Dots */}
                {team.points.map((val, idx) => (
                  <circle
                    key={idx}
                    cx={getX(idx)}
                    cy={getY(val)}
                    r={isHovered ? 5 : 3.5}
                    fill={isHovered ? "#ffffff" : team.color}
                    stroke={team.color}
                    strokeWidth={isHovered ? 2 : 1}
                    opacity={isDimmed ? 0.18 : 1.0}
                    style={{ transition: "all 0.15s ease" }}
                  />
                ))}

                {/* Team Label on Right Margin */}
                <text
                  x={endX + 8}
                  y={endY + 3.5}
                  fill={isHovered ? "#ffffff" : isDimmed ? "rgba(148, 163, 184, 0.25)" : team.color}
                  fontSize={isHovered ? "11" : "10"}
                  fontWeight={isHovered ? "bold" : "500"}
                  fontFamily="inherit"
                >
                  {team.managerName} ({team.currentWins}W)
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Active Selection Tooltip / Detail Readout */}
      {activeTeam ? (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "rgba(30, 41, 59, 0.9)", borderLeft: `4px solid ${activeTeam.color}`, borderRadius: 6, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: activeTeam.color }} />
              <strong style={{ color: "#ffffff", fontSize: "0.95rem" }}>{activeTeam.teamName}</strong>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>({activeTeam.managerName})</span>
              <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "0.15rem 0.4rem", borderRadius: 4, color: "#cbd5e1" }}>
                Power #{activeTeam.powerRank}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: "0.25rem" }}>
              Pre-Season Draft Baseline: <strong style={{ color: "#ffffff" }}>{activeTeam.preSeasonWins} wins</strong> → Live Current: <strong style={{ color: activeTeam.color }}>{activeTeam.currentWins} wins</strong>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Net Model Delta</span>
            <strong style={{ fontSize: "1.1rem", color: activeTeam.delta > 0 ? "#4ade80" : activeTeam.delta < 0 ? "#f43f5e" : "#cbd5e1" }}>
              {activeTeam.delta > 0 ? `+${activeTeam.delta} W` : `${activeTeam.delta} W`}
            </strong>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#64748b", textAlign: "center", background: "rgba(15, 23, 42, 0.4)", borderRadius: 6 }}>
          Hover or tap any line to inspect a team's trajectory from draft day to live game action.
        </div>
      )}

      {/* Riser / Faller Highlights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
        {timeline.biggestRiser && (
          <div style={{ background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.2)", borderRadius: 8, padding: "0.7rem 0.9rem" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase" }}>
              ▲ Top Trajectory Riser
            </span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "0.2rem" }}>
              <strong style={{ color: "#ffffff", fontSize: "0.9rem" }}>{timeline.biggestRiser.teamName}</strong>
              <strong style={{ color: "#4ade80", fontSize: "0.9rem" }}>+{timeline.biggestRiser.delta} W</strong>
            </div>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
              From {timeline.biggestRiser.preSeasonWins} pre-season to {timeline.biggestRiser.currentWins} projected wins after live game action.
            </p>
          </div>
        )}

        {timeline.biggestFaller && (
          <div style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.2)", borderRadius: 8, padding: "0.7rem 0.9rem" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#f43f5e", textTransform: "uppercase" }}>
              ▼ Sharpest Trajectory Shift
            </span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "0.2rem" }}>
              <strong style={{ color: "#ffffff", fontSize: "0.9rem" }}>{timeline.biggestFaller.teamName}</strong>
              <strong style={{ color: "#f43f5e", fontSize: "0.9rem" }}>{timeline.biggestFaller.delta} W</strong>
            </div>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
              From {timeline.biggestFaller.preSeasonWins} pre-season baseline to {timeline.biggestFaller.currentWins} projected wins following Drake Maye underperformance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}