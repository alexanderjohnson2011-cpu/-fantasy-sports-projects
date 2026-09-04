export type SurvivalPoint = { pick: number; probability: number };

export type SleeperSignal = {
  name: string;
  position: string;
  team: string;
  adp: number;
  marketRank: number;
  newsRisk: string;
  news: string;
  score: number;
  qualitative: { label: string; adpGap: number; trend30Day: number; reasons: string[]; teamSituation: string };
};

export type DraftPlayer = {
  playerId: string;
  yahooId?: number | null;
  name: string;
  position: string;
  team: string;
  bye?: number | null;
  adp: number;
  marketRank: number;
  marketValue: number;
  projectedPoints: number;
  projectionSources: number;
  tier: number;
  uncertainty: number;
  newsRisk: string;
  news: string;
  newsUrl?: string | null;
  newsReporter?: string | null;
  newsPublishedAt?: string | null;
  sourceLabel: string;
  vorp: number;
  utility: number;
  incrementalValue?: number;
  survival: SurvivalPoint[];
  rosterNeed: boolean;
  samePositionDropoff: number;
  evidenceIds: string[];
  qualitative?: { label: string; adpGap: number; trend30Day: number; reasons: string[]; teamSituation: string };
};

export type PlayerDossier = {
  player: DraftPlayer;
  positiveCase: string[];
  cautions: string[];
  marketSynthesis: string;
  commentaryCoverage: string;
  draftTakeaway: string;
  sourceBoundary: string;
};

export type PlayerAiTake = {
  summary: string;
  provider: string;
  reason?: string | null;
  cached: boolean;
};

export type DraftEvent = {
  event_id: number;
  pick_no: number;
  round_no: number;
  team_slot: number;
  player_id: string;
  player_name: string;
  position: string;
  source: "manual" | "yahoo" | "correction" | "rehearsal";
  observed_at: string;
};

export type SourceState = {
  provider: string;
  fetched_at: string;
  publicAllowed: boolean;
  status: "fresh" | "stale" | "degraded";
  detail?: string;
};

export type DraftState = {
  session: {
    session_id: string;
    league_name: string;
    league_key?: string;
    user_slot: number;
    num_teams: number;
    rounds: number;
    scoring_json?: Array<{ name: string; value: number }>;
    roster_slots_json?: Array<{ position: string; count: number }>;
    league_settings_json?: {
      draftClockSeconds?: number;
      keeperManagementEnabled?: boolean;
      userSlotConfirmed?: boolean;
      roundsConfirmed?: boolean;
    };
    strategy: "floor" | "balanced" | "upside";
    sync_mode: "manual" | "yahoo";
    sync_message?: string;
    last_yahoo_sync?: string;
  };
  events: DraftEvent[];
  sources: SourceState[];
  news: Array<{ headline: string; publishedAt: string; sourceUrl: string; reporter?: string }>;
  draft: {
    generatedAt: string;
    currentPick: number;
    currentRound: number;
    onClockSlot: number;
    nextUserPicks: number[];
    strategy: string;
    simulations: number;
    projectionLabel: string;
    calculationMs: number;
    recommendations: DraftPlayer[];
    available: DraftPlayer[];
    rosterCounts: Record<string, number>;
    sleeperRadar: SleeperSignal[];
    qualitativeMethod: string;
  };
};

const API_BASE = (import.meta.env.VITE_DRAFT_API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const draftApiBase = API_BASE;
