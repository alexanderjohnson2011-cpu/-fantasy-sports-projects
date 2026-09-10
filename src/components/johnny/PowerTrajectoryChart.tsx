import React, { useState } from "react";

export interface PowerMilestone {
  id: string;
  label: string;
  date: string;
  description?: string;
}

export interface PowerTrajectoryTeam {
  rosterId: number;
  teamName: string;
  managerName: string;
  color: string;
  currentRank: number;
  preSeasonRank: number;
  rankDelta: number;
  currentScore: number;
  points: number[]; // Ranks across milestones: [rank_pre, rank_kick, rank_cur]
  headline?: string;
  commentary?: string;
}

export interface PowerTrajectoryTimeline {
  milestones: PowerMilestone[];
  teams: PowerTrajectoryTeam[];
  biggestRiser?: PowerTrajectoryTeam;
  biggestFaller?: PowerTrajectoryTeam;
}

export interface PowerTeamTrend {
  preSeasonRank: number;
  kickoffRank: number;
  currentRank: number;
  rankDelta: number;
  preSeasonScore: number;
  currentScore: number;
  scoreDelta: number;
  headline: string;
  commentary: string;
  keyDrivers?: string[];
  trajectory: Array<{
    milestone: string;
    date: string;
    rank: number;
    score: number;
  }>;
}

interface PowerTrajectoryChartProps {
  mode: "league" | "team";
  timeline?: PowerTrajectoryTimeline;
  teamTrend?: PowerTeamTrend;
  teamName?: string;
  managerName?: string;
  teamColor?: string;
  onSelectTeam?: (rosterId: number) => void;
}

// Editorial palette for power ranking lines
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

export default function PowerTrajectoryChart({
  mode,
  timeline,
  teamTrend,
  teamName,
  managerName,
  teamColor,
  onSelectTeam,
}: PowerTrajectoryChartProps) {
  const [hoveredRosterId, setHoveredRosterId] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "contenders" | "movers">("all");

  /* =========================================================================
     MODE 1: SINGLE TEAM DEEP DIVE
     ========================================================================= */
  if (mode === "team" && teamTrend) {
    const trajectory = teamTrend.trajectory || [];
    const color = teamColor || "#0b3329";
    const width = 640;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 80;
    const paddingTop = 24;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Y-axis: Inverted Rank 1 to 12 (Rank 1 at top)
    const minRank = 1;
    const maxRank = 12;

    const getY = (rank: number) => {
      const clamped = Math.max(minRank, Math.min(maxRank, rank));
      return paddingTop + ((clamped - minRank) / (maxRank - minRank)) * chartHeight;
    };

    const getX = (idx: number) => {
      if (trajectory.length <= 1) return paddingLeft + chartWidth / 2;
      return paddingLeft + (idx / (trajectory.length - 1)) * chartWidth;
    };

    const pointsStr = trajectory.map((pt, idx) => `${getX(idx)},${getY(pt.rank)}`).join(" ");

    return (
      <div
        className="jj-power-team-trajectory"
        style={{
          background: "var(--paper-deep, #eee8dc)",
          border: "1px solid var(--hairline)",
          borderRadius: "8px",
          padding: "1.25rem",
          marginTop: "1.25rem",
          marginBottom: "1.5rem",
          boxShadow: "0 2px 8px rgba(11, 51, 41, 0.04)",
        }}
      >
        {/* Header & Badges */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "0.75rem",
            paddingBottom: "0.75rem",
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
                marginBottom: "2px",
              }}
            >
              Week-Over-Week Fluctuation
            </span>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--serif)",
                fontSize: "1.4rem",
                fontWeight: 600,
                color: "var(--ink)",
                lineHeight: 1.15,
              }}
            >
              Power Rank Trajectory: {teamName || managerName}
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--hairline)",
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "0.8rem",
                fontFamily: "var(--sans)",
              }}
            >
              <span style={{ color: "var(--ink-soft)" }}>Draft: </span>
              <strong>#{teamTrend.preSeasonRank}</strong>
              <span style={{ margin: "0 4px", color: "var(--hairline)" }}>→</span>
              <span style={{ color: "var(--ink-soft)" }}>Current: </span>
              <strong style={{ color: color }}>#{teamTrend.currentRank}</strong>
            </div>

            <div
              style={{
                background:
                  teamTrend.rankDelta > 0
                    ? "rgba(46, 125, 50, 0.1)"
                    : teamTrend.rankDelta < 0
                    ? "rgba(196, 67, 34, 0.1)"
                    : "rgba(11, 51, 41, 0.06)",
                border: `1px solid ${
                  teamTrend.rankDelta > 0
                    ? "rgba(46, 125, 50, 0.3)"
                    : teamTrend.rankDelta < 0
                    ? "rgba(196, 67, 34, 0.3)"
                    : "var(--hairline)"
                }`,
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "0.82rem",
                fontWeight: 700,
                fontFamily: "var(--sans)",
                color:
                  teamTrend.rankDelta > 0
                    ? "#2e7d32"
                    : teamTrend.rankDelta < 0
                    ? "var(--rust)"
                    : "var(--ink-soft)",
              }}
            >
              {teamTrend.rankDelta > 0
                ? `▲ +${teamTrend.rankDelta} spot${teamTrend.rankDelta > 1 ? "s" : ""}`
                : teamTrend.rankDelta < 0
                ? `▼ ${teamTrend.rankDelta} spot${Math.abs(teamTrend.rankDelta) > 1 ? "s" : ""}`
                : "● Rank Unchanged"}
            </div>
          </div>
        </div>

        {/* SVG Mini Trajectory Plot */}
        <div
          style={{
            position: "relative",
            width: "100%",
            overflowX: "auto",
            background: "#ffffff",
            borderRadius: "6px",
            border: "1px solid var(--hairline)",
            marginTop: "0.85rem",
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {/* Gridlines */}
            {[1, 3, 6, 9, 12].map((r) => {
              const y = getY(r);
              const isMid = r === 6;
              return (
                <g key={r}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke={isMid ? "rgba(11, 51, 41, 0.15)" : "rgba(11, 51, 41, 0.07)"}
                    strokeDasharray={isMid ? "4 3" : undefined}
                    strokeWidth={1}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="var(--ink-soft)"
                    fontSize="10"
                    fontFamily="var(--sans)"
                    fontWeight="600"
                  >
                    #{r}
                  </text>
                  {isMid && (
                    <text
                      x={width - paddingRight + 8}
                      y={y + 3}
                      fill="var(--ink-soft)"
                      fontSize="9"
                      fontFamily="var(--sans)"
                    >
                      Median (#6.5)
                    </text>
                  )}
                </g>
              );
            })}

            {/* Milestones Vertical Rules */}
            {trajectory.map((pt, idx) => {
              const x = getX(idx);
              return (
                <g key={pt.milestone}>
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={height - paddingBottom}
                    stroke="rgba(11, 51, 41, 0.1)"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={x}
                    y={height - paddingBottom + 16}
                    textAnchor="middle"
                    fill="var(--ink)"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="var(--serif)"
                  >
                    {pt.milestone}
                  </text>
                  <text
                    x={x}
                    y={height - paddingBottom + 28}
                    textAnchor="middle"
                    fill="var(--ink-soft)"
                    fontSize="9"
                    fontFamily="var(--sans)"
                  >
                    {pt.date}
                  </text>
                </g>
              );
            })}

            {/* Trajectory Polyline */}
            <polyline
              points={pointsStr}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Node Dots & Rank Badges */}
            {trajectory.map((pt, idx) => {
              const x = getX(idx);
              const y = getY(pt.rank);
              return (
                <g key={pt.milestone}>
                  <circle cx={x} cy={y} r={7} fill="#ffffff" stroke={color} strokeWidth={2.5} />
                  <circle cx={x} cy={y} r={3.5} fill={color} />
                  <rect
                    x={x - 14}
                    y={y - 20}
                    width={28}
                    height={14}
                    rx={3}
                    fill={color}
                  />
                  <text
                    x={x}
                    y={y - 9.5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="var(--sans)"
                  >
                    #{pt.rank}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* What Changed the Ranking (Commentary Box) */}
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem 1.15rem",
            background: "#ffffff",
            border: "1px solid var(--hairline)",
            borderLeft: `5px solid ${color}`,
            borderRadius: "6px",
            boxShadow: "0 2px 6px rgba(11, 51, 41, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "1.1rem" }}>🔍</span>
            <strong
              style={{
                fontFamily: "var(--serif)",
                fontSize: "1.15rem",
                color: "var(--ink)",
              }}
            >
              What Changed the Ranking
            </strong>
          </div>

          <h4
            style={{
              margin: "6px 0 4px",
              fontFamily: "var(--sans)",
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {teamTrend.headline}
          </h4>

          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              lineHeight: 1.45,
              color: "var(--ink-soft)",
              fontFamily: "var(--sans)",
            }}
          >
            {teamTrend.commentary}
          </p>

          {/* Key Driver Tags */}
          {teamTrend.keyDrivers && teamTrend.keyDrivers.length > 0 && (
            <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {teamTrend.keyDrivers.map((driver, idx) => (
                <span
                  key={idx}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "var(--paper-deep, #eee8dc)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "0.75rem",
                    color: "var(--ink)",
                    fontFamily: "var(--sans)",
                  }}
                >
                  <span style={{ color: "var(--rust)", fontWeight: "bold" }}>•</span> {driver}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* =========================================================================
     MODE 2: LEAGUE-WIDE MACRO OVERVIEW (Main Power Rankings Tab)
     ========================================================================= */
  const milestones = timeline?.milestones || [];
  const rawTeams = timeline?.teams || [];

  const teams: PowerTrajectoryTeam[] = rawTeams.map((t) => ({
    ...t,
    color: EDITORIAL_PALETTE[t.rosterId] || t.color || "#0b3329",
  }));

  const width = 800;
  const height = 340;
  const paddingLeft = 46;
  const paddingRight = 170;
  const paddingTop = 26;
  const paddingBottom = 46;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Inverted Rank 1 to 12
  const minRank = 1;
  const maxRank = 12;

  const getY = (rank: number) => {
    const clamped = Math.max(minRank, Math.min(maxRank, rank));
    return paddingTop + ((clamped - minRank) / (maxRank - minRank)) * chartHeight;
  };

  const getX = (idx: number) => {
    if (milestones.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (idx / (milestones.length - 1)) * chartWidth;
  };

  const visibleTeams = teams.filter((team) => {
    if (selectedFilter === "contenders") return team.currentRank <= 4;
    if (selectedFilter === "movers") return Math.abs(team.rankDelta) > 0;
    return true;
  });

  const activeTeam = teams.find((t) => t.rosterId === hoveredRosterId) || null;

  // Anti-collision label positioning on right edge
  interface PlacedLabel {
    rosterId: number;
    team: PowerTrajectoryTeam;
    idealY: number;
    y: number;
    endX: number;
  }

  const rawLabels: PlacedLabel[] = visibleTeams.map((team) => {
    const lastVal = team.points.length > 0 ? team.points[team.points.length - 1] : team.currentRank;
    const idealY = getY(lastVal);
    return {
      rosterId: team.rosterId,
      team,
      idealY,
      y: idealY,
      endX: getX(team.points.length - 1),
    };
  });

  rawLabels.sort((a, b) => a.idealY - b.idealY);

  const minGap = 16;
  const minYBound = paddingTop + 4;
  const maxYBound = height - paddingBottom - 4;

  for (let i = 1; i < rawLabels.length; i++) {
    if (rawLabels[i].y < rawLabels[i - 1].y + minGap) {
      rawLabels[i].y = rawLabels[i - 1].y + minGap;
    }
  }

  if (rawLabels.length > 0 && rawLabels[rawLabels.length - 1].y > maxYBound) {
    rawLabels[rawLabels.length - 1].y = maxYBound;
    for (let i = rawLabels.length - 2; i >= 0; i--) {
      if (rawLabels[i].y > rawLabels[i + 1].y - minGap) {
        rawLabels[i].y = rawLabels[i + 1].y - minGap;
      }
    }
  }

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
      className="jj-power-league-trajectory"
      style={{
        background: "var(--paper-deep, #eee8dc)",
        border: "1px solid var(--hairline)",
        borderRadius: "8px",
        padding: "1.25rem",
        marginBottom: "1.75rem",
        boxShadow: "0 2px 8px rgba(11, 51, 41, 0.04)",
      }}
    >
      {/* Header & Filter Controls */}
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
            Historical Rank Movement
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
            Week-Over-Week Power Rankings Fluctuation
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--sans)",
              fontSize: "0.85rem",
              color: "var(--ink-soft)",
            }}
          >
            Tracking rank movement across draft day, opening line set, and live game performance adjustments.
          </p>
        </div>

        {/* Filter Pills */}
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
                {filterKey === "all" ? "All 12 Teams" : filterKey === "contenders" ? "Top 4 Contenders" : "Biggest Movers"}
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG League Chart */}
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
          {/* Gridlines */}
          {[1, 2, 4, 6, 8, 10, 12].map((rankVal) => {
            const y = getY(rankVal);
            const isPlayoffLine = rankVal === 6;
            return (
              <g key={rankVal}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight + 12}
                  y2={y}
                  stroke={isPlayoffLine ? "var(--rust)" : "rgba(11, 51, 41, 0.08)"}
                  strokeDasharray={isPlayoffLine ? "4 3" : undefined}
                  strokeWidth={isPlayoffLine ? 1.25 : 1}
                  strokeOpacity={isPlayoffLine ? 0.6 : 1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--ink-soft)"
                  fontSize="10.5"
                  fontFamily="var(--sans)"
                  fontWeight={isPlayoffLine ? "bold" : "600"}
                >
                  #{rankVal}
                </text>
                {isPlayoffLine && (
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
                      PLAYOFF CUT (#6)
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Milestones Columns */}
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

          {/* Team Polylines */}
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
                <polyline points={pointsStr} fill="none" stroke="transparent" strokeWidth={16} />
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={team.color}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeOpacity={isDimmed ? 0.18 : isHovered ? 1.0 : 0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: "all 0.15s ease" }}
                />
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

          {/* Anti-Collision Right Labels */}
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
                <circle
                  cx={placed.endX + 18}
                  cy={placed.y}
                  r={isHovered ? 3.5 : 2}
                  fill={team.color}
                  opacity={isDimmed ? 0.2 : 1.0}
                />
                <text
                  x={placed.endX + 24}
                  y={placed.y + 3.5}
                  fill={isHovered ? "var(--ink)" : isDimmed ? "rgba(11, 51, 41, 0.25)" : team.color}
                  fontSize={isHovered ? "11.5" : "10.5"}
                  fontWeight={isHovered ? "bold" : "600"}
                  fontFamily="var(--sans)"
                >
                  #{team.currentRank} {team.managerName}{" "}
                  {team.rankDelta !== 0 && (
                    <tspan
                      fill={team.rankDelta > 0 ? "#2e7d32" : "var(--rust)"}
                      fontWeight="bold"
                    >
                      ({team.rankDelta > 0 ? `+${team.rankDelta}` : team.rankDelta})
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Team Chips Legend */}
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
              <span style={{ fontWeight: 600 }}>#{team.currentRank} {team.managerName}</span>
              {team.rankDelta !== 0 && (
                <span
                  style={{
                    color: isSelected ? "#cbd5e1" : team.rankDelta > 0 ? "#2e7d32" : "var(--rust)",
                    fontWeight: 700,
                    fontSize: "0.68rem",
                  }}
                >
                  {team.rankDelta > 0 ? `+${team.rankDelta}` : team.rankDelta}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Team Readout Banner */}
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
                #{activeTeam.currentRank} {activeTeam.teamName}
              </strong>
              <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)", fontFamily: "var(--sans)" }}>
                ({activeTeam.managerName})
              </span>
            </div>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.82rem",
                color: "var(--ink-soft)",
                fontFamily: "var(--sans)",
              }}
            >
              {activeTeam.commentary || activeTeam.headline}
            </p>
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
              Net Movement
            </span>
            <strong
              style={{
                fontSize: "1.15rem",
                fontFamily: "var(--sans)",
                color:
                  activeTeam.rankDelta > 0
                    ? "#2e7d32"
                    : activeTeam.rankDelta < 0
                    ? "var(--rust)"
                    : "var(--ink-soft)",
              }}
            >
              {activeTeam.rankDelta > 0
                ? `▲ +${activeTeam.rankDelta} spot`
                : activeTeam.rankDelta < 0
                ? `▼ ${activeTeam.rankDelta} spots`
                : "● Held Rank"}
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
          Hover or tap any line or team chip to inspect why their power ranking moved.
        </div>
      )}

      {/* Riser & Faller Summary Highlights */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        {timeline?.biggestRiser && (
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
              ▲ Top Power Ranking Riser
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
                #{timeline.biggestRiser.currentRank} {timeline.biggestRiser.teamName}
              </strong>
              <strong
                style={{
                  color: "#2e7d32",
                  fontSize: "0.95rem",
                  fontFamily: "var(--sans)",
                  fontWeight: 800,
                }}
              >
                +{timeline.biggestRiser.rankDelta} Spot
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
              {timeline.biggestRiser.headline}
            </p>
          </div>
        )}

        {timeline?.biggestFaller && (
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
              ▼ Sharpest Ranking Shift
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
                #{timeline.biggestFaller.currentRank} {timeline.biggestFaller.teamName}
              </strong>
              <strong
                style={{
                  color: "var(--rust)",
                  fontSize: "0.95rem",
                  fontFamily: "var(--sans)",
                  fontWeight: 800,
                }}
              >
                {timeline.biggestFaller.rankDelta} Spots
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
              {timeline.biggestFaller.headline}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
