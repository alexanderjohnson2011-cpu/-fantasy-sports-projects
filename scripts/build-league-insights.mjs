import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analysisRoot = path.resolve(repoRoot, "..", "sleeper_work");
const outputRoot = path.join(analysisRoot, "output_latest");
const currentLeagueId = "1312209616372772864";
const destination = path.join(repoRoot, "src", "generated", "league-insights.json");

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

async function sleeper(pathname) {
  const response = await fetch(`https://api.sleeper.app/v1/${pathname}`);
  if (!response.ok) throw new Error(`Sleeper ${response.status}: ${pathname}`);
  return response.json();
}

function points(settings, key) {
  return Number(settings?.[key] ?? 0) + Number(settings?.[`${key}_decimal`] ?? 0) / 100;
}

function applyPlacement(target, bracket, offset = 0) {
  for (const matchup of bracket) {
    if (!matchup.p || !matchup.w || !matchup.l) continue;
    target[String(matchup.w)] = offset + matchup.p;
    target[String(matchup.l)] = offset + matchup.p + 1;
  }
}

function marketSlot(rank) {
  if (!rank) return { label: "Unranked", round: null, pick: null };
  const round = Math.ceil(rank / 12);
  const pick = ((rank - 1) % 12) + 1;
  return {
    label: round <= 20 ? `${round}.${String(pick).padStart(2, "0")}` : "After R20",
    round,
    pick,
  };
}

const [websiteData, rosterCsv, fantasyCalc, metadata, currentLeague] = await Promise.all([
  readFile(path.join(outputRoot, "website_data.json"), "utf8").then(JSON.parse),
  readFile(path.join(outputRoot, "rosters.csv"), "utf8").then(parseCsv),
  readFile(path.join(analysisRoot, "raw", "fantasycalc.json"), "utf8").then(JSON.parse),
  readFile(path.join(outputRoot, "snapshot_metadata.json"), "utf8").then(JSON.parse),
  sleeper(`league/${currentLeagueId}`),
]);

const previousLeagueId = currentLeague.previous_league_id;
const [previousLeague, previousRosters, winnersBracket, losersBracket] = await Promise.all([
  sleeper(`league/${previousLeagueId}`),
  sleeper(`league/${previousLeagueId}/rosters`),
  sleeper(`league/${previousLeagueId}/winners_bracket`),
  sleeper(`league/${previousLeagueId}/losers_bracket`),
]);

const eligibleMarket = fantasyCalc
  .filter(
    (entry) =>
      ["QB", "RB", "WR", "TE"].includes(entry.player?.position) &&
      Number(entry.redraftValue ?? 0) > 0,
  )
  .sort((a, b) => Number(b.redraftValue) - Number(a.redraftValue));

const redraftRanks = new Map();
eligibleMarket.forEach((entry, index) => {
  redraftRanks.set(String(entry.player.sleeperId), index + 1);
});

const rosterPlayers = new Map();
for (const row of rosterCsv) {
  if (!["QB", "RB", "WR", "TE"].includes(row.position)) continue;
  const rosterId = String(row.roster_id);
  const rank = redraftRanks.get(String(row.player_id)) ?? null;
  const item = {
    playerId: String(row.player_id),
    player: row.player,
    position: row.position,
    nflTeam: row.nfl_team || "FA",
    rosterStatus: row.status,
    redraftRank: rank,
    redraftValue: Number(row.redraft_value || 0),
    marketSlot: marketSlot(rank),
  };
  if (!rosterPlayers.has(rosterId)) rosterPlayers.set(rosterId, []);
  rosterPlayers.get(rosterId).push(item);
}

for (const players of rosterPlayers.values()) {
  players.sort((a, b) => {
    if (a.redraftRank && b.redraftRank) return a.redraftRank - b.redraftRank;
    if (a.redraftRank) return -1;
    if (b.redraftRank) return 1;
    return b.redraftValue - a.redraftValue;
  });
}

const placements = {};
applyPlacement(placements, winnersBracket, 0);
applyPlacement(placements, losersBracket, Number(previousLeague.settings?.playoff_teams ?? 6));

const historyByRoster = Object.fromEntries(
  previousRosters.map((roster) => {
    const settings = roster.settings ?? {};
    return [
      String(roster.roster_id),
      {
        wins: Number(settings.wins ?? 0),
        losses: Number(settings.losses ?? 0),
        ties: Number(settings.ties ?? 0),
        pointsFor: Number(points(settings, "fpts").toFixed(2)),
        potentialPoints: Number(points(settings, "ppts").toFixed(2)),
        finish: placements[String(roster.roster_id)] ?? null,
      },
    ];
  }),
);

const teams = Object.fromEntries(
  websiteData.teams.map((team) => {
    const rosterId = String(team.roster_id);
    const analysis = team.roster_analysis;
    return [
      rosterId,
      {
        rosterId: team.roster_id,
        metrics: {
          powerRank: analysis.power_rank,
          dynastyCoreRank: analysis.dynasty_core_rank,
          redraftLineupRank: analysis.redraft_lineup_rank,
          depthRank: analysis.depth_rank,
          totalValueRank: analysis.total_value_rank,
          youthRank: analysis.youth_rank,
          youthValueShare: analysis.youth_value_share,
          futureFirsts: analysis["2027_firsts"],
          futurePicksThreeYear: analysis.future_picks_3yr,
          strongestRoom: analysis.strongest_room,
          weakestRoom: analysis.weakest_room,
          window: analysis.window,
        },
        topAssets: team.top_assets.map((asset) => ({
          player: asset.name,
          position: asset.position,
          nflTeam: asset.nfl_team,
          dynastyValue: asset.dynasty_value,
        })),
        redraftBoard: rosterPlayers.get(rosterId) ?? [],
        previousSeason: historyByRoster[rosterId] ?? null,
      },
    ];
  }),
);

const payload = {
  generatedAt: metadata.generated_at,
  draftState: {
    status: metadata.draft_status,
    picksMade: metadata.picks_made,
    totalPicks: metadata.total_draft_slots,
  },
  previousSeason: {
    season: previousLeague.season,
    leagueId: previousLeagueId,
    championRosterId: Number(previousLeague.metadata?.latest_league_winner_roster_id ?? 0),
  },
  redraftMethod:
    "Market-implied 12-team slots from current FantasyCalc redraft values; skill positions only.",
  teams,
};

await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(destination);
