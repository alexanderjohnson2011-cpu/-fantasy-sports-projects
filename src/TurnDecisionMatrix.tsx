import React, { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import {
  Sparkle,
  Copy,
  Key,
  CheckCircle,
  XCircle,
  WarningCircle,
  Compass,
  ChatCircleDots,
  ShieldCheck,
  UsersThree,
  Eye,
  Lightning,
  Target,
  DownloadSimple,
  Table,
  ShareNetwork,
  FileImage,
  Trophy,
  Check
} from "@phosphor-icons/react";
import { DraftState } from "./draft-api";
import {
  DecisionMatrixData,
  MyTeamAudit,
  ManagerScoutDossier,
  LeagueDraftSummary,
  LeagueDraftMatrixEntry,
  getBaselineDecisionMatrix,
  fetchAiDecisionMatrix,
  askAiStrategist,
  computeMyTeamAudit,
  computeManagerDossier,
  computeLeagueDraftSummary,
  getAiApiKey,
  setAiApiKey,
} from "./ai-strategist";

interface Props {
  state: DraftState;
  onSelectPlayer?: (playerId: string) => void;
}

// Lightweight markdown renderer for rich AI analysis (tables, headers, bold, lists)
function renderFormattedTake(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = (keyPrefix: number) => {
    if (tableRows.length === 0) return null;
    const header = tableRows[0];
    const dataRows = tableRows.slice(1).filter(r => !r.every(c => c.trim().match(/^:?-+:?$/)));
    const tableEl = (
      <div key={`table-${keyPrefix}`} style={{ overflowX: "auto", margin: "12px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", background: "rgba(15, 23, 42, 0.7)" }}>
          <thead>
            <tr style={{ background: "rgba(30, 41, 59, 0.9)", borderBottom: "2px solid #38bdf8" }}>
              {header.map((col, cIdx) => (
                <th key={cIdx} style={{ padding: "8px 12px", textAlign: "left", color: "#38bdf8", fontWeight: 700 }}>
                  {col.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} style={{ borderBottom: "1px solid #334155", background: rIdx % 2 === 1 ? "rgba(30, 41, 59, 0.4)" : "transparent" }}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: "8px 12px", color: "#e2e8f0" }}>
                    {formatInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
    return tableEl;
  };

  const formatInline = (str: string): React.ReactNode => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} style={{ color: "#f8fafc", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Table line: | col 1 | col 2 |
    if (line.startsWith("|") && line.endsWith("|")) {
      inTable = true;
      const cells = line.split("|").slice(1, -1);
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      elements.push(flushTable(i));
    }

    if (!line) {
      elements.push(<div key={`sp-${i}`} style={{ height: "6px" }} />);
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} style={{ margin: "14px 0 6px", fontSize: "1.05rem", fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: "6px" }}>
          {formatInline(line.replace("### ", ""))}
        </h4>
      );
    } else if (line.startsWith("#### ")) {
      elements.push(
        <h5 key={i} style={{ margin: "10px 0 4px", fontSize: "0.92rem", fontWeight: 700, color: "#fde68a" }}>
          {formatInline(line.replace("#### ", ""))}
        </h5>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <div key={i} style={{ margin: "10px 0", padding: "8px 14px", background: "rgba(14, 165, 233, 0.15)", borderLeft: "4px solid #38bdf8", borderRadius: "0 8px 8px 0", color: "#f0f9ff", fontSize: "0.85rem", fontStyle: "italic" }}>
          {formatInline(line.replace("> ", ""))}
        </div>
      );
    } else if (line.startsWith("* ") || line.startsWith("- ")) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "4px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>
          <span style={{ color: "#38bdf8" }}>•</span>
          <div>{formatInline(line.substring(2))}</div>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "4px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>
          <span style={{ color: "#fbbf24", fontWeight: 700 }}>{match ? match[1] + "." : "•"}</span>
          <div>{formatInline(match ? match[2] : line)}</div>
        </div>
      );
    } else if (line === "---") {
      elements.push(<hr key={i} style={{ borderColor: "#334155", margin: "10px 0" }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: "4px 0", fontSize: "0.85rem", color: "#e2e8f0", lineHeight: 1.55 }}>
          {formatInline(line)}
        </p>
      );
    }
  }

  if (inTable) {
    elements.push(flushTable(lines.length));
  }

  return elements;
}

export const TurnDecisionMatrix: React.FC<Props> = ({ state, onSelectPlayer }) => {
  const [activeTab, setActiveTab] = useState<"matrix" | "myteam" | "managers" | "league_matrix">("matrix");
  const [matrix, setMatrix] = useState<DecisionMatrixData>(() => getBaselineDecisionMatrix(state));
  const [loadingAi, setLoadingAi] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customKey, setCustomKey] = useState(getAiApiKey());
  const [copyToast, setCopyToast] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [copyTextToast, setCopyTextToast] = useState(false);
  const [matrixViewMode, setMatrixViewMode] = useState<"iphone" | "table">("iphone");
  const exportCardRef = useRef<HTMLDivElement>(null);
  const iphoneCardRef = useRef<HTMLDivElement>(null);
  const tableCardRef = useRef<HTMLDivElement>(null);

  // Selected manager for Opponent Intelligence tab (defaults to turn rival Slot 12 or Slot 11)
  const [selectedManagerSlot, setSelectedManagerSlot] = useState<number>(12);

  // Interactive Chat State
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  // Computed Team, Manager, and League Matrix states
  const myTeamAudit: MyTeamAudit = computeMyTeamAudit(state);
  const selectedManagerDossier: ManagerScoutDossier = computeManagerDossier(state, selectedManagerSlot);
  const leagueSummary: LeagueDraftSummary = computeLeagueDraftSummary(state);

  const handleDownloadIphoneCard = async () => {
    const cardEl = iphoneCardRef.current || document.getElementById("iphone-share-card");
    if (!cardEl) return;
    setDownloadingPng(true);
    try {
      const canvas = await html2canvas(cardEl, {
        scale: 2,
        backgroundColor: "#070c18",
        useCORS: true,
        logging: false
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeLeagueName = (leagueSummary.leagueName || "Draft").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `${safeLeagueName}_iPhone_Text_Report_Card.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error exporting iPhone draft card PNG:", err);
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleDownloadTableCard = async () => {
    const cardEl = tableCardRef.current || document.getElementById("league-matrix-export-card");
    if (!cardEl) return;
    setDownloadingPng(true);
    try {
      const canvas = await html2canvas(cardEl, {
        scale: 2,
        backgroundColor: "#070c18",
        useCORS: true,
        logging: false
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeLeagueName = (leagueSummary.leagueName || "Draft").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `${safeLeagueName}_Draft_Grades_Matrix_Pick_${state.draft.currentPick}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error exporting table matrix PNG:", err);
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleCopyGroupText = () => {
    navigator.clipboard.writeText(leagueSummary.groupTextSummary).then(() => {
      setCopyTextToast(true);
      setTimeout(() => setCopyTextToast(false), 2500);
    });
  };

  // Automatically update baseline and trigger AI refinement on pick change
  useEffect(() => {
    const base = getBaselineDecisionMatrix(state);
    setMatrix(base);

    let mounted = true;
    setLoadingAi(true);
    fetchAiDecisionMatrix(state).then((aiData) => {
      if (mounted) {
        setMatrix(aiData);
        setLoadingAi(false);
      }
    }).catch(() => {
      if (mounted) setLoadingAi(false);
    });

    return () => { mounted = false; };
  }, [state.draft.currentPick, state.events.length]);

  const handleManualRefresh = async () => {
    setLoadingAi(true);
    try {
      const fresh = await fetchAiDecisionMatrix(state);
      setMatrix(fresh);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleCopySummary = () => {
    const summary = `🎯 MOOSEY'S MOMMY · TURN DECISION MATRIX (PICK ${matrix.turnInfo.userPick})
Drought: ${matrix.turnInfo.droughtLength} picks until Pick ${matrix.turnInfo.nextTurnPick}
Anchor: ${matrix.turnInfo.anchorPlayer || "N/A"}

GATE: ${matrix.coreGate.question}

✅ PLAN A (${matrix.planA.badge}): ${matrix.planA.title}
Target: ${matrix.planA.primaryTarget.name} (${matrix.planA.primaryTarget.pos} - ${matrix.planA.primaryTarget.team})
R3/R4 Horizon: ${matrix.planA.horizonR3R4}

⚡ PLAN B (${matrix.planB.badge}): ${matrix.planB.title}
Target: ${matrix.planB.primaryTarget.name} (${matrix.planB.primaryTarget.pos} - ${matrix.planB.primaryTarget.team})
R3/R4 Horizon: ${matrix.planB.horizonR3R4}

🔥 PLAN C (${matrix.planC.badge}): ${matrix.planC.title}
Target: ${matrix.planC.primaryTarget.name} (${matrix.planC.primaryTarget.pos} - ${matrix.planC.primaryTarget.team})
R3/R4 Horizon: ${matrix.planC.horizonR3R4}

Briefing: ${matrix.executiveNarrative}
(Powered by ${matrix.provider})`;

    navigator.clipboard.writeText(summary).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    });
  };

  interface ChatEntry {
    id: string;
    sender: "user" | "strategist";
    text: string;
    timestamp: string;
  }

  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([
    {
      id: "init",
      sender: "strategist",
      text: `### 🎙️ Senior War Room Strategist Active (Pick 15)
You enter your Round 2 turn with **James Cook (RB - BUF)** locked in as your Hero RB anchor. 
With Pick 12 & 13 on the clock and an upcoming **19-pick blackout** until Pick 34, ask any strategic question—such as player comparisons, blackout survival targets, or trade evaluations—and I'll break it down using the live draft metrics.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const handleAskQuestion = async (q: string) => {
    const query = q || chatQuestion;
    if (!query.trim()) return;
    const userMsg: ChatEntry = {
      id: "u-" + Date.now(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatQuestion("");
    setChatLoading(true);

    try {
      const reply = await askAiStrategist(state, query);
      const stratMsg: ChatEntry = {
        id: "s-" + Date.now(),
        sender: "strategist",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, stratMsg]);
      setChatReply(reply);
    } catch {
      // handled
    } finally {
      setChatLoading(false);
    }
  };

  const isPlayerAvailable = (name: string) => {
    return !state.events.some(e => e.player_name.toLowerCase().includes(name.toLowerCase()));
  };

  const draftedPickNo = (name: string) => {
    const event = state.events.find(e => e.player_name.toLowerCase().includes(name.toLowerCase()));
    return event ? event.pick_no : null;
  };

  const slotManagers = (state.session.league_settings_json as any)?.slotManagers || {};
  const numTeams = state.session.num_teams || 12;

  return (
    <section className="war-room-matrix-card" style={{
      background: "linear-gradient(180deg, #0e172a 0%, #080d1a 100%)",
      borderRadius: "16px",
      border: "1px solid #1e293b",
      boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
      padding: "20px",
      marginBottom: "24px",
      color: "#f8fafc",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* Top Header & Navigation Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "matrix" ? "rgba(14, 165, 233, 0.25)" : "transparent",
              color: activeTab === "matrix" ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${activeTab === "matrix" ? "#0ea5e9" : "#334155"}`,
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <Target size={16} /> Turn Decision Matrix
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("myteam")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "myteam" ? "rgba(16, 185, 129, 0.25)" : "transparent",
              color: activeTab === "myteam" ? "#34d399" : "#94a3b8",
              border: `1px solid ${activeTab === "myteam" ? "#10b981" : "#334155"}`,
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <ShieldCheck size={16} /> My Roster & Risk Audit
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("managers")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "managers" ? "rgba(245, 158, 11, 0.25)" : "transparent",
              color: activeTab === "managers" ? "#fbbf24" : "#94a3b8",
              border: `1px solid ${activeTab === "managers" ? "#f59e0b" : "#334155"}`,
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <UsersThree size={16} /> Opponent Intel & Pick Grades
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("league_matrix")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "league_matrix" ? "rgba(168, 85, 247, 0.25)" : "transparent",
              color: activeTab === "league_matrix" ? "#c084fc" : "#94a3b8",
              border: `1px solid ${activeTab === "league_matrix" ? "#a855f7" : "#334155"}`,
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <Table size={16} /> Draft Matrix & Text Card
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loadingAi}
            title="Refresh AI Strategy"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            <Sparkle size={15} color={loadingAi ? "#38bdf8" : "#94a3b8"} className={loadingAi ? "animate-spin" : ""} />
            {loadingAi ? "Analyzing..." : "Refresh AI"}
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            title="Copy decision summary to clipboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            <Copy size={15} />
            {copyToast ? "Copied!" : "Share"}
          </button>

          <button
            type="button"
            onClick={() => setShowKeyModal(!showKeyModal)}
            title="Configure Gemini API Key"
            style={{
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "6px 8px",
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            <Key size={15} />
          </button>
        </div>
      </div>

      {/* Key Configuration Popover */}
      {showKeyModal && (
        <div style={{
          background: "#1e293b",
          border: "1px solid #475569",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px"
        }}>
          <label style={{ fontSize: "0.8rem", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
            Google AI Studio API Key (Free tier verified):
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder="AIzaSy... or AQ.Ab8..."
              style={{
                flex: 1,
                background: "#0f172a",
                border: "1px solid #334155",
                color: "#f8fafc",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.85rem"
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAiApiKey(customKey);
                setShowKeyModal(false);
                handleManualRefresh();
              }}
              style={{
                background: "#0ea5e9",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer"
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: TURN DECISION MATRIX */}
      {/* ======================================================== */}
      {activeTab === "matrix" && (
        <>
          {/* Turn Inflection Bar */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "10px",
            marginBottom: "18px"
          }}>
            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(51, 65, 85, 0.8)",
              borderRadius: "10px",
              padding: "10px 14px"
            }}>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Anchor Locked</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
                {matrix.turnInfo.anchorPlayer || "Pending Pick 10"}
              </div>
            </div>

            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(14, 165, 233, 0.5)",
              borderRadius: "10px",
              padding: "10px 14px"
            }}>
              <div style={{ fontSize: "0.72rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700 }}>Current Selection</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", marginTop: "2px" }}>
                Pick {matrix.turnInfo.userPick} · Round {matrix.turnInfo.round}
              </div>
            </div>

            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              borderRadius: "10px",
              padding: "10px 14px"
            }}>
              <div style={{ fontSize: "0.72rem", color: "#fb7185", textTransform: "uppercase", fontWeight: 700 }}>Next Pick Blackout</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fda4af", marginTop: "2px" }}>
                Pick {matrix.turnInfo.nextTurnPick} ({matrix.turnInfo.droughtLength}-Pick Drought)
              </div>
            </div>
          </div>

          {/* Strategic Executive Narrative */}
          <div style={{
            background: "rgba(15, 23, 42, 0.7)",
            borderLeft: "4px solid #38bdf8",
            borderRadius: "0 10px 10px 0",
            padding: "14px 16px",
            marginBottom: "20px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Compass size={17} color="#38bdf8" weight="duotone" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                War Room Intelligence · {matrix.provider}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5, color: "#cbd5e1" }}>
              {matrix.executiveNarrative}
            </p>
            {matrix.droughtWarning && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "0.8rem", color: "#f59e0b" }}>
                <WarningCircle size={15} />
                <span>{matrix.droughtWarning}</span>
              </div>
            )}
          </div>

          {/* Visual Core Decision Gate */}
          <div style={{
            textAlign: "center",
            padding: "14px 18px",
            background: "radial-gradient(ellipse at center, rgba(14, 165, 233, 0.18) 0%, rgba(15, 23, 42, 0.8) 100%)",
            border: "1px solid rgba(56, 189, 248, 0.5)",
            borderRadius: "12px",
            marginBottom: "20px",
            boxShadow: "0 0 20px rgba(14, 165, 233, 0.15)"
          }}>
            <div style={{ fontSize: "0.72rem", color: "#7dd3fc", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em" }}>
              Core Decision Gate
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", marginTop: "4px" }}>
              {matrix.coreGate.question}
            </div>
          </div>

          {/* Decision Pathways Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
            marginBottom: "20px"
          }}>
            {/* Plan A: Recommended */}
            <div style={{
              background: "rgba(6, 78, 59, 0.2)",
              border: "1px solid rgba(16, 185, 129, 0.5)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, background: "#10b981", color: "#022c22", padding: "2px 8px", borderRadius: "4px" }}>
                  {matrix.planA.badge}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#6ee7b7", fontWeight: 600 }}>{matrix.planA.condition}</span>
              </div>

              <h3 style={{ margin: "4px 0 10px", fontSize: "1.1rem", fontWeight: 800, color: "#ecfdf5" }}>
                {matrix.planA.title}
              </h3>

              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                borderRadius: "8px",
                padding: "10px 12px",
                marginBottom: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ background: "#065f46", color: "#6ee7b7", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                      {matrix.planA.primaryTarget.pos}
                    </span>
                    <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>{matrix.planA.primaryTarget.name}</strong>
                    <small style={{ color: "#94a3b8" }}>{matrix.planA.primaryTarget.team}</small>
                  </div>
                  <div>
                    {isPlayerAvailable(matrix.planA.primaryTarget.name) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#34d399", fontSize: "0.75rem", fontWeight: 700 }}>
                        <CheckCircle size={14} weight="fill" /> Available
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#f87171", fontSize: "0.75rem", fontWeight: 700 }}>
                        <XCircle size={14} weight="fill" /> Taken #{draftedPickNo(matrix.planA.primaryTarget.name)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "0.75rem", color: "#94a3b8" }}>
                  <span>ADP: <strong style={{ color: "#e2e8f0" }}>{matrix.planA.primaryTarget.adp.toFixed(1)}</strong></span>
                  <span>Proj: <strong style={{ color: "#e2e8f0" }}>{matrix.planA.primaryTarget.projPts.toFixed(1)}</strong></span>
                  <span>VORP: <strong style={{ color: "#34d399" }}>+{matrix.planA.primaryTarget.vorp.toFixed(1)}</strong></span>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: "14px" }}>
                {matrix.planA.bullets.map((b, idx) => (
                  <div key={idx} style={{ fontSize: "0.82rem", color: "#cbd5e1", marginBottom: "6px", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#34d399", fontWeight: 700 }}>✓</span>
                    <div><strong style={{ color: "#f1f5f9" }}>{b.label}:</strong> {b.text}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: "rgba(2, 44, 34, 0.6)",
                borderTop: "1px dashed rgba(52, 211, 153, 0.4)",
                padding: "8px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                color: "#a7f3d0"
              }}>
                <strong>Rounds 3 & 4 Horizon:</strong> {matrix.planA.horizonR3R4}
              </div>
            </div>

            {/* Plan B: Bully RB Punch */}
            <div style={{
              background: "rgba(120, 53, 15, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.5)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, background: "#f59e0b", color: "#451a03", padding: "2px 8px", borderRadius: "4px" }}>
                  {matrix.planB.badge}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#fde68a", fontWeight: 600 }}>{matrix.planB.condition}</span>
              </div>

              <h3 style={{ margin: "4px 0 10px", fontSize: "1.1rem", fontWeight: 800, color: "#fffbeb" }}>
                {matrix.planB.title}
              </h3>

              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                borderRadius: "8px",
                padding: "10px 12px",
                marginBottom: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ background: "#78350f", color: "#fde68a", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                      {matrix.planB.primaryTarget.pos}
                    </span>
                    <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>{matrix.planB.primaryTarget.name}</strong>
                    <small style={{ color: "#94a3b8" }}>{matrix.planB.primaryTarget.team}</small>
                  </div>
                  <div>
                    {isPlayerAvailable(matrix.planB.primaryTarget.name) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#fbbf24", fontSize: "0.75rem", fontWeight: 700 }}>
                        <CheckCircle size={14} weight="fill" /> Available
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#f87171", fontSize: "0.75rem", fontWeight: 700 }}>
                        <XCircle size={14} weight="fill" /> Taken #{draftedPickNo(matrix.planB.primaryTarget.name)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "0.75rem", color: "#94a3b8" }}>
                  <span>ADP: <strong style={{ color: "#e2e8f0" }}>{matrix.planB.primaryTarget.adp.toFixed(1)}</strong></span>
                  <span>Proj: <strong style={{ color: "#e2e8f0" }}>{matrix.planB.primaryTarget.projPts.toFixed(1)}</strong></span>
                  <span>VORP: <strong style={{ color: "#fbbf24" }}>+{matrix.planB.primaryTarget.vorp.toFixed(1)}</strong></span>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: "14px" }}>
                {matrix.planB.bullets.map((b, idx) => (
                  <div key={idx} style={{ fontSize: "0.82rem", color: "#cbd5e1", marginBottom: "6px", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#fbbf24", fontWeight: 700 }}>★</span>
                    <div><strong style={{ color: "#fef3c7" }}>{b.label}:</strong> {b.text}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: "rgba(69, 26, 3, 0.6)",
                borderTop: "1px dashed rgba(251, 191, 36, 0.4)",
                padding: "8px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                color: "#fde68a"
              }}>
                <strong>Rounds 3 & 4 Horizon:</strong> {matrix.planB.horizonR3R4}
              </div>
            </div>

            {/* Plan C: Positional Advantage */}
            <div style={{
              background: "rgba(88, 28, 135, 0.2)",
              border: "1px solid rgba(168, 85, 247, 0.5)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, background: "#a855f7", color: "#3b0764", padding: "2px 8px", borderRadius: "4px" }}>
                  {matrix.planC.badge}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#e9d5ff", fontWeight: 600 }}>{matrix.planC.condition}</span>
              </div>

              <h3 style={{ margin: "4px 0 10px", fontSize: "1.1rem", fontWeight: 800, color: "#faf5ff" }}>
                {matrix.planC.title}
              </h3>

              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(192, 132, 252, 0.3)",
                borderRadius: "8px",
                padding: "10px 12px",
                marginBottom: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ background: "#581c87", color: "#e9d5ff", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                      {matrix.planC.primaryTarget.pos}
                    </span>
                    <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>{matrix.planC.primaryTarget.name}</strong>
                    <small style={{ color: "#94a3b8" }}>{matrix.planC.primaryTarget.team}</small>
                  </div>
                  <div>
                    {isPlayerAvailable(matrix.planC.primaryTarget.name) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#c084fc", fontSize: "0.75rem", fontWeight: 700 }}>
                        <CheckCircle size={14} weight="fill" /> Available
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#f87171", fontSize: "0.75rem", fontWeight: 700 }}>
                        <XCircle size={14} weight="fill" /> Taken #{draftedPickNo(matrix.planC.primaryTarget.name)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "0.75rem", color: "#94a3b8" }}>
                  <span>ADP: <strong style={{ color: "#e2e8f0" }}>{matrix.planC.primaryTarget.adp.toFixed(1)}</strong></span>
                  <span>Proj: <strong style={{ color: "#e2e8f0" }}>{matrix.planC.primaryTarget.projPts.toFixed(1)}</strong></span>
                  <span>VORP: <strong style={{ color: "#c084fc" }}>+{matrix.planC.primaryTarget.vorp.toFixed(1)}</strong></span>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: "14px" }}>
                {matrix.planC.bullets.map((b, idx) => (
                  <div key={idx} style={{ fontSize: "0.82rem", color: "#cbd5e1", marginBottom: "6px", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#c084fc", fontWeight: 700 }}>♦</span>
                    <div><strong style={{ color: "#f5f3ff" }}>{b.label}:</strong> {b.text}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: "rgba(59, 7, 100, 0.6)",
                borderTop: "1px dashed rgba(192, 132, 252, 0.4)",
                padding: "8px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                color: "#e9d5ff"
              }}>
                <strong>Rounds 3 & 4 Horizon:</strong> {matrix.planC.horizonR3R4}
              </div>
            </div>
          </div>

          {/* Interactive AI Strategist Q&A Panel - Conversational War Room Stream */}
          <div style={{
            background: "#0b1329",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "16px",
            marginTop: "16px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ChatCircleDots size={20} color="#38bdf8" weight="duotone" />
                <strong style={{ fontSize: "0.95rem", color: "#f8fafc" }}>War Room Strategist Q&A</strong>
                <span style={{ background: "rgba(14, 165, 233, 0.2)", color: "#38bdf8", fontSize: "0.72rem", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
                  LIVE
                </span>
              </div>
              <small style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Powered by Gemini 3.8 / 3.1 Flash & App VORP Engine</small>
            </div>

            {/* Quick-Prompt Chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
              {[
                "detailed breakdown of puka vs. jefferson",
                "What if Puka is taken at 13?",
                "Should I pivot to Ashton Jeanty (Bully RB)?",
                "Who will survive the 19-pick drought to 34?",
                "Should I reach for Josh Allen at 15?"
              ].map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  onClick={() => handleAskQuestion(promptText)}
                  disabled={chatLoading}
                  style={{
                    background: "rgba(30, 41, 59, 0.8)",
                    color: "#94a3b8",
                    border: "1px solid #334155",
                    borderRadius: "14px",
                    padding: "4px 12px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#38bdf8"; e.currentTarget.style.color = "#f8fafc"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.color = "#94a3b8"; }}
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Chat Messages Stream */}
            <div style={{
              maxHeight: "520px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              padding: "12px",
              background: "#080d1a",
              borderRadius: "10px",
              border: "1px solid #1e293b",
              marginBottom: "14px"
            }}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                    maxWidth: msg.sender === "user" ? "80%" : "100%",
                    width: msg.sender === "strategist" ? "100%" : "auto"
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                    fontSize: "0.72rem",
                    color: "#64748b",
                    alignSelf: msg.sender === "user" ? "flex-end" : "flex-start"
                  }}>
                    {msg.sender === "user" ? (
                      <span>You · {msg.timestamp}</span>
                    ) : (
                      <>
                        <span style={{ color: "#38bdf8", fontWeight: 700 }}>War Room Strategist</span>
                        <span>· {msg.timestamp}</span>
                      </>
                    )}
                  </div>

                  <div style={{
                    background: msg.sender === "user" ? "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" : "#0f172a",
                    border: msg.sender === "user" ? "1px solid #2563eb" : "1px solid #1e293b",
                    borderLeft: msg.sender === "strategist" ? "4px solid #38bdf8" : undefined,
                    borderRadius: msg.sender === "user" ? "12px 12px 2px 12px" : "4px 12px 12px 12px",
                    padding: msg.sender === "user" ? "8px 14px" : "14px 16px",
                    color: "#f8fafc",
                    fontSize: "0.85rem",
                    lineHeight: 1.6
                  }}>
                    {msg.sender === "user" ? (
                      msg.text
                    ) : (
                      renderFormattedTake(msg.text)
                    )}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  background: "#0f172a",
                  borderLeft: "4px solid #38bdf8",
                  borderRadius: "4px 12px 12px 12px",
                  color: "#94a3b8",
                  fontSize: "0.85rem"
                }}>
                  <Sparkle size={16} color="#38bdf8" className="animate-spin" />
                  <span>Analyzing draft board, VORP models, and player tiers...</span>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion(chatQuestion);
              }}
              style={{ display: "flex", gap: "8px" }}
            >
              <input
                type="text"
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                placeholder="Ask detailed breakdowns, pivots, trade values, or draft strategies..."
                style={{
                  flex: 1,
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#f8fafc",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.88rem"
                }}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatQuestion.trim()}
                style={{
                  background: "#0284c7",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: (chatLoading || !chatQuestion.trim()) ? 0.6 : 1
                }}
              >
                {chatLoading ? "Analyzing..." : "Ask Coach"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MY TEAM ROSTER & RISK AUDIT */}
      {/* ======================================================== */}
      {activeTab === "myteam" && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          {/* Header Card */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(30, 41, 59, 0.5)",
            border: "1px solid #334155",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "18px"
          }}>
            <div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Roster Structural Archetype</span>
              <h2 style={{ margin: "2px 0 0", fontSize: "1.3rem", color: "#38bdf8", fontWeight: 800 }}>{myTeamAudit.archetype}</h2>
              {myTeamAudit.auditScore && (
                <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", background: "rgba(14, 165, 233, 0.15)", color: "#7dd3fc", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "2px 8px", borderRadius: "6px" }}>
                    Capital Efficiency: <strong>{myTeamAudit.capitalScore}</strong>
                  </span>
                  <span style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", border: "1px solid rgba(52, 211, 153, 0.3)", padding: "2px 8px", borderRadius: "6px" }}>
                    Positional Balance: <strong>{myTeamAudit.balanceScore}</strong>
                  </span>
                  <span style={{ fontSize: "0.75rem", background: "rgba(245, 158, 11, 0.15)", color: "#fcd34d", border: "1px solid rgba(251, 191, 36, 0.3)", padding: "2px 8px", borderRadius: "6px" }}>
                    Star Power: <strong>{myTeamAudit.starPowerScore}</strong>
                  </span>
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Roster Audit Grade</span>
              <div style={{ fontSize: "1.8rem", color: "#34d399", fontWeight: 900, lineHeight: 1 }}>{myTeamAudit.grade}</div>
              {myTeamAudit.auditScore && (
                <small style={{ color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600 }}>{myTeamAudit.auditScore} / 100</small>
              )}
            </div>
          </div>

          {/* Strengths & Risks Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", marginBottom: "18px" }}>
            {/* Strengths */}
            <div style={{
              background: "rgba(6, 78, 59, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              borderRadius: "10px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <CheckCircle size={18} color="#34d399" weight="fill" />
                <strong style={{ fontSize: "0.92rem", color: "#6ee7b7" }}>Draft Capital Strengths</strong>
              </div>
              {myTeamAudit.strengths.map((s, idx) => (
                <div key={idx} style={{ fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "8px", display: "flex", gap: "6px" }}>
                  <span style={{ color: "#34d399" }}>•</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>

            {/* Risks & Vulnerabilities */}
            <div style={{
              background: "rgba(127, 29, 29, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "10px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <WarningCircle size={18} color="#f87171" weight="fill" />
                <strong style={{ fontSize: "0.92rem", color: "#fca5a5" }}>Live Risk Radar</strong>
              </div>
              {myTeamAudit.risks.map((r, idx) => (
                <div key={idx} style={{ fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "8px", display: "flex", gap: "6px" }}>
                  <span style={{ color: "#f87171" }}>⚠</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Starter Needs & Tactical Coaching */}
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "16px"
          }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              Immediate Starter Needs Prior to Round 5
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              {myTeamAudit.starterNeeds.map((need, idx) => (
                <span key={idx} style={{
                  background: "#1e293b",
                  border: "1px solid #475569",
                  color: "#e2e8f0",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 600
                }}>
                  {need}
                </span>
              ))}
            </div>

            <div style={{ fontSize: "0.75rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
              Head Coach Recommendation
            </div>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#cbd5e1", lineHeight: 1.5 }}>
              {myTeamAudit.tacticalAdvice}
            </p>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: OPPONENT MANAGER INTELLIGENCE & PICK GRADES */}
      {/* ======================================================== */}
      {activeTab === "managers" && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          {/* Manager Selector Pills */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
              Select Manager to Scout Tendencies & View Pick Grades:
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "8px"
            }}>
              {Array.from({ length: numTeams }, (_, i) => i + 1).map((slot) => {
                const name = slotManagers[String(slot)] || `Team ${slot}`;
                const isSelected = slot === selectedManagerSlot;
                const isTurnRival = slot === 11 || slot === 12;
                const isUser = slot === state.session.user_slot;

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedManagerSlot(slot)}
                    style={{
                      background: isSelected
                        ? "#0284c7"
                        : isTurnRival
                        ? "rgba(244, 63, 94, 0.15)"
                        : "#1e293b",
                      border: `1px solid ${
                        isSelected
                          ? "#38bdf8"
                          : isTurnRival
                          ? "rgba(244, 63, 94, 0.4)"
                          : "#334155"
                      }`,
                      color: isSelected ? "#ffffff" : isTurnRival ? "#fda4af" : "#cbd5e1",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                  >
                    <div style={{ fontSize: "0.7rem", opacity: 0.8, display: "flex", justifyContent: "space-between" }}>
                      <span>Slot {slot}</span>
                      {isUser && <span style={{ color: "#34d399", fontWeight: 700 }}>YOU</span>}
                      {isTurnRival && !isUser && <span style={{ color: "#f43f5e", fontWeight: 700 }}>TURN</span>}
                    </div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Manager Scouting Dossier Card */}
          <div style={{
            background: "rgba(30, 41, 59, 0.4)",
            border: "1px solid #334155",
            borderRadius: "12px",
            padding: "18px",
            marginBottom: "16px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#f8fafc", fontWeight: 800 }}>
                    {selectedManagerDossier.managerName}
                  </h3>
                  <span style={{
                    background: "#0f172a",
                    border: "1px solid #475569",
                    color: "#94a3b8",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 600
                  }}>
                    Slot #{selectedManagerDossier.slot}
                  </span>
                  {selectedManagerDossier.threatLevel === "CRITICAL" && (
                    <span style={{
                      background: "#e11d48",
                      color: "#ffffff",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.72rem",
                      fontWeight: 800
                    }}>
                      CRITICAL TURN RIVAL
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#38bdf8", fontWeight: 600, marginTop: "4px" }}>
                  Tendency: {selectedManagerDossier.tendencyLabel} · {selectedManagerDossier.deducedStrategy}
                </div>
              </div>

              {/* Overall Grade Badge */}
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Roster Audit Grade</span>
                <div style={{
                  fontSize: "1.8rem",
                  fontWeight: 900,
                  color: selectedManagerDossier.overallGrade.startsWith("A")
                    ? "#34d399"
                    : selectedManagerDossier.overallGrade.startsWith("B")
                    ? "#fbbf24"
                    : "#f87171"
                }}>
                  {selectedManagerDossier.overallGrade}
                </div>
                {selectedManagerDossier.auditScore && (
                  <small style={{ color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600 }}>
                    {selectedManagerDossier.auditScore} / 100
                  </small>
                )}
              </div>
            </div>

            {/* Roster Audit Sub-Score Pill Bar */}
            {selectedManagerDossier.auditScore && (
              <div style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "14px",
                padding: "8px 12px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid #1e293b",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                  Capital Efficiency (40%): <strong style={{ color: "#7dd3fc" }}>{selectedManagerDossier.capitalScore}</strong>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                  Positional Balance (35%): <strong style={{ color: "#6ee7b7" }}>{selectedManagerDossier.balanceScore}</strong>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                  Star Power (25%): <strong style={{ color: "#fcd34d" }}>{selectedManagerDossier.starPowerScore}</strong>
                </div>
              </div>
            )}

            {/* Tactical Threat & Next Prediction */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px",
              marginBottom: "16px"
            }}>
              <div style={{
                background: "rgba(15, 23, 42, 0.7)",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "10px 14px"
              }}>
                <div style={{ fontSize: "0.72rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700 }}>
                  Next Pick Prediction
                </div>
                <div style={{ fontSize: "0.86rem", color: "#e2e8f0", marginTop: "2px" }}>
                  {selectedManagerDossier.nextPickPrediction}
                </div>
              </div>

              <div style={{
                background: "rgba(15, 23, 42, 0.7)",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "10px 14px"
              }}>
                <div style={{ fontSize: "0.72rem", color: "#f43f5e", textTransform: "uppercase", fontWeight: 700 }}>
                  Threat to Your Slot #{state.session.user_slot}
                </div>
                <div style={{ fontSize: "0.86rem", color: "#e2e8f0", marginTop: "2px" }}>
                  {selectedManagerDossier.threatReason}
                </div>
              </div>
            </div>

            {/* Pick by Pick Grades Table */}
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                Recorded Draft Picks & Expert Grades:
              </div>

              {selectedManagerDossier.picks.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                  No picks recorded yet for this team.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedManagerDossier.picks.map((pick) => (
                    <div
                      key={pick.pickNo}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          background: "#1e293b",
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 7px",
                          borderRadius: "4px"
                        }}>
                          #{pick.pickNo}
                        </span>
                        <div>
                          <strong style={{ fontSize: "0.95rem", color: "#f8fafc" }}>{pick.playerName}</strong>
                          <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "#64748b" }}>({pick.position})</span>
                          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
                            {pick.scoutTake}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{
                            fontSize: "0.75rem",
                            color: pick.valueDiff >= 0 ? "#34d399" : "#fb7185",
                            fontWeight: 700
                          }}>
                            {pick.valueDiff >= 0 ? `+${pick.valueDiff} Value` : `${pick.valueDiff} Reach`}
                          </span>
                        </div>
                        <span style={{
                          fontSize: "1.15rem",
                          fontWeight: 900,
                          color: pick.grade.startsWith("A")
                            ? "#34d399"
                            : pick.grade.startsWith("B")
                            ? "#fbbf24"
                            : "#f87171",
                          background: "#1e293b",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          minWidth: "36px",
                          textAlign: "center"
                        }}>
                          {pick.grade}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: LEAGUE DRAFT MATRIX & SHAREABLE TEXT CARD */}
      {/* ======================================================== */}
      {activeTab === "league_matrix" && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          {/* Top Action & Export Bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "14px 18px",
            marginBottom: "18px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Table size={20} color="#c084fc" weight="duotone" />
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: 800 }}>
                  Draft Matrix & League Report Card
                </h3>
                <span style={{
                  background: "rgba(168, 85, 247, 0.2)",
                  color: "#c084fc",
                  border: "1px solid rgba(168, 85, 247, 0.4)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "0.72rem",
                  fontWeight: 700
                }}>
                  ROSTER AUDIT ENGINE
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                Pick-by-pick evaluation, value surplus scores, and tactical takeaways across all {leagueSummary.matrix.length} teams.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {/* View Switcher Segmented Control */}
              <div style={{ display: "flex", background: "#0b1220", border: "1px solid #334155", borderRadius: "8px", padding: "3px" }}>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode("iphone")}
                  style={{
                    background: matrixViewMode === "iphone" ? "#7c3aed" : "transparent",
                    color: matrixViewMode === "iphone" ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                >
                  📱 iPhone Card
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode("table")}
                  style={{
                    background: matrixViewMode === "table" ? "#0284c7" : "transparent",
                    color: matrixViewMode === "table" ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                >
                  💻 Wide Matrix
                </button>
              </div>

              {/* Download iPhone Card Button */}
              <button
                type="button"
                onClick={handleDownloadIphoneCard}
                disabled={downloadingPng}
                title="Download vertical PNG perfectly sized for iPhone iMessage / SMS text chats"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  background: "linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 15px",
                  fontWeight: 800,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(147, 51, 234, 0.35)",
                  transition: "all 0.15s ease"
                }}
              >
                {downloadingPng ? (
                  <>
                    <Sparkle size={16} className="animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <DownloadSimple size={16} weight="bold" /> 📱 Download iPhone PNG
                  </>
                )}
              </button>

              {/* Download Wide Table Button */}
              <button
                type="button"
                onClick={handleDownloadTableCard}
                disabled={downloadingPng}
                title="Download desktop wide matrix table"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#1e293b",
                  color: "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  cursor: "pointer"
                }}
              >
                <DownloadSimple size={15} /> 💻 Wide Table
              </button>

              {/* Copy Group Text Button */}
              <button
                type="button"
                onClick={handleCopyGroupText}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: copyTextToast ? "#059669" : "#1e293b",
                  color: "#ffffff",
                  border: `1px solid ${copyTextToast ? "#10b981" : "#475569"}`,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {copyTextToast ? (
                  <>
                    <Check size={16} weight="bold" color="#6ee7b7" /> Copied Text!
                  </>
                ) : (
                  <>
                    <ShareNetwork size={16} weight="bold" /> Copy Text
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Draft Room Accolades / Highlights */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "12px",
            marginBottom: "18px"
          }}>
            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(52, 211, 153, 0.4)",
              borderRadius: "10px",
              padding: "12px 14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "#34d399", textTransform: "uppercase", fontWeight: 700 }}>
                <Trophy size={15} weight="fill" /> Class Valedictorian
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f8fafc", marginTop: "4px" }}>
                {leagueSummary.leader.managerName}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#6ee7b7", marginTop: "2px" }}>
                Slot #{leagueSummary.leader.slot} · Grade <strong>{leagueSummary.leader.grade}</strong> ({leagueSummary.leader.score} pts)
              </div>
            </div>

            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: "10px",
              padding: "12px 14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700 }}>
                💎 Steal of the Draft
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f8fafc", marginTop: "4px" }}>
                {leagueSummary.bestValue.playerName}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#7dd3fc", marginTop: "2px" }}>
                Pick #{leagueSummary.bestValue.pickNo} (+{leagueSummary.bestValue.valueDiff} Value) · {leagueSummary.bestValue.managerName}
              </div>
            </div>

            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              borderRadius: "10px",
              padding: "12px 14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "#fb7185", textTransform: "uppercase", fontWeight: 700 }}>
                🚨 Biggest Reach
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f8fafc", marginTop: "4px" }}>
                {leagueSummary.biggestReach.playerName}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#fda4af", marginTop: "2px" }}>
                Pick #{leagueSummary.biggestReach.pickNo} ({leagueSummary.biggestReach.valueDiff} Reach) · {leagueSummary.biggestReach.managerName}
              </div>
            </div>

            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              borderRadius: "10px",
              padding: "12px 14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "#c084fc", textTransform: "uppercase", fontWeight: 700 }}>
                🥊 Strongest Anchor
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f8fafc", marginTop: "4px" }}>
                Bully RB (Team #10)
              </div>
              <div style={{ fontSize: "0.78rem", color: "#d8b4fe", marginTop: "2px" }}>
                James Cook & Ashton Jeanty · 540+ RB Pts
              </div>
            </div>
          </div>

          {/* High-Level Draft Commentary Banner */}
          <div style={{
            background: "rgba(15, 23, 42, 0.7)",
            borderLeft: "4px solid #a855f7",
            borderRadius: "0 10px 10px 0",
            padding: "14px 16px",
            marginBottom: "20px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Compass size={17} color="#c084fc" weight="duotone" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Draft Room Strategic Synthesis · Round {leagueSummary.currentRound}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5, color: "#cbd5e1" }}>
              {leagueSummary.headlineCommentary}
            </p>
          </div>

          {/* ======================================================== */}
          {/* VIEW 1: IPHONE-OPTIMIZED PORTRAIT TEXT CARD */}
          {/* ======================================================== */}
          {matrixViewMode === "iphone" && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <div
                id="iphone-share-card"
                ref={iphoneCardRef}
                style={{
                  width: "740px",
                  maxWidth: "100%",
                  background: "linear-gradient(180deg, #070c18 0%, #0a1122 50%, #070c18 100%)",
                  border: "2px solid #334155",
                  borderRadius: "24px",
                  padding: "24px 20px",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                }}
              >
                {/* Top Banner */}
                <div style={{ textAlign: "center", borderBottom: "1px solid #1e293b", paddingBottom: "16px", marginBottom: "18px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.4)", padding: "4px 12px", borderRadius: "16px", fontSize: "0.75rem", fontWeight: 800, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                    🏈 OFFICIAL DRAFT REPORT CARD · ROUND {leagueSummary.currentRound}
                  </div>
                  <h2 style={{ margin: "2px 0 0", fontSize: "1.65rem", color: "#ffffff", fontWeight: 900, letterSpacing: "-0.02em" }}>
                    {leagueSummary.leagueName.toUpperCase()}
                  </h2>
                  <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "4px" }}>
                    12 Teams · Half-PPR · 2 WR, 2 FLEX · Through Pick {leagueSummary.totalPicks} · RosterAudit™ Engine
                  </div>
                </div>

                {/* 4 Superlatives Grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "18px"
                }}>
                  <div style={{ background: "#0f172a", border: "1px solid rgba(52, 211, 153, 0.4)", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.7rem", color: "#34d399", fontWeight: 800, textTransform: "uppercase" }}>🏆 Draft Leader</div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>{leagueSummary.leader.managerName}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6ee7b7" }}>Slot #{leagueSummary.leader.slot} · Grade <strong>{leagueSummary.leader.grade}</strong> ({leagueSummary.leader.score} pts)</div>
                  </div>

                  <div style={{ background: "#0f172a", border: "1px solid rgba(56, 189, 248, 0.4)", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 800, textTransform: "uppercase" }}>💎 Steal of Draft</div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>{leagueSummary.bestValue.playerName}</div>
                    <div style={{ fontSize: "0.75rem", color: "#7dd3fc" }}>Pick #{leagueSummary.bestValue.pickNo} (+{leagueSummary.bestValue.valueDiff} Value) · {leagueSummary.bestValue.managerName}</div>
                  </div>

                  <div style={{ background: "#0f172a", border: "1px solid rgba(244, 63, 94, 0.4)", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.7rem", color: "#fb7185", fontWeight: 800, textTransform: "uppercase" }}>🚨 Biggest Reach</div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>{leagueSummary.biggestReach.playerName}</div>
                    <div style={{ fontSize: "0.75rem", color: "#fda4af" }}>Pick #{leagueSummary.biggestReach.pickNo} ({leagueSummary.biggestReach.valueDiff} Reach) · {leagueSummary.biggestReach.managerName}</div>
                  </div>

                  <div style={{ background: "#0f172a", border: "1px solid rgba(168, 85, 247, 0.4)", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.7rem", color: "#c084fc", fontWeight: 800, textTransform: "uppercase" }}>🥊 Strongest RB Floor</div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>Bully RB (Team #10)</div>
                    <div style={{ fontSize: "0.75rem", color: "#d8b4fe" }}>Cook & Jeanty · 540+ Projected Pts</div>
                  </div>
                </div>

                {/* 12 Ranked Team Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[...leagueSummary.matrix]
                    .sort((a, b) => b.auditScore - a.auditScore)
                    .map((team, rankIdx) => {
                      const r3PickNo = (2 * numTeams) + (3 % 2 === 1 ? team.slot : (numTeams - team.slot + 1));
                      const isClockNow = state.draft.currentPick === r3PickNo;

                      return (
                        <div
                          key={team.slot}
                          style={{
                            background: team.isUser ? "rgba(14, 165, 233, 0.14)" : "#0d1526",
                            border: team.isUser ? "2px solid #38bdf8" : "1px solid #1e293b",
                            borderRadius: "12px",
                            padding: "12px 14px"
                          }}
                        >
                          {/* Header Row: Rank, Manager, Archetype, Grade */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{
                                background: rankIdx === 0 ? "#eab308" : rankIdx === 1 ? "#94a3b8" : rankIdx === 2 ? "#b45309" : "#1e293b",
                                color: rankIdx < 3 ? "#000000" : "#94a3b8",
                                fontWeight: 900,
                                fontSize: "0.75rem",
                                padding: "2px 7px",
                                borderRadius: "6px"
                              }}>
                                #{rankIdx + 1}
                              </span>
                              <strong style={{ fontSize: "1rem", color: team.isUser ? "#38bdf8" : "#ffffff" }}>
                                {team.managerName}
                              </strong>
                              <span style={{ fontSize: "0.7rem", background: "#1e293b", color: "#94a3b8", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                                Slot {team.slot}
                              </span>
                              {team.isUser && (
                                <span style={{ fontSize: "0.7rem", fontWeight: 900, background: "#0284c7", color: "#ffffff", padding: "2px 6px", borderRadius: "4px" }}>
                                  YOU
                                </span>
                              )}
                              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                                · {team.archetype}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>
                                {team.auditScore} pts
                              </span>
                              <span style={{
                                fontSize: "1.2rem",
                                fontWeight: 900,
                                color: team.overallGrade.startsWith("A") ? "#34d399" : team.overallGrade.startsWith("B") ? "#fbbf24" : "#f87171",
                                background: "#1e293b",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                minWidth: "36px",
                                textAlign: "center"
                              }}>
                                {team.overallGrade}
                              </span>
                            </div>
                          </div>

                          {/* Picks Badges Row */}
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                            {team.picks.map(p => (
                              <div
                                key={p.pickNo}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  background: "#162033",
                                  border: "1px solid #22304a",
                                  borderRadius: "6px",
                                  padding: "4px 8px",
                                  fontSize: "0.76rem"
                                }}
                              >
                                <span style={{ color: "#94a3b8" }}>R{p.roundNo} (#{p.pickNo}):</span>
                                <strong style={{ color: "#f8fafc" }}>{p.playerName}</strong>
                                <span style={{ color: "#64748b" }}>({p.position})</span>
                                <span style={{
                                  color: p.valueDiff >= 0 ? "#34d399" : "#fb7185",
                                  fontWeight: 700,
                                  marginLeft: "2px"
                                }}>
                                  {p.valueDiff >= 0 ? `+${p.valueDiff}` : `${p.valueDiff}`}
                                </span>
                                <span style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  background: "#0f172a",
                                  color: p.grade.startsWith("A") ? "#34d399" : p.grade.startsWith("B") ? "#fbbf24" : "#f87171",
                                  padding: "1px 4px",
                                  borderRadius: "3px"
                                }}>
                                  {p.grade}
                                </span>
                              </div>
                            ))}
                            {team.picks.length < 3 && (
                              <div style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                background: isClockNow ? "rgba(14, 165, 233, 0.15)" : "rgba(30, 41, 59, 0.4)",
                                border: isClockNow ? "1px dashed #38bdf8" : "1px dashed #334155",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                fontSize: "0.74rem"
                              }}>
                                {isClockNow ? (
                                  <strong style={{ color: "#38bdf8" }}>⏱️ R3: ON CLOCK (#{r3PickNo})</strong>
                                ) : (
                                  <span style={{ color: "#64748b" }}>R3: Pick #{r3PickNo}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Executive Scout Take */}
                          <div style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                            {team.executiveCommentary}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Card Footer */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid #1e293b",
                  fontSize: "0.72rem",
                  color: "#64748b"
                }}>
                  <span>Moosey's Mommy Live War Room Engine · Verified vs ADP</span>
                  <span>Sleeper Draft ID: 1401673234486714368</span>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: DESKTOP WIDE TABLE MATRIX */}
          {/* ======================================================== */}
          {matrixViewMode === "table" && (
            <div
              id="league-matrix-export-card"
              ref={tableCardRef}
              style={{
                background: "#070c18",
                border: "1px solid #1e293b",
                borderRadius: "14px",
                padding: "20px",
                boxShadow: "0 8px 30px rgba(0,0,0,0.6)"
              }}
            >
              {/* Card Header */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                borderBottom: "2px solid #334155",
                paddingBottom: "12px",
                marginBottom: "16px"
              }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#a855f7", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Official Draft Report Card & Intelligence Matrix
                  </div>
                  <h2 style={{ margin: "2px 0 0", fontSize: "1.45rem", color: "#ffffff", fontWeight: 900 }}>
                    {leagueSummary.leagueName.toUpperCase()}
                  </h2>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
                    12 Teams · Half-PPR · 2 WR, 2 FLEX · Through Pick {leagueSummary.totalPicks} (Round {leagueSummary.currentRound})
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Grading Engine</div>
                  <div style={{ fontSize: "0.88rem", color: "#38bdf8", fontWeight: 800 }}>RosterAudit™ Protocol</div>
                </div>
              </div>

              {/* Matrix Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#0f172a", borderBottom: "2px solid #38bdf8" }}>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700 }}>Team / Slot</th>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700, textAlign: "center" }}>Grade</th>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700 }}>Round 1 Pick</th>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700 }}>Round 2 Pick</th>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700 }}>Round 3 Pick</th>
                      <th style={{ padding: "10px 12px", color: "#38bdf8", fontWeight: 700 }}>Scout's Executive Take</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueSummary.matrix.map((team, idx) => {
                      const r1 = team.picks.find(p => p.roundNo === 1);
                      const r2 = team.picks.find(p => p.roundNo === 2);
                      const r3 = team.picks.find(p => p.roundNo === 3);

                      // Compute upcoming pick numbers for empty rounds
                      const r3PickNo = (2 * numTeams) + (3 % 2 === 1 ? team.slot : (numTeams - team.slot + 1));
                      const isClockNow = state.draft.currentPick === r3PickNo;

                      const renderPickCell = (pick?: typeof r1, isNextClock?: boolean, pickNum?: number) => {
                        if (!pick) {
                          if (isNextClock) {
                            return (
                              <span style={{
                                fontSize: "0.72rem",
                                color: "#38bdf8",
                                fontWeight: 800,
                                background: "rgba(14, 165, 233, 0.15)",
                                border: "1px dashed #38bdf8",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                display: "inline-block"
                              }}>
                                ⏱️ ON CLOCK (#{pickNum})
                              </span>
                            );
                          }
                          return (
                            <span style={{ fontSize: "0.74rem", color: "#475569", fontStyle: "italic" }}>
                              {pickNum ? `Pick #${pickNum}` : "Upcoming"}
                            </span>
                          );
                        }

                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ fontSize: "0.82rem", color: "#f8fafc" }}>{pick.playerName}</strong>
                              <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>({pick.position})</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: pick.valueDiff >= 0 ? "#34d399" : "#fb7185"
                              }}>
                                #{pick.pickNo} · {pick.valueDiff >= 0 ? `+${pick.valueDiff}` : `${pick.valueDiff}`}
                              </span>
                              <span style={{
                                fontSize: "0.7rem",
                                fontWeight: 900,
                                background: "#1e293b",
                                color: pick.grade.startsWith("A") ? "#34d399" : pick.grade.startsWith("B") ? "#fbbf24" : "#f87171",
                                padding: "1px 5px",
                                borderRadius: "3px"
                              }}>
                                {pick.grade}
                              </span>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <tr
                          key={team.slot}
                          style={{
                            borderBottom: "1px solid #1e293b",
                            background: team.isUser
                              ? "rgba(14, 165, 233, 0.08)"
                              : idx % 2 === 1
                              ? "rgba(15, 23, 42, 0.4)"
                              : "transparent"
                          }}
                        >
                          {/* Manager & Slot */}
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                background: "#1e293b",
                                color: "#94a3b8",
                                padding: "2px 5px",
                                borderRadius: "3px"
                              }}>
                                #{team.slot}
                              </span>
                              <strong style={{ fontSize: "0.85rem", color: team.isUser ? "#38bdf8" : "#f1f5f9" }}>
                                {team.managerName}
                              </strong>
                              {team.isUser && (
                                <span style={{ fontSize: "0.68rem", fontWeight: 800, background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>
                                  YOU
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "3px" }}>
                              {team.archetype}
                            </div>
                          </td>

                          {/* Overall Grade & Audit Score */}
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <span style={{
                              fontSize: "1.1rem",
                              fontWeight: 900,
                              color: team.overallGrade.startsWith("A")
                                ? "#34d399"
                                : team.overallGrade.startsWith("B")
                                ? "#fbbf24"
                                : "#f87171"
                            }}>
                              {team.overallGrade}
                            </span>
                            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "1px" }}>
                              {team.auditScore}
                            </div>
                          </td>

                          {/* Round 1 */}
                          <td style={{ padding: "10px 12px" }}>
                            {renderPickCell(r1)}
                          </td>

                          {/* Round 2 */}
                          <td style={{ padding: "10px 12px" }}>
                            {renderPickCell(r2)}
                          </td>

                          {/* Round 3 */}
                          <td style={{ padding: "10px 12px" }}>
                            {renderPickCell(r3, isClockNow, r3PickNo)}
                          </td>

                          {/* Scout's Take */}
                          <td style={{ padding: "10px 12px", color: "#cbd5e1", fontSize: "0.78rem", maxWidth: "280px", lineHeight: 1.4 }}>
                            {team.executiveCommentary}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Card Footer Watermark */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "16px",
                paddingTop: "12px",
                borderTop: "1px solid #1e293b",
                fontSize: "0.72rem",
                color: "#64748b"
              }}>
                <span>Moosey's Mommy War Room Engine · Verified against Fantasy Football Calculator ADP</span>
                <span>Draft ID: 1401673234486714368</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
