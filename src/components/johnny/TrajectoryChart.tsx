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

// Fallback editorial palette if colors are missing or neon
const EDITORIAL_PALETTE: Record<number, string> = {
  8: "#0284c7",   // mannyrsox24 - deep cobalt
  5: "#1b5e20",   // arkinsjt - deep forest green
  6: "#7e22ce",   // Gnomeington - imperial purple
  7: "#b45309",   // bubberdubber - warm burnished amber
  4: "#c2410c",   // kong58 - burnt copper
  3: "#b91c1c",   // DRockefeller - deep crimson
  11: "#0f766e",  // mdwelch11 - deep sea pine/teal
  9: "#4338ca",   // mtrebing31 - deep indigo
  1: "#0e7490",   // jccbraves99 - dark cyan
  12: "#3f6212",  // rLee3D - olive/moss green
  10: "#9f1239",  // akwelch3492 - deep rose/wine
  2: "#475569",   // sduda351 - charcoal slate
};

export default function TrajectoryChart({ timeline, onSelectTeam }: TrajectoryChartProps) {
  const [hoveredRosterId, setHoveredRosterId] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "contenders" | "movers">("all");

  const milestones = timeline.milestones || [];
  const rawTeams = timeline.teams || [];

  // Harmonize colors with editorial palette
  const teams: TrajectoryTeam[] = rawTeams.map((t) => ({
    ...t,
    color: EDITORIAL_PALETTE[t.rosterId] || t.color || "#0b3329",
  }));

  // Chart dimensions & margins
  const width = 800;
  const height = 340;
  const paddingLeft = 46;
  const paddingRight = 170; // Generous margin for anti-collided manager names
  const paddingTop = 26;
  const paddingBottom = 46;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Y-axis range: 1.0 to 11.5 wins
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

  // Filter teams based on selected filter
  const visibleTeams = teams.filter((team) => {
    if (selectedFilter === "contenders") return team.powerRank <= 4;
    if (selectedFilter === "movers") return Math.abs(team.delta) >= 0.2;
    return true;
  });

  const activeTeam = teams.find((t) => t.rosterId === hoveredRosterId) || null;

  // Anti-collision label positioning on right edge
  interface PlacedLabel {
    rosterId: number;
    team: TrajectoryTeam;
    idealY: number;
    y: number;
    endX: number;
  }

  const rawLabels: PlacedLabel[] = visibleTeams.map((team) => {
    const lastVal = team.points.length > 0 ? team.points[team.points.length - 1] : team.currentWins;
    const idealY = getY(lastVal);
    return {
      rosterId: team.rosterId,
      team,
      idealY,
      y: idealY,
      endX: getX(team.points.length - 1),
    };
  });

  // Sort ascending by idealY (from top/highest wins to bottom/lowest wins)
  rawLabels.sort((a, b) => a.idealY - b.idealY);

  const minGap = 16; // minimum pixels between label baselines
  const minYBound = paddingTop + 4;
  const maxYBound = height - paddingBottom - 4;

  // Pass 1: Forward push downwards
  for (let i = 1; i < rawLabels.length; i++) {
    if (rawLabels[i].y < rawLabels[i - 1].y + minGap) {
      rawLabels[i].y = rawLabels[i - 1].y + minGap;
    }
  }

  // Pass 2: Backward pull upwards if overflowing bottom
  if (rawLabels.length > 0 && rawLabels[rawLabels.length - 1].y > maxYBound) {
    rawLabels[rawLabels.length - 1].y = maxYBound;
    for (let i = rawLabels.length - 2; i >= 0; i--) {
      if (rawLabels[i].y > rawLabels[i + 1].y - minGap) {
        rawLabels[i].y = rawLabels[i + 1].y - minGap;
      }
    }
  }

  // Pass 3: Clamp top bounds
  if (rawLabels.length > 0 && rawLabels[0].y < minYBound) {
    rawLabels[0].y = minYBound;
    for (let i = 1; i < rawLabels.length; i++) {
      if (rawLabels[i].y < rawLabels[i - 1].y + minGap) {
        rawLabels[i].y = rawLabels[i - 1].y + minGap;
      }
    }
  }

  const labelMap = new Map<number, PlacedLabel>();
  for (const l of rawLabels) {
    labelMap.set(l.rosterId, l);
  }

  return (
    <div
      className="jj-trajectory-card"
      style={{
        background: "var(--paper-deep, #eee8dc)",
        border: "1px solid var(--hairline)",
        borderRadius: "8px",
        padding: "1.25rem",
        marginBottom: "1.75rem",
        boxShadow: "0 2px 8px rgba(11, 51, 41, 0.04)",
      }}
    >
      {/* Header controls matching Almanac editorial aesthetics */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          paddingBottom: "0.85rem",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div>
          <span
            style={{
              display: "block",
              fontFamily: "var(--sans)",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--rust)",
              marginBottom: "3px",
            }}
          >
            Historical Trend Analysis
          </span>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--serif)",
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--ink)",
              lineHeight: 1.1,
            }}
          >
            Projected Wins Trajectory Over Time
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--sans)",
              fontSize: "0.85rem",
              color: "var(--ink-soft)",
            }}
          >
            Tracking 10,000-run Monte Carlo regular-season win expectations across each model run milestone.
          </p>
        </div>

        {/* Filter Pill Controls */}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            background: "rgba(11, 51, 41, 0.06)",
            padding: "3px",
            borderRadius: "6px",
            border: "1px solid rgba(11, 51, 41, 0.12)",
          }}
        >
          {(["all", "contenders", "movers"] as const).map((filterKey) => {
            const isSelected = selectedFilter === filterKey;
            return (
              <button
                key={filterKey}
                type="button"
                onClick={() => setSelectedFilter(filterKey)}
                style={{
                  background: isSelected ? "var(--ink)" : "transparent",
                  color: isSelected ? "#ffffff" : "var(--ink-soft)",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--sans)",
                  transition: "all 0.15s ease",
                }}
              >
                {filterKey === "all" ? "All 12 Teams" : filterKey === "contenders" ? "Top Contenders" : "Biggest Movers"}
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Chart on Parchment Paper */}
      <div
        style={{
          position: "relative",
          width: "100%",
          overflowX: "auto",
          background: "#ffffff",
          borderRadius: "6px",
          border: "1px solid var(--hairline)",
          marginTop: "1rem",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block", minWidth: "640px" }}
        >
          {/* Background Gridlines */}
          {[2, 4, 6, 7, 8, 10].map((winValue) => {
            const y = getY(winValue);
            const isPlayoffCutoff = winValue === 7;
            return (
              <g key={winValue}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight + 12}
                  y2={y}
                  stroke={isPlayoffCutoff ? "var(--rust)" : "rgba(11, 51, 41, 0.08)"}
                  strokeDasharray={isPlayoffCutoff ? "4 3" : undefined}
                  strokeWidth={isPlayoffCutoff ? 1.25 : 1}
                  strokeOpacity={isPlayoffCutoff ? 0.7 : 1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--ink-soft)"
                  fontSize="10.5"
                  fontFamily="var(--sans)"
                  fontWeight={isPlayoffCutoff ? "bold" : "600"}
                >
                  {winValue}W
                </text>
                {/* Playoff cutoff label on LEFT side to prevent collision with team names */}
                {isPlayoffCutoff && (
                  <g>
                    <rect
                      x={paddingLeft + 6}
                      y={y - 12}
                      width={104}
                      height={14}
                      rx={2}
                      fill="var(--paper, #f6f2e9)"
                      stroke="var(--rust)"
                      strokeWidth={0.75}
                    />
                    <text
                      x={paddingLeft + 10}
                      y={y - 2}
                      fill="var(--rust)"
                      fontSize="8.5"
                      fontFamily="var(--sans)"
                      fontWeight="bold"
                      letterSpacing="0.04em"
                    >
                      PLAYOFF CUT (~7.0W)
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Milestone Columns (X-axis) */}
          {milestones.map((m, idx) => {
            const x = getX(idx);
            return (
              <g key={m.id}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="rgba(11, 51, 41, 0.12)"
                  strokeDasharray="2 2"
                />
                <text
                  x={x}
                  y={height - paddingBottom + 16}
                  textAnchor="middle"
                  fill="var(--ink)"
                  fontSize="11.5"
                  fontWeight="700"
                  fontFamily="var(--serif)"
                >
                  {m.label}
                </text>
                <text
                  x={x}
                  y={height - paddingBottom + 28}
                  textAnchor="middle"
                  fill="var(--ink-soft)"
                  fontSize="9.5"
                  fontFamily="var(--sans)"
                >
                  {m.date}
                </text>
              </g>
            );
          })}

          {/* Team Trajectory Polylines */}
          {visibleTeams.map((team) => {
            const isHovered = hoveredRosterId === team.rosterId;
            const isDimmed = hoveredRosterId !== null && !isHovered;
            const pointsStr = team.points
              .map((val, idx) => `${getX(idx)},${getY(val)}`)
              .join(" ");

            return (
              <g
                key={team.rosterId}
                onMouseEnter={() => setHoveredRosterId(team.rosterId)}
                onMouseLeave={() => setHoveredRosterId(null)}
                onClick={() => onSelectTeam?.(team.rosterId)}
                style={{ cursor: "pointer" }}
              >
                {/* Fat transparent hover target */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                />

                {/* Visible colored trajectory line */}
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={team.color}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeOpacity={isDimmed ? 0.18 : isHovered ? 1.0 : 0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: "stroke-width 0.15s ease, stroke-opacity 0.15s ease" }}
                />

                {/* Milestone Node Dots */}
                {team.points.map((val, idx) => (
                  <circle
                    key={idx}
                    cx={getX(idx)}
                    cy={getY(val)}
                    r={isHovered ? 5 : 3.5}
                    fill={isHovered ? team.color : "#ffffff"}
                    stroke={team.color}
                    strokeWidth={isHovered ? 2 : 1.75}
                    opacity={isDimmed ? 0.2 : 1.0}
                    style={{ transition: "all 0.15s ease" }}
                  />
                ))}
              </g>
            );
          })}

          {/* Anti-Collided Labels on Right Margin */}
          {visibleTeams.map((team) => {
            const placed = labelMap.get(team.rosterId);
            if (!placed) return null;

            const isHovered = hoveredRosterId === team.rosterId;
            const isDimmed = hoveredRosterId !== null && !isHovered;
            const hasShift = Math.abs(placed.y - placed.idealY) > 2;

            return (
              <g
                key={`label-${team.rosterId}`}
                onMouseEnter={() => setHoveredRosterId(team.rosterId)}
                onMouseLeave={() => setHoveredRosterId(null)}
                onClick={() => onSelectTeam?.(team.rosterId)}
                style={{ cursor: "pointer" }}
              >
                {/* Subtle connector guide line when label was nudged to avoid collision */}
                {hasShift && (
                  <path
                    d={`M ${placed.endX + 3} ${placed.idealY} Q ${placed.endX + 12} ${placed.idealY}, ${placed.endX + 14} ${placed.y} L ${placed.endX + 18} ${placed.y}`}
                    fill="none"
                    stroke={team.color}
                    strokeWidth={isHovered ? 1.5 : 0.85}
                    strokeDasharray={isHovered ? undefined : "2 2"}
                    opacity={isDimmed ? 0.15 : isHovered ? 0.9 : 0.55}
                  />
                )}

                {/* Small indicator dot at label anchor */}
                <circle
                  cx={placed.endX + 18}
                  cy={placed.y}
                  r={isHovered ? 3.5 : 2}
                  fill={team.color}
                  opacity={isDimmed ? 0.2 : 1.0}
                />

                {/* Clean, readable text with no collision */}
                <text
                  x={placed.endX + 24}
                  y={placed.y + 3.5}
                  fill={isHovered ? "var(--ink)" : isDimmed ? "rgba(11, 51, 41, 0.25)" : team.color}
                  fontSize={isHovered ? "11.5" : "10.5"}
                  fontWeight={isHovered ? "bold" : "600"}
                  fontFamily="var(--sans)"
                  letterSpacing="-0.01em"
                >
                  {team.managerName}{" "}
                  <tspan
                    fill={isHovered ? "var(--ink)" : isDimmed ? "rgba(11, 51, 41, 0.25)" : "var(--ink-soft)"}
                    fontWeight={isHovered ? "bold" : "500"}
                  >
                    ({team.currentWins}W)
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Team Chips Legend for quick tap / inspection */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          marginTop: "0.75rem",
          padding: "0.4rem 0.25rem",
        }}
      >
        {visibleTeams.map((team) => {
          const isSelected = hoveredRosterId === team.rosterId;
          return (
            <button
              key={team.rosterId}
              type="button"
              onMouseEnter={() => setHoveredRosterId(team.rosterId)}
              onMouseLeave={() => setHoveredRosterId(null)}
              onClick={() => onSelectTeam?.(team.rosterId)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: isSelected ? "var(--ink)" : "#ffffff",
                color: isSelected ? "#ffffff" : "var(--ink)",
                border: "1px solid",
                borderColor: isSelected ? "var(--ink)" : "var(--hairline)",
                borderRadius: "4px",
                padding: "0.2rem 0.45rem",
                fontSize: "0.72rem",
                fontFamily: "var(--sans)",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isSelected ? "#ffffff" : team.color,
                }}
              />
              <span style={{ fontWeight: 600 }}>{team.managerName}</span>
              <span style={{ color: isSelected ? "#cbd5e1" : "var(--ink-soft)", fontSize: "0.68rem" }}>
                {team.currentWins}W
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Team Inspection Banner */}
      {activeTeam ? (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            background: "#ffffff",
            border: "1px solid var(--hairline)",
            borderLeft: `5px solid ${activeTeam.color}`,
            borderRadius: "6px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            boxShadow: "0 2px 6px rgba(11, 51, 41, 0.05)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: activeTeam.color,
                }}
              />
              <strong
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--serif)",
                  fontSize: "1.1rem",
                }}
              >
                {activeTeam.teamName}
              </strong>
              <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)", fontFamily: "var(--sans)" }}>
                ({activeTeam.managerName})
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: "var(--paper-deep, #eee8dc)",
                  border: "1px solid var(--hairline)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: 4,
                  color: "var(--ink)",
                  fontFamily: "var(--sans)",
                }}
              >
                Power #{activeTeam.powerRank}
              </span>
            </div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--ink-soft)",
                marginTop: "0.25rem",
                fontFamily: "var(--sans)",
              }}
            >
              Pre-Season Draft Baseline:{" "}
              <strong style={{ color: "var(--ink)" }}>{activeTeam.preSeasonWins} wins</strong> → Live Current:{" "}
              <strong style={{ color: activeTeam.color }}>{activeTeam.currentWins} wins</strong>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--ink-soft)",
                display: "block",
                fontFamily: "var(--sans)",
              }}
            >
              Net Model Delta
            </span>
            <strong
              style={{
                fontSize: "1.15rem",
                fontFamily: "var(--sans)",
                color: activeTeam.delta > 0 ? "#2e7d32" : activeTeam.delta < 0 ? "var(--rust)" : "var(--ink-soft)",
              }}
            >
              {activeTeam.delta > 0 ? `+${activeTeam.delta} W` : `${activeTeam.delta} W`}
            </strong>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.78rem",
            color: "var(--ink-soft)",
            textAlign: "center",
            background: "transparent",
            border: "1px dashed var(--hairline)",
            borderRadius: "6px",
            fontFamily: "var(--sans)",
          }}
        >
          Hover or tap any line or team chip to inspect trajectory details from draft day to live game action.
        </div>
      )}

      {/* Riser / Faller Highlights matching Almanac section callouts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        {timeline.biggestRiser && (
          <div
            style={{
              background: "rgba(46, 125, 50, 0.05)",
              border: "1px solid rgba(46, 125, 50, 0.25)",
              borderRadius: "6px",
              padding: "0.85rem 1rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "#2e7d32",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: "var(--sans)",
                display: "block",
              }}
            >
              ▲ Top Trajectory Riser
            </span>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: "0.2rem",
              }}
            >
              <strong
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--serif)",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                }}
              >
                {timeline.biggestRiser.teamName}
              </strong>
              <strong
                style={{
                  color: "#2e7d32",
                  fontSize: "0.95rem",
                  fontFamily: "var(--sans)",
                  fontWeight: 800,
                }}
              >
                +{timeline.biggestRiser.delta} W
              </strong>
            </div>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.8rem",
                color: "var(--ink-soft)",
                fontFamily: "var(--sans)",
                lineHeight: 1.35,
              }}
            >
              From {timeline.biggestRiser.preSeasonWins} pre-season to {timeline.biggestRiser.currentWins} projected wins
              after live game action.
            </p>
          </div>
        )}

        {timeline.biggestFaller && (
          <div
            style={{
              background: "rgba(196, 67, 34, 0.05)",
              border: "1px solid rgba(196, 67, 34, 0.25)",
              borderRadius: "6px",
              padding: "0.85rem 1rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--rust)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: "var(--sans)",
                display: "block",
              }}
            >
              ▼ Sharpest Trajectory Shift
            </span>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: "0.2rem",
              }}
            >
              <strong
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--serif)",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                }}
              >
                {timeline.biggestFaller.teamName}
              </strong>
              <strong
                style={{
                  color: "var(--rust)",
                  fontSize: "0.95rem",
                  fontFamily: "var(--sans)",
                  fontWeight: 800,
                }}
              >
                {timeline.biggestFaller.delta} W
              </strong>
            </div>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.8rem",
                color: "var(--ink-soft)",
                fontFamily: "var(--sans)",
                lineHeight: 1.35,
              }}
            >
              From {timeline.biggestFaller.preSeasonWins} pre-season baseline to {timeline.biggestFaller.currentWins} projected
              wins following Drake Maye underperformance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}