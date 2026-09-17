import React, { useState } from "react";
import {
  ArrowsLeftRight,
  CurrencyDollar,
  X,
  Sparkle,
  TrendUp,
  TrendDown,
  Tag,
  ClockCounterClockwise,
  CheckCircle,
} from "@phosphor-icons/react";

export interface TeamTransactionDossierProps {
  profile: any;
  allMoves: any[];
  allTrades: any[];
  onClose: () => void;
}

export function TeamTransactionDossier({
  profile,
  allMoves,
  allTrades,
  onClose,
}: TeamTransactionDossierProps) {
  const [filter, setFilter] = useState<"all" | "waivers" | "trades">("all");

  if (!profile) return null;

  const teamMoves = (allMoves || []).filter(
    (m: any) => m.rosterId === profile.rosterId
  );

  const teamTrades = (allTrades || []).filter((trade: any) =>
    trade.teams?.some((t: any) => t.rosterId === profile.rosterId)
  );

  const totalActivityCount = teamMoves.length + teamTrades.length;

  return (
    <section className="team-dossier-panel" id="team-dossier-panel">
      {/* 1. Header with Close Button */}
      <div className="team-dossier-header">
        <div className="team-dossier-identity">
          <div className="team-dossier-eyebrow">
            <Sparkle size={13} weight="fill" />
            <span>Franchise Transaction Intelligence & Asset Audit</span>
          </div>
          <div className="team-dossier-name-row">
            <h2 className="team-dossier-title">{profile.teamName}</h2>
            <span className="archetype-chip">{profile.archetype}</span>
          </div>
          <div className="team-dossier-manager">
            Managed by <strong>{profile.manager}</strong> · Roster #{profile.rosterId}
          </div>
        </div>

        <button
          type="button"
          className="team-dossier-close-btn"
          onClick={onClose}
          aria-label="Close dossier"
          title="Close dossier"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {/* 2. Executive Commentary & Strategic Benefit Callout */}
      {profile.commentary && (
        <div className="team-dossier-commentary-banner">
          <div className="team-dossier-commentary-header">
            <span className="team-dossier-commentary-tag">
              Executive Transaction Audit & Strategic Impact
            </span>
            <span className="team-dossier-verified-pill">
              <CheckCircle size={13} weight="fill" /> Verified Analytics
            </span>
          </div>
          <p className="team-dossier-commentary-text">{profile.commentary}</p>
        </div>
      )}

      {/* 3. Portfolio Summary Metrics */}
      <div className="team-dossier-metrics-grid">
        <div className="team-dossier-metric-card">
          <span className="team-dossier-metric-label">FAAB Capital</span>
          <div className="team-dossier-metric-val">
            ${profile.faabRemaining}
            <span className="team-dossier-metric-sub"> / $100</span>
          </div>
          <span className="team-dossier-metric-footnote">
            ${profile.faabSpent} spent across {profile.totalMoves} move(s)
          </span>
        </div>

        <div className="team-dossier-metric-card">
          <span className="team-dossier-metric-label">Wire Scoring Yield</span>
          <div className="team-dossier-metric-val">
            {profile.pointsContributed?.toFixed(1) ?? "0.0"} pts
          </div>
          <span className="team-dossier-metric-footnote">
            {profile.starterPoints?.toFixed(1) ?? "0.0"} pts from starters
          </span>
        </div>

        <div className="team-dossier-metric-card">
          <span className="team-dossier-metric-label">Completed Deals</span>
          <div className="team-dossier-metric-val">{profile.tradesCount ?? 0}</div>
          <span className="team-dossier-metric-footnote">
            {profile.tradesCount > 0 ? "Multi-asset exchanges" : "Zero trades logged"}
          </span>
        </div>

        <div className="team-dossier-metric-card">
          <span className="team-dossier-metric-label">Net Trade Points</span>
          <div
            className={`team-dossier-metric-val ${
              (profile.netTradePoints || 0) > 0
                ? "is-pos"
                : (profile.netTradePoints || 0) < 0
                ? "is-neg"
                : ""
            }`}
          >
            {(profile.netTradePoints || 0) > 0 ? "+" : ""}
            {profile.netTradePoints?.toFixed(1) ?? "0.0"} pts
          </div>
          <span className="team-dossier-metric-footnote">
            {(profile.netTradeVorp || 0) > 0 ? "+" : ""}
            {profile.netTradeVorp?.toFixed(1) ?? "0.0"} net VORP
          </span>
        </div>

        <div className="team-dossier-metric-card">
          <span className="team-dossier-metric-label">Net Dynasty Capital</span>
          <div
            className={`team-dossier-metric-val ${
              (profile.netDynastyDelta || 0) > 0
                ? "is-pos"
                : (profile.netDynastyDelta || 0) < 0
                ? "is-neg"
                : ""
            }`}
          >
            {(profile.netDynastyDelta || 0) > 0 ? "+" : ""}
            {profile.netDynastyDelta?.toLocaleString() ?? "0"} val
          </div>
          <span className="team-dossier-metric-footnote">
            Consensus player + draft equity
          </span>
        </div>
      </div>

      {/* 4. Sub-Navigation Filter */}
      <div className="team-dossier-subnav">
        <button
          type="button"
          className={`team-dossier-subnav-btn ${filter === "all" ? "is-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          <span>All Activity</span>
          <span className="count-badge">{totalActivityCount}</span>
        </button>
        <button
          type="button"
          className={`team-dossier-subnav-btn ${filter === "waivers" ? "is-active" : ""}`}
          onClick={() => setFilter("waivers")}
        >
          <CurrencyDollar size={15} />
          <span>Waiver & FA Moves</span>
          <span className="count-badge">{teamMoves.length}</span>
        </button>
        <button
          type="button"
          className={`team-dossier-subnav-btn ${filter === "trades" ? "is-active" : ""}`}
          onClick={() => setFilter("trades")}
        >
          <ArrowsLeftRight size={15} />
          <span>Completed Trades</span>
          <span className="count-badge">{teamTrades.length}</span>
        </button>
      </div>

      {/* 5. Waiver Wire Pickups Section */}
      {(filter === "all" || filter === "waivers") && (
        <div className="team-dossier-section">
          <div className="team-dossier-section-header">
            <CurrencyDollar size={16} weight="bold" />
            <h3>Waiver Wire Additions & Free Agent Claims ({teamMoves.length})</h3>
          </div>

          {teamMoves.length === 0 ? (
            <div className="team-dossier-empty">
              No waiver claims or free agent signings logged for this franchise yet.
              Full budget preserved.
            </div>
          ) : (
            <div className="team-dossier-moves-list">
              {teamMoves.map((m: any, idx: number) => {
                const isFmtType = m.type ? m.type.toUpperCase() : "FREE_AGENT";
                return (
                  <div
                    key={`${m.transactionId || idx}-${m.playerId}`}
                    className="team-dossier-move-card"
                  >
                    <div className="team-dossier-move-top">
                      <div className="team-dossier-player-headline">
                        <span className={`grade-pill ${m.gradeClass || "grade-c"}`}>
                          {m.grade || "C"}
                        </span>
                        <div>
                          <strong className="team-dossier-player-name">
                            {m.playerName}
                          </strong>
                          <span className="team-dossier-player-tags">
                            <span className="trade-pos-tag">{m.position}</span>
                            <span className="nfl-team-tag">{m.nflTeam}</span>
                            <span className="acquired-tag">
                              Week {m.acquiredWeek} · {isFmtType} (${m.bid} FAAB)
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="team-dossier-badges">
                        {m.gradeTitle && (
                          <span className="team-dossier-grade-title">
                            {m.gradeTitle}
                          </span>
                        )}
                        <span className={`roi-badge ${m.verdictClass || ""}`}>
                          {m.verdictBadge || "Add"}
                        </span>
                      </div>
                    </div>

                    {/* Stats strip */}
                    <div className="team-dossier-stats-strip">
                      <div className="dossier-stat-item">
                        <span>Production</span>
                        <strong>{m.totalPoints?.toFixed(1) ?? "0.0"} pts</strong>
                      </div>
                      <div className="dossier-stat-item">
                        <span>Starter Yield</span>
                        <strong>
                          {m.starterPoints?.toFixed(1) ?? "0.0"} pts ({m.startsCount} st)
                        </strong>
                      </div>
                      <div className="dossier-stat-item">
                        <span>Yield / $</span>
                        <strong>
                          {m.pointsPerDollar > 0 ? `${m.pointsPerDollar}x` : "—"}
                        </strong>
                      </div>
                      <div className="dossier-stat-item">
                        <span>Current Role</span>
                        <strong>{m.currentRole}</strong>
                      </div>
                      <div className="dossier-stat-item">
                        <span>Roster Status</span>
                        <strong
                          style={{
                            color: m.isStillRostered ? "#2e7d32" : "var(--rust)",
                          }}
                        >
                          {m.isStillRostered ? "Active on Roster" : "Cut / Dropped"}
                        </strong>
                      </div>
                    </div>

                    {/* Forensic commentary */}
                    {(m.commentary || m.narrativeNote) && (
                      <div className="team-dossier-move-commentary">
                        <strong>Franchise Move Audit:</strong>{" "}
                        {m.commentary || m.narrativeNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Completed Trades Section */}
      {(filter === "all" || filter === "trades") && (
        <div className="team-dossier-section">
          <div className="team-dossier-section-header">
            <ArrowsLeftRight size={16} weight="bold" />
            <h3>Completed Franchise Trades & Deal Audits ({teamTrades.length})</h3>
          </div>

          {teamTrades.length === 0 ? (
            <div className="team-dossier-empty">
              This franchise has executed zero trades this season. All roster capital
              has been retained or built solely via the draft and waiver wire.
            </div>
          ) : (
            <div className="team-dossier-trades-list">
              {teamTrades.map((trade: any) => {
                const teamSide = trade.teams?.find(
                  (t: any) => t.rosterId === profile.rosterId
                );
                const partnerSides =
                  trade.teams?.filter(
                    (t: any) => t.rosterId !== profile.rosterId
                  ) || [];
                const partnerNames = partnerSides
                  .map((p: any) => `${p.teamName} (${p.manager})`)
                  .join(", ");

                if (!teamSide) return null;

                const netDiff = teamSide.netPoints || 0;
                const isPos = netDiff > 0;
                const isNeg = netDiff < 0;

                return (
                  <div key={trade.tradeId} className="team-dossier-trade-card">
                    <div className="trade-audit-header">
                      <div className="trade-audit-meta">
                        <span
                          className={`trade-week-pill ${
                            trade.isPreseason ? "is-preseason" : ""
                          }`}
                        >
                          {trade.period ||
                            (trade.isPreseason
                              ? "Preseason"
                              : `Week ${trade.leg}`)}
                        </span>
                        <span>{trade.date}</span>
                        <span className="trade-partner-label">
                          Trade Partner: <strong>{partnerNames || "League"}</strong>
                        </span>
                        {teamSide.grade && (
                          <div
                            className={`trade-team-grade-chip ${
                              teamSide.gradeClass || "grade-b"
                            }`}
                          >
                            <span className="trade-grade-letter">
                              {teamSide.grade}
                            </span>
                            <span className="trade-grade-title">
                              {teamSide.gradeTitle}
                            </span>
                          </div>
                        )}
                      </div>
                      <span
                        className={`trade-verdict-badge ${trade.verdictClass || ""}`}
                      >
                        {trade.verdict}
                      </span>
                    </div>

                    <div className="team-dossier-trade-body">
                      {/* Acquired Assets */}
                      <div className="trade-asset-section">
                        <span className="trade-asset-label">Acquired Assets</span>
                        <div className="trade-asset-chips">
                          {teamSide.receivedPlayers?.map((p: any) => (
                            <span key={p.id} className="trade-player-chip">
                              <span className="trade-pos-tag">{p.position}</span>
                              <span className="trade-player-name">{p.name}</span>
                              <span className="trade-pts-tag">
                                +{p.points.toFixed(1)} pts ({p.starts} st)
                              </span>
                              {p.vorp !== undefined && (
                                <span
                                  className={`trade-vorp-tag ${
                                    p.vorp >= 0 ? "is-pos" : "is-neg"
                                  }`}
                                  title="Value Over Replacement Player"
                                >
                                  {p.vorp > 0
                                    ? `+${p.vorp.toFixed(1)}`
                                    : p.vorp.toFixed(1)}{" "}
                                  VORP
                                </span>
                              )}
                              {p.dynastyValue ? (
                                <span
                                  className="trade-dynasty-chip"
                                  title={`Dynasty Rank #${p.dynastyRank || "N/A"}`}
                                >
                                  <span className="trade-dynasty-val">
                                    {p.dynastyValue.toLocaleString()} val
                                  </span>
                                  {p.dynastyDelta !== undefined &&
                                    p.dynastyDelta !== 0 && (
                                      <span
                                        className={`trade-dynasty-delta ${
                                          p.dynastyDelta > 0 ? "is-up" : "is-down"
                                        }`}
                                      >
                                        {p.dynastyDelta > 0
                                          ? `▲ +${p.dynastyDelta}`
                                          : `▼ ${p.dynastyDelta}`}
                                      </span>
                                    )}
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {teamSide.receivedPicks?.map(
                            (pick: string, pidx: number) => {
                              const detail =
                                teamSide.receivedPicksDetails?.[pidx];
                              const dp = detail?.draftedPlayer;
                              return (
                                <span key={pidx} className="trade-pick-chip">
                                  <span>🎟️ {pick}</span>
                                  {dp ? (
                                    <span className="trade-drafted-player">
                                      <span className="trade-drafted-arrow">➔</span>
                                      <span className="trade-drafted-slot">
                                        #{dp.pickSlot}
                                      </span>
                                      <strong className="trade-drafted-name">
                                        {dp.playerName}
                                      </strong>
                                      <span className="trade-drafted-pos">
                                        {dp.position}
                                      </span>
                                      {dp.points > 0 ? (
                                        <span className="trade-drafted-pts">
                                          +{dp.points.toFixed(1)} pts ({dp.starts} st)
                                        </span>
                                      ) : (
                                        <span className="trade-drafted-pts is-zero">
                                          0.0 pts
                                        </span>
                                      )}
                                      {dp.vorp !== undefined && (
                                        <span
                                          className={`trade-vorp-tag ${
                                            dp.vorp >= 0 ? "is-pos" : "is-neg"
                                          }`}
                                          title="Rookie VORP"
                                        >
                                          {dp.vorp > 0
                                            ? `+${dp.vorp.toFixed(1)}`
                                            : dp.vorp.toFixed(1)}{" "}
                                          VORP
                                        </span>
                                      )}
                                      {dp.dynastyValue ? (
                                        <span className="trade-dynasty-chip">
                                          <span className="trade-dynasty-val">
                                            {dp.dynastyValue.toLocaleString()} val
                                          </span>
                                          {dp.dynastyDelta !== undefined &&
                                            dp.dynastyDelta !== 0 && (
                                              <span
                                                className={`trade-dynasty-delta ${
                                                  dp.dynastyDelta > 0
                                                    ? "is-up"
                                                    : "is-down"
                                                }`}
                                              >
                                                {dp.dynastyDelta > 0
                                                  ? `▲ +${dp.dynastyDelta}`
                                                  : `▼ ${dp.dynastyDelta}`}
                                              </span>
                                            )}
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : detail?.dynastyValue ? (
                                    <span
                                      className="trade-dynasty-chip"
                                      style={{ marginLeft: 4 }}
                                      title="Consensus Future Pick Market Value"
                                    >
                                      <span className="trade-dynasty-val">
                                        {detail.dynastyValue.toLocaleString()} val
                                      </span>
                                    </span>
                                  ) : null}
                                </span>
                              );
                            }
                          )}
                          {teamSide.receivedFaab > 0 && (
                            <span className="trade-faab-chip">
                              💰 +${teamSide.receivedFaab} FAAB
                            </span>
                          )}
                          {!teamSide.receivedPlayers?.length &&
                            !teamSide.receivedPicks?.length &&
                            !teamSide.receivedFaab && (
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  color: "var(--ink-soft)",
                                }}
                              >
                                None
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Surrendered Assets */}
                      <div className="trade-asset-section">
                        <span className="trade-asset-label">
                          Surrendered Assets
                        </span>
                        <div className="trade-asset-chips">
                          {teamSide.sentPlayers?.map((p: any) => (
                            <span
                              key={p.id}
                              className="trade-player-chip is-surrendered"
                            >
                              <span
                                className="trade-pos-tag"
                                style={{ background: "#666" }}
                              >
                                {p.position}
                              </span>
                              <span className="trade-player-name">{p.name}</span>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--ink-soft)",
                                }}
                              >
                                ({p.points.toFixed(1)} pts)
                              </span>
                              {p.vorp !== undefined && (
                                <span
                                  className="trade-vorp-tag is-surrendered"
                                  title="Surrendered VORP"
                                >
                                  {p.vorp > 0
                                    ? `+${p.vorp.toFixed(1)}`
                                    : p.vorp.toFixed(1)}{" "}
                                  VORP
                                </span>
                              )}
                              {p.dynastyValue ? (
                                <span
                                  className="trade-dynasty-chip is-surrendered"
                                  title="Surrendered Market Value"
                                >
                                  <span className="trade-dynasty-val">
                                    {p.dynastyValue.toLocaleString()} val
                                  </span>
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {teamSide.sentPicks?.map(
                            (pick: string, pidx: number) => {
                              const detail = teamSide.sentPicksDetails?.[pidx];
                              const dp = detail?.draftedPlayer;
                              return (
                                <span
                                  key={pidx}
                                  className="trade-pick-chip is-surrendered"
                                >
                                  <span>🎟️ {pick}</span>
                                  {dp ? (
                                    <span className="trade-drafted-player">
                                      <span className="trade-drafted-arrow">➔</span>
                                      <span className="trade-drafted-slot">
                                        #{dp.pickSlot}
                                      </span>
                                      <span className="trade-drafted-name">
                                        {dp.playerName}
                                      </span>
                                      <span className="trade-drafted-pos">
                                        {dp.position}
                                      </span>
                                      {dp.points > 0 ? (
                                        <span className="trade-drafted-pts">
                                          ({dp.points.toFixed(1)} pts)
                                        </span>
                                      ) : (
                                        <span className="trade-drafted-pts is-zero">
                                          0.0 pts
                                        </span>
                                      )}
                                      {dp.dynastyValue ? (
                                        <span className="trade-dynasty-chip is-surrendered">
                                          <span className="trade-dynasty-val">
                                            {dp.dynastyValue.toLocaleString()} val
                                          </span>
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : detail?.dynastyValue ? (
                                    <span
                                      className="trade-dynasty-chip is-surrendered"
                                      style={{ marginLeft: 4 }}
                                    >
                                      <span className="trade-dynasty-val">
                                        {detail.dynastyValue.toLocaleString()} val
                                      </span>
                                    </span>
                                  ) : null}
                                </span>
                              );
                            }
                          )}
                          {teamSide.sentFaab > 0 && (
                            <span
                              className="trade-faab-chip"
                              style={{ opacity: 0.85 }}
                            >
                              💰 -${teamSide.sentFaab} FAAB
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Multi-Pillar Net Return Strip */}
                      <div className="trade-net-return-strip">
                        <div className="trade-return-details">
                          <div className="trade-return-row">
                            <span className="trade-return-label">On-Field:</span>
                            <span className="trade-return-value">
                              {teamSide.totalRealizedPoints !== undefined &&
                              teamSide.rookiePointsReceived > 0 ? (
                                <>
                                  <strong>
                                    {teamSide.totalRealizedPoints.toFixed(1)} pts
                                  </strong>{" "}
                                  ({teamSide.totalRealizedStarts} st)
                                </>
                              ) : (
                                <>
                                  <strong>
                                    {teamSide.totalPointsReceived.toFixed(1)} pts
                                  </strong>{" "}
                                  ({teamSide.startsReceived} st)
                                </>
                              )}
                            </span>
                            {teamSide.totalVorp !== undefined && (
                              <span
                                className={`trade-return-vorp ${
                                  teamSide.totalVorp >= 0 ? "is-pos" : "is-neg"
                                }`}
                              >
                                ({teamSide.totalVorp > 0
                                  ? `+${teamSide.totalVorp.toFixed(1)}`
                                  : teamSide.totalVorp.toFixed(1)}{" "}
                                VORP)
                              </span>
                            )}
                          </div>

                          {teamSide.totalDynastyValue !== undefined &&
                            teamSide.totalDynastyValue > 0 && (
                              <div className="trade-return-row">
                                <span className="trade-return-label">
                                  Dynasty Equity:
                                </span>
                                <span className="trade-return-value">
                                  <strong>
                                    {teamSide.totalDynastyValue.toLocaleString()} val
                                  </strong>
                                </span>
                                {teamSide.totalDynastyDelta !== undefined &&
                                  teamSide.totalDynastyDelta !== 0 && (
                                    <span
                                      className={`trade-equity-delta ${
                                        teamSide.totalDynastyDelta > 0
                                          ? "is-up"
                                          : "is-down"
                                      }`}
                                    >
                                      ({teamSide.totalDynastyDelta > 0
                                        ? `▲ +${teamSide.totalDynastyDelta}`
                                        : `▼ ${teamSide.totalDynastyDelta}`}{" "}
                                      trend)
                                    </span>
                                  )}
                                {teamSide.netDynastyEquity !== undefined && (
                                  <span
                                    className={`trade-net-equity-tag ${
                                      teamSide.netDynastyEquity >= 0
                                        ? "is-surplus"
                                        : "is-deficit"
                                    }`}
                                  >
                                    Net:{" "}
                                    {teamSide.netDynastyEquity > 0
                                      ? `+${teamSide.netDynastyEquity.toLocaleString()}`
                                      : teamSide.netDynastyEquity.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}

                          {teamSide.strategicRole && (
                            <div className="trade-strategic-role-tag">
                              {teamSide.strategicRole}
                            </div>
                          )}
                        </div>

                        <div className="trade-badge-col">
                          {teamSide.statusBadge ? (
                            <span
                              className={`trade-net-delta is-${
                                teamSide.statusType ||
                                (isPos ? "positive" : isNeg ? "negative" : "even")
                              }`}
                            >
                              {teamSide.statusBadge}
                            </span>
                          ) : (
                            <span
                              className={`trade-net-delta ${
                                isPos
                                  ? "is-positive"
                                  : isNeg
                                  ? "is-negative"
                                  : "is-even"
                              }`}
                            >
                              Net:{" "}
                              {netDiff > 0
                                ? `+${netDiff.toFixed(1)}`
                                : netDiff.toFixed(1)}{" "}
                              pts
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Forensic commentary for this team */}
                      {teamSide.commentary && (
                        <div className="trade-team-commentary">
                          <strong>Franchise Trade Audit:</strong>{" "}
                          {teamSide.commentary}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default TeamTransactionDossier;
