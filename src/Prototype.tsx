import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChartBar,
  ChartLineUp,
  ClockCounterClockwise,
  Football,
  Info,
  List,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import leagueInsightsJson from "./generated/league-insights.json";
import macSaladAwardsJson from "./generated/mac-salad-awards.json";

type Pick = {
  slot: string;
  player: string;
  position: string;
  expertRank?: number;
  marketRank?: number;
  acquired?: boolean;
};

type RedraftPlayer = {
  playerId: string;
  player: string;
  position: string;
  nflTeam: string;
  age: number | null;
  rosterStatus: string;
  dynastyValue: number;
  redraftRank: number | null;
  redraftValue: number;
  trend30Day: number;
  marketSlot: { label: string; round: number | null; pick: number | null };
};

type TeamInsight = {
  rosterId: number;
  metrics: {
    powerRank: number;
    dynastyCoreRank: number;
    redraftLineupRank: number;
    depthRank: number;
    totalValueRank: number;
    youthRank: number;
    youthValueShare: string;
    futureFirsts: number;
    futurePicksThreeYear: number;
    strongestRoom: string;
    weakestRoom: string;
    window: string;
    qbRoomRank: number;
    rbRoomRank: number;
    wrRoomRank: number;
    teRoomRank: number;
    dynastyCoreValue: number;
    redraftLineupValue: number;
    depthValue: number;
    totalRosterValue: number;
  };
  topAssets: Array<{ player: string; position: string; nflTeam: string; dynastyValue: number }>;
  redraftBoard: RedraftPlayer[];
  draftAudit: {
    executionGrade: string;
    blendedValueCapture: number;
    leagueAdjustedCapture: number;
    picks: Array<{
      slot: string;
      marketValueRatio: number;
      expertValueRatio: number;
      marketLabel: string;
      expertLabel: string;
      expectedSlotValue: number;
    }>;
  };
  previousSeason: {
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    potentialPoints: number;
    finish: number | null;
  } | null;
};

type LeagueInsights = {
  generatedAt: string;
  draftState: { status: string; picksMade: number; totalPicks: number };
  previousSeason: { season: string; leagueId: string; championRosterId: number };
  redraftMethod: string;
  teams: Record<string, TeamInsight>;
};

const leagueInsights = leagueInsightsJson as LeagueInsights;

type MacSaladAward = {
  id: string;
  season: string;
  date: string;
  displayDate: string;
  occasion: string;
  manager: string;
  team: string;
  reason: string;
};

type MacSaladHistory = {
  currentSeason: string;
  awards: MacSaladAward[];
};

const macSaladHistory = macSaladAwardsJson as MacSaladHistory;
const currentMacSaladAwards = macSaladHistory.awards.filter(
  (award) => award.season === macSaladHistory.currentSeason,
);
const macSaladSeasons = [...new Set(macSaladHistory.awards.map((award) => award.season))].sort(
  (a, b) => Number(b) - Number(a),
);
const macSaladStandings = Object.values(
  currentMacSaladAwards.reduce<Record<string, { manager: string; team: string; count: number }>>(
    (standings, award) => {
      const current = standings[award.manager] ?? { manager: award.manager, team: award.team, count: 0 };
      standings[award.manager] = { ...current, team: award.team, count: current.count + 1 };
      return standings;
    },
    {},
  ),
).sort((a, b) => b.count - a.count || a.manager.localeCompare(b.manager));

type Team = {
  rosterId: number;
  rank: number;
  powerRank: number;
  name: string;
  manager: string;
  pickGrade: string;
  headline: string;
  commentary: string;
  bestPick: string;
  question: string;
  verdict: string;
  capitalNote: string;
  capitalOutcome?: number;
  expertCapture?: number;
  marketCapture?: number;
  originalPicks: number;
  acquiredPicks: number;
  window: string;
  strength: string;
  weakness: string;
  scores: { execution: number; capital: number; fit: number };
  picks: Pick[];
};

const teams: Team[] = [
  {
    rosterId: 6,
    rank: 1,
    powerRank: 12,
    name: "Final Boss",
    manager: "OldManBacala",
    pickGrade: "A",
    headline: "Great selections, weaker capital management",
    commentary: "Final Boss landed the consensus rookie No. 2 at 1.03, then spent discounted late picks on the roster's weakest room. Tate gives the rebuild a true centerpiece; Allen and McGowan are the right kind of low-cost RB bets.",
    bestPick: "Carnell Tate at 1.03",
    question: "Did a rebuilding roster need Tucker Kraft more than the liquidity of 1.04?",
    verdict: "The selections were the league's cleanest marriage of value and team direction. The 1.04 trade trims the permanent grade one notch.",
    capitalNote: "Retained 96.1% of current value sent. Trading 1.04 for Tucker Kraft was defensible, but it worked against the flexibility a rebuild usually needs.",
    capitalOutcome: 96.1,
    expertCapture: 120.1,
    marketCapture: 118.5,
    originalPicks: 2,
    acquiredPicks: 1,
    window: "Rebuild",
    strength: "WR direction",
    weakness: "RB depth",
    scores: { execution: 94, capital: 77, fit: 91 },
    picks: [
      { slot: "1.03", player: "Carnell Tate", position: "WR", expertRank: 2, marketRank: 2 },
      { slot: "3.05", player: "Kaytron Allen", position: "RB", expertRank: 28, marketRank: 29, acquired: true },
      { slot: "4.03", player: "Seth McGowan", position: "RB", expertRank: 41, marketRank: 43 },
    ],
  },
  {
    rosterId: 11,
    rank: 2,
    powerRank: 10,
    name: "Terry Tate’s Pain Train",
    manager: "mannyrsox24",
    pickGrade: "A",
    headline: "Excellent picks; the full trade ledger lands near neutral",
    commentary: "Price was a defensible need pick, Lemon was a clean first-round value, and the board then turned into a hunt for asymmetric upside. Hurst and Delp fell well beyond expert consensus, while Washington is the class's defining experts-versus-market disagreement.",
    bestPick: "Ted Hurst at 3.06",
    question: "Can Jadarian Price justify moving the best established asset in the deal?",
    verdict: "This is how a lower-tier roster should use a draft window: turn depth into more value at its weakest position, then layer in asymmetric upside.",
    capitalNote: "The Olave deal returned 112.5% of value as traded and 116.7% after the picks. An earlier 2.06-for-Kayshon Boutte sale pulls the full-cycle result back to 101.0%.",
    capitalOutcome: 101,
    expertCapture: 114.5,
    marketCapture: 113.8,
    originalPicks: 3,
    acquiredPicks: 2,
    window: "Retool / bubble",
    strength: "TE room (#5)",
    weakness: "RB room (#9)",
    scores: { execution: 92, capital: 82, fit: 89 },
    picks: [
      { slot: "1.04", player: "Jadarian Price", position: "RB", expertRank: 5, marketRank: 4, acquired: true },
      { slot: "1.06", player: "Makai Lemon", position: "WR", expertRank: 4, marketRank: 5 },
      { slot: "2.12", player: "Mike Washington", position: "RB", expertRank: 26, marketRank: 15, acquired: true },
      { slot: "3.06", player: "Ted Hurst", position: "WR", expertRank: 19, marketRank: 26 },
      { slot: "4.06", player: "Oscar Delp", position: "TE", expertRank: 30, marketRank: 36 },
    ],
  },
  {
    rosterId: 2,
    rank: 3,
    powerRank: 5,
    name: "2 Dagos and A Dream",
    manager: "TGamby",
    pickGrade: "A−",
    headline: "Value everywhere, with every pick aimed at a weakness",
    commentary: "Boston came off the board a little early, but Simpson and Thompson were excellent Day 3 values. Every selection attacked a bottom-two position room, and the separate 2.08-for-Harold Fannin result gives this class the league's strongest capital backdrop.",
    bestPick: "Ty Simpson at 3.08",
    question: "Was Denzel Boston worth passing on the higher-ranked names at 1.08?",
    verdict: "All three original selections attacked bottom-two rooms. Turning 2.08 into Harold Fannin adds the strongest capital result in the league.",
    capitalNote: "Current value returned is 197.9% of value sent, driven by Harold Fannin's appreciation after the trade. The model caps this at an A because some of the gain is retrospective.",
    capitalOutcome: 197.9,
    expertCapture: 117,
    marketCapture: 104.7,
    originalPicks: 3,
    acquiredPicks: 0,
    window: "Needs a direction",
    strength: "RB room (#1)",
    weakness: "QB / WR (#11)",
    scores: { execution: 88, capital: 97, fit: 93 },
    picks: [
      { slot: "1.08", player: "Denzel Boston", position: "WR", expertRank: 10, marketRank: 8 },
      { slot: "3.08", player: "Ty Simpson", position: "QB", expertRank: 20, marketRank: 24 },
      { slot: "4.08", player: "Brenen Thompson", position: "WR", expertRank: 37, marketRank: 50 },
    ],
  },
  {
    rosterId: 4,
    rank: 4,
    powerRank: 11,
    name: "Bub’s Club",
    manager: "bubberdubber",
    pickGrade: "B",
    headline: "Strong acquisition economics lift an uneven nine-pick haul",
    commentary: "Love was automatic, Sadiq was fair, and Cooper was one of the board's clearest wins. The class got far more volatile after that: Williams and Lance beat consensus, while Douglas, Benson, and now Klubnik required conviction well ahead of the expert board.",
    bestPick: "Omar Cooper at 2.01",
    question: "Why spend so much capital ahead of consensus after the early wins?",
    verdict: "The picks were mixed, but four acquired selections were earned through sharp capital management—not purchased through overpayment.",
    capitalNote: "Five of nine picks were acquired. The complete ledger returns 138.6% of value sent, earning an A for capital management without granting a volume bonus.",
    capitalOutcome: 138.6,
    expertCapture: 97.7,
    marketCapture: 99.6,
    originalPicks: 4,
    acquiredPicks: 5,
    window: "Retool / bubble",
    strength: "Youth (#1)",
    weakness: "QB room (#12)",
    scores: { execution: 79, capital: 92, fit: 84 },
    picks: [
      { slot: "1.01", player: "Jeremiyah Love", position: "RB", expertRank: 1, marketRank: 1 },
      { slot: "1.09", player: "Jonah Coleman", position: "RB", expertRank: 12, marketRank: 11, acquired: true },
      { slot: "1.10", player: "Kenyon Sadiq", position: "TE", expertRank: 9, marketRank: 7, acquired: true },
      { slot: "2.01", player: "Omar Cooper", position: "WR", expertRank: 7, marketRank: 13 },
      { slot: "2.10", player: "Caleb Douglas", position: "WR", expertRank: 36, marketRank: 21, acquired: true },
      { slot: "3.01", player: "Antonio Williams", position: "WR", expertRank: 14, marketRank: 18 },
      { slot: "3.11", player: "Malik Benson", position: "WR", expertRank: 58, marketRank: 40, acquired: true },
      { slot: "4.01", player: "Bryce Lance", position: "WR", expertRank: 34, marketRank: 42 },
      { slot: "4.09", player: "Cade Klubnik", position: "QB", expertRank: 54, marketRank: 46, acquired: true },
    ],
  },
  {
    rosterId: 1,
    rank: 5,
    powerRank: 3,
    name: "Ertz & Krafts",
    manager: "jccbraves99",
    pickGrade: "B",
    headline: "Ordinary picks, excellent contender consolidation",
    commentary: "Bell, Claiborne, and Klare all met or beat the expert board, although the live market is cooler on the trio. The sharper move came away from the clock, where surplus TE depth and bridge capital became Chris Olave without a meaningful market premium.",
    bestPick: "Chris Bell at 2.06",
    question: "Was Max Klare the best use of a pick for the league's No. 2 TE room?",
    verdict: "Solid, low-ceiling selections paired with smart roster-shape management. That is enough to raise the full-cycle grade.",
    capitalNote: "The 1.04 bridge trades were nearly value-neutral, but effectively converted Tucker Kraft, Tyjae Spears and 2.12 into Chris Olave and Dylan Sampson.",
    capitalOutcome: 101.2,
    expertCapture: 117,
    marketCapture: 83.3,
    originalPicks: 1,
    acquiredPicks: 2,
    window: "Deep playoff mix",
    strength: "TE room (#2)",
    weakness: "QB room (#8)",
    scores: { execution: 78, capital: 86, fit: 83 },
    picks: [
      { slot: "2.06", player: "Chris Bell", position: "WR", expertRank: 16, marketRank: 25, acquired: true },
      { slot: "3.04", player: "Demond Claiborne", position: "RB", expertRank: 24, marketRank: 27, acquired: true },
      { slot: "3.12", player: "Max Klare", position: "TE", expertRank: 31, marketRank: 44 },
    ],
  },
  {
    rosterId: 10,
    rank: 6,
    powerRank: 2,
    name: "Bijan And The Maye-ssiah",
    manager: "jcflash59",
    pickGrade: "C+",
    headline: "Capital wins rescue inefficient selections",
    commentary: "The positional thesis was correct—receiver was the roster's weakest starting room—but three straight WR selections came ahead of consensus. Heidenreich and Joly improved the finish, while an excellent trade ledger prevented inefficient picks from defining the cycle.",
    bestPick: "Justin Joly at 4.07",
    question: "Can one of three receivers taken ahead of consensus separate from the tier?",
    verdict: "Strong acquisition economics pull a good roster's permanent result back to average after an undisciplined draft board.",
    capitalNote: "The ledger returns 146.4% of value sent, driven partly by acquiring Romeo Doubs, Wan'Dale Robinson and 4.02 for Terrell Jennings and 3.07.",
    capitalOutcome: 146.4,
    expertCapture: 93.6,
    marketCapture: 84.2,
    originalPicks: 3,
    acquiredPicks: 2,
    window: "Contender",
    strength: "QB room (#2)",
    weakness: "WR room (#7)",
    scores: { execution: 68, capital: 94, fit: 76 },
    picks: [
      { slot: "1.07", player: "De'Zhaun Stribling", position: "WR", expertRank: 13, marketRank: 10 },
      { slot: "2.07", player: "Malachi Fields", position: "WR", expertRank: 22, marketRank: 20 },
      { slot: "2.08", player: "Elijah Sarratt", position: "WR", expertRank: 23, marketRank: 33, acquired: true },
      { slot: "4.02", player: "Eli Heidenreich", position: "RB", expertRank: 39, marketRank: 47, acquired: true },
      { slot: "4.07", player: "Justin Joly", position: "TE", expertRank: 35, marketRank: 39 },
    ],
  },
  {
    rosterId: 5,
    rank: 7,
    powerRank: 9,
    name: "My Nabers Tetties",
    manager: "DRockefeller",
    pickGrade: "C+",
    headline: "Efficiently acquired capital, uneven execution",
    commentary: "The first-round foundation was sound, then Cyrus Allen introduced the draft's widest expert-market disagreement. Stowers and Black delivered a strong recovery, and the five acquired picks were assembled efficiently enough to keep one aggressive reach from sinking the whole cycle.",
    bestPick: "Eli Stowers at 3.02",
    question: "Was Cyrus Allen at 2.03 worth betting two rounds against consensus?",
    verdict: "Five acquired picks were assembled efficiently, but the on-clock results still need Stowers and the RB swings to do repair work.",
    capitalNote: "Five of seven picks were acquired. The current full-cycle ledger returns 112.0% of value sent, preventing the class from being treated as empty volume.",
    capitalOutcome: 112,
    expertCapture: 88.2,
    marketCapture: 95.7,
    originalPicks: 2,
    acquiredPicks: 5,
    window: "Needs a direction",
    strength: "WR room (#3)",
    weakness: "RB room (#12)",
    scores: { execution: 67, capital: 85, fit: 75 },
    picks: [
      { slot: "1.02", player: "Jordyn Tyson", position: "WR", expertRank: 3, marketRank: 3 },
      { slot: "1.05", player: "KC Concepcion", position: "WR", expertRank: 6, marketRank: 6, acquired: true },
      { slot: "1.11", player: "Fernando Mendoza", position: "QB", expertRank: 13, marketRank: 9, acquired: true },
      { slot: "2.03", player: "Cyrus Allen", position: "WR", expertRank: 40, marketRank: 17, acquired: true },
      { slot: "2.05", player: "Emmett Johnson", position: "RB", expertRank: 18, marketRank: 23, acquired: true },
      { slot: "3.02", player: "Eli Stowers", position: "TE", expertRank: 13, marketRank: 14 },
      { slot: "3.07", player: "Kaelon Black", position: "RB", expertRank: 25, marketRank: 28, acquired: true },
    ],
  },
  {
    rosterId: 7,
    rank: 8,
    powerRank: 8,
    name: "Gridiron geezers",
    manager: "kong58",
    pickGrade: "B−",
    headline: "Correct positions, expensive capital path",
    commentary: "No roster needed receivers more, and both selections went directly at that problem. Bernard was slightly early and Branch slightly late, so the board value nearly cancels out; the expensive acquisition path is what keeps the class from climbing.",
    bestPick: "Zachariah Branch at 2.11",
    question: "Do two mid-tier receivers materially repair the league's weakest WR room?",
    verdict: "Need alignment keeps the grade afloat, but the acquisition ledger makes 2.02 more expensive than it first appears.",
    capitalNote: "One of two selections was acquired. The full ledger returns 85.8% of value sent, so the extra pick slightly reduces rather than improves the permanent grade.",
    capitalOutcome: 85.8,
    expertCapture: 93,
    marketCapture: 90.5,
    originalPicks: 1,
    acquiredPicks: 1,
    window: "Needs a direction",
    strength: "RB room (#3)",
    weakness: "WR room (#12)",
    scores: { execution: 74, capital: 67, fit: 90 },
    picks: [
      { slot: "2.02", player: "Germie Bernard", position: "WR", expertRank: 18, marketRank: 22, acquired: true },
      { slot: "2.11", player: "Zachariah Branch", position: "WR", expertRank: 21, marketRank: 19 },
    ],
  },
  {
    rosterId: 8,
    rank: 9,
    powerRank: 6,
    name: "arkinsjt",
    manager: "arkinsjt",
    pickGrade: "B−",
    headline: "Near-neutral capital and sensible need picks",
    commentary: "Singleton was almost exactly consensus value and directly repaired a weak RB room. Hibner is the swing: in a no-TE-premium league, athletic promise is not enough—he must become a credible weekly starter to repay the opportunity cost.",
    bestPick: "Nicholas Singleton at 2.04",
    question: "Can Hibner become a starter in a league that gives tight ends no premium?",
    verdict: "Two selections attacked bottom-three rooms. Capital management was neutral enough to leave the pick grade intact.",
    capitalNote: "Both selections were original. Other 2026-pick trades retained 98.0% of value sent—close enough to neutral that capital does not move the grade.",
    capitalOutcome: 98,
    expertCapture: 87.3,
    marketCapture: 96.3,
    originalPicks: 2,
    acquiredPicks: 0,
    window: "Needs a direction",
    strength: "QB room (#4)",
    weakness: "TE room (#12)",
    scores: { execution: 73, capital: 79, fit: 82 },
    picks: [
      { slot: "2.04", player: "Nicholas Singleton", position: "RB", expertRank: 15, marketRank: 16 },
      { slot: "4.04", player: "Matt Hibner", position: "TE", expertRank: 56, marketRank: 45 },
    ],
  },
  {
    rosterId: 9,
    rank: 10,
    powerRank: 7,
    name: "Max’s Shadynasty",
    manager: "maxjabb",
    pickGrade: "B−",
    headline: "One value pick cannot cover capital leakage",
    commentary: "Bell was a clean third-round value, but Allar was taken ahead of the expert median at a position where this roster was already strong. In 1QB with four-point passing touchdowns, the quarterback bet needs a real value spike or an active trade market.",
    bestPick: "Skyler Bell at 3.09",
    question: "Why add another QB to the league's No. 3 room in a one-quarterback format?",
    verdict: "The selections were acceptable. The full acquisition record pulls the result down one notch.",
    capitalNote: "Skyler Bell was acquired, Drew Allar was original. The full ledger returns 85.3% of value sent, so Bell's bargain was not free volume.",
    capitalOutcome: 85.3,
    expertCapture: 96.2,
    marketCapture: 100.5,
    originalPicks: 1,
    acquiredPicks: 1,
    window: "Needs a direction",
    strength: "QB room (#3)",
    weakness: "TE room (#11)",
    scores: { execution: 74, capital: 65, fit: 63 },
    picks: [
      { slot: "3.09", player: "Skyler Bell", position: "WR", expertRank: 27, marketRank: 35, acquired: true },
      { slot: "3.10", player: "Drew Allar", position: "QB", expertRank: 42, marketRank: 31 },
    ],
  },
  {
    rosterId: 3,
    rank: 11,
    powerRank: 4,
    name: "The Ape",
    manager: "sduda351",
    pickGrade: "C−",
    headline: "Acquired picks magnify four below-market selections",
    commentary: "Every selection came ahead of expert consensus, and three of the four picks carried an acquisition cost. Lane or Randall can still make the conviction look sharp, but adding again to already-strong WR and TE rooms demanded better prices than the board supplied.",
    bestPick: "Eli Raridon at 3.03",
    question: "Why keep adding to the roster's strongest rooms?",
    verdict: "Conviction is not free. Lane or Randall needs to become a clear outlier for this class to beat its opportunity cost.",
    capitalNote: "Three of four picks were acquired. The ledger returns 83.5% of value sent, increasing the burden rather than softening it.",
    capitalOutcome: 83.5,
    expertCapture: 67,
    marketCapture: 77.5,
    originalPicks: 1,
    acquiredPicks: 3,
    window: "Contender",
    strength: "TE room (#1)",
    weakness: "QB room (#6)",
    scores: { execution: 51, capital: 62, fit: 54 },
    picks: [
      { slot: "1.12", player: "Ja'Kobi Lane", position: "WR", expertRank: 22, marketRank: 12, acquired: true },
      { slot: "2.09", player: "Adam Randall", position: "RB", expertRank: 35, marketRank: 34, acquired: true },
      { slot: "3.03", player: "Eli Raridon", position: "TE", expertRank: 32, marketRank: 32, acquired: true },
      { slot: "4.05", player: "Colbie Young", position: "WR", expertRank: 47, marketRank: 53 },
    ],
  },
  {
    rosterId: 12,
    rank: 12,
    powerRank: 1,
    name: "Bronco Stampede",
    manager: "5FinkleRay",
    pickGrade: "INC",
    headline: "The league favorite chose liquidity over a rookie class",
    commentary: "Bronco Stampede moved every original selection and made no pick through 4.09. That cannot weaken the league's best current roster by itself, but the 83.8% capital return means the no-pick strategy did not preserve full market value.",
    bestPick: "Not yet made",
    question: "Did moving every 2026 selection create enough present value for a title favorite?",
    verdict: "The absence of rookies is not the concern; the price received is. A loaded roster can rationally sell picks, but this ledger currently returns only 83.8% of the value sent.",
    capitalNote: "No selection through 4.09. Current capital retained is 83.8% of value sent, so the provisional capital-management mark is a C.",
    capitalOutcome: 83.8,
    originalPicks: 0,
    acquiredPicks: 0,
    window: "Contender",
    strength: "QB / WR (#1)",
    weakness: "TE room (#10)",
    scores: { execution: 0, capital: 64, fit: 88 },
    picks: [],
  },
];

const powerEditorial: Record<number, { headline: string; now: string; future: string }> = {
  12: {
    headline: "The most complete lineup in the league starts the season on the pole.",
    now: "The No. 1 redraft lineup and elite QB/WR rooms make Bronco Stampede the title favorite. The only obvious soft spot is tight end, and it is relative rather than fatal.",
    future: "The dynasty core also ranks first, but zero 2027 firsts and only 10 picks over three years leave less insulation than the roster value suggests.",
  },
  10: {
    headline: "Elite depth gives the contender more ways to survive a long season.",
    now: "The league's deepest roster pairs Bijan Robinson and Amon-Ra St. Brown with the No. 2 QB room. WR depth is the one area that can still make the weekly lineup feel thinner than the total value.",
    future: "A No. 2 dynasty core and balanced age profile keep the window open. The modest future-pick inventory means the next consolidation trade needs to land cleanly.",
  },
  1: {
    headline: "The defending champion is built to repeat now, not to age gracefully.",
    now: "Last year's champion still owns the No. 3 redraft lineup and No. 2 depth. McBride plus a veteran RB wave creates a high weekly floor.",
    future: "The dynasty core falls to fifth and the youth profile ranks 12th. A strong 13-pick inventory can finance the transition, but the manager cannot wait for every veteran to decline at once.",
  },
  3: {
    headline: "A star-heavy contender with very little margin for an injury cluster.",
    now: "Justin Jefferson, Brock Bowers, and Lamar Jackson drive the No. 2 redraft lineup. Depth ranks 10th, so the starting advantage can disappear quickly when byes and injuries overlap.",
    future: "The dynasty core ranks third and the 15-pick pipeline is excellent. Converting some distant capital into one more weekly starter would balance both horizons.",
  },
  2: {
    headline: "The league's best RB room needs help everywhere it flexes.",
    now: "Gibbs, Jeanty, and Taylor can win weeks by themselves, but the No. 6 redraft lineup and No. 9 depth reveal how concentrated the roster is.",
    future: "A top-four dynasty core and the league's No. 3 youth profile make this an enviable three-year roster. Wide receiver development is the hinge between interesting and dominant.",
  },
  8: {
    headline: "A balanced middle-class roster without a single fatal weakness—or a clear edge.",
    now: "The current lineup, depth, and total value all land between sixth and eighth. CeeDee Lamb and A.J. Brown supply ceiling, while the league's weakest TE room costs weekly optionality.",
    future: "The dynasty core is seventh and the youth profile is 10th. This roster needs either a decisive win-now move or a value reset before it gets trapped in the middle.",
  },
  9: {
    headline: "Superstar receivers keep the ceiling high, but the weekly lineup trails the names.",
    now: "Ja'Marr Chase and Garrett Wilson headline a dangerous core, yet the redraft lineup ranks eighth and the tight-end room ranks 11th.",
    future: "The No. 6 dynasty core is stronger than the current-year rank, but the league's No. 11 youth profile creates pressure to keep refreshing the supporting cast.",
  },
  7: {
    headline: "A real 2026 threat with the league's sharpest age-and-depth warning.",
    now: "Achane, Hampton, and McCaffrey power the No. 5 redraft lineup. The WR room ranks last, which is especially painful with three FLEX spots.",
    future: "Dynasty rank nine, depth rank 12, and a middling pick inventory make this the clearest win-now roster on the board. The current window should be treated as perishable.",
  },
  5: {
    headline: "The future-facing WR core is ahead of the current lineup.",
    now: "Nabers and McMillan create weekly spike potential, but the redraft lineup ranks 10th and the RB room ranks last. The roster is not yet deep enough to hide that imbalance.",
    future: "The No. 2 youth profile, two 2027 firsts, and a top-eight dynasty core create one of the league's better ascent paths. The next move should add RB points without selling the WR foundation.",
  },
  11: {
    headline: "More useful assets than weekly difference-makers.",
    now: "The No. 9 redraft lineup and No. 10 dynasty core explain the retool label. Depth ranks fifth, so consolidation—not another broad accumulation phase—is the clearest route upward.",
    future: "A top-four youth profile and 12 picks over three years keep the runway open. Price, Lemon, and the next major trade will determine whether the roster becomes competitive before that value matures.",
  },
  4: {
    headline: "The league's youngest roster is a year away from being truly annoying.",
    now: "Depth ranks third, but both the dynasty core and redraft lineup sit 11th. Love and Breece Hall provide an RB base; quarterback remains the immediate bottleneck.",
    future: "The No. 1 youth profile and league-high 16 future picks create the strongest long rebuild runway. Patience is an asset here, provided volume eventually becomes premium starters.",
  },
  6: {
    headline: "A rebuild finally has a centerpiece, but the 2026 standings will still be uphill.",
    now: "The roster ranks 12th in redraft lineup, dynasty core, and total value. George Pickens and Carnell Tate are a start, not a full weekly offense.",
    future: "The draft added a face to the rebuild, but depth ranks 11th and the future-pick inventory is only average. The next cycle must add both liquidity and startable RB volume.",
  },
};

const draftSuperlatives = [
  ["Best foundational pick", "Carnell Tate · 1.03", "Consensus No. 2 talent to the league's clearest rebuild."],
  ["Best first-round value", "Makai Lemon · 1.06", "Every expert source placed him inside the top four."],
  ["Best Day 3 value", "Ted Hurst · 3.06", "Expert rank 19; selected 30th overall."],
  ["Largest conviction bet", "Cyrus Allen · 2.03", "Expert rank 40 versus live-market rank 17."],
] as const;

type NavId = "analysis" | "power" | "matchups" | "forecast";

type Route =
  | { kind: "nav"; id: NavId }
  | { kind: "team"; rank: number }
  | { kind: "powerTeam"; rosterId: number }
  | { kind: "methodology" };

const navItems: Array<{ id: NavId; label: string; icon: typeof BookOpenText }> = [
  { id: "analysis", label: "Analysis", icon: BookOpenText },
  { id: "power", label: "Power Rankings", icon: UsersThree },
  { id: "matchups", label: "Matchups", icon: Football },
  { id: "forecast", label: "Forecast", icon: ChartLineUp },
];

function padRank(rank: number) {
  return String(rank).padStart(2, "0");
}

function scoreLabel(value: number) {
  if (value >= 90) return "Elite";
  if (value >= 80) return "Strong";
  if (value >= 70) return "Solid";
  if (value >= 60) return "Mixed";
  return "Concern";
}

function insightFor(team: Team) {
  return leagueInsights.teams[String(team.rosterId)];
}

function dynastyGrade(rank: number) {
  return ["A+", "A", "A", "A−", "B+", "B+", "B", "B", "B−", "C+", "C", "D+"][rank - 1] ?? "—";
}

function ordinal(value: number | null) {
  if (!value) return "—";
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function rankBar(rank: number) {
  return `${Math.max(8, ((13 - rank) / 12) * 100)}%`;
}

function draftCycleScore(team: Team) {
  return Number((team.scores.execution * 0.6 + team.scores.capital * 0.3 + team.scores.fit * 0.1).toFixed(1));
}

function gradeDraftScore(score: number, hasPicks = true) {
  if (!hasPicks) return "INC";
  if (score >= 95) return "A+";
  if (score >= 92) return "A";
  if (score >= 87) return "A−";
  if (score >= 80) return "B+";
  if (score >= 76.5) return "B";
  if (score >= 73) return "B−";
  if (score >= 68) return "C+";
  if (score >= 60) return "C";
  if (score >= 50) return "C−";
  return "D";
}

function draftCycleGrade(team: Team) {
  return gradeDraftScore(draftCycleScore(team), team.picks.length > 0);
}

function rankComponentScore(rank: number) {
  return 100 - (rank - 1) * 5;
}

function viabilityGrade(score: number) {
  if (score >= 92) return "A";
  if (score >= 87) return "A−";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B−";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C−";
  return "D";
}

function competitionTier(rank: number) {
  if (rank === 1) return "Title favorite";
  if (rank <= 3) return "Championship tier";
  if (rank === 4) return "Contender";
  if (rank <= 7) return "Playoff bubble";
  if (rank <= 10) return "Outside looking in";
  return "Development year";
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

type PowerProfile = {
  rosterId: number;
  rank: number;
  grade: string;
  tier: string;
  score: number;
  lineupScore: number;
  depthScore: number;
  balanceScore: number;
  scoringScore: number;
  scoringRank: number;
  pointsPerGame: number;
  potentialPointsPerGame: number;
  lineupEfficiency: number;
  lineupVsMedian: number;
  depthVsMedian: number;
  eliteCount: number;
  startableCount: number;
  topThreeShare: number;
  rbShare: number;
  volatilityScore: number;
  volatilityLabel: string;
};

const priorScoringOrder = [...teams].sort(
  (a, b) => (insightFor(b).previousSeason?.pointsFor ?? 0) - (insightFor(a).previousSeason?.pointsFor ?? 0),
);
const priorScoringRanks = new Map(priorScoringOrder.map((team, index) => [team.rosterId, index + 1]));
const medianLineupValue = median(teams.map((team) => insightFor(team).metrics.redraftLineupValue));
const medianDepthValue = median(teams.map((team) => insightFor(team).metrics.depthValue));

const powerProfiles: PowerProfile[] = teams
  .map((team) => {
    const insight = insightFor(team);
    const metrics = insight.metrics;
    const history = insight.previousSeason;
    const games = history ? history.wins + history.losses + history.ties : 0;
    const scoringRank = priorScoringRanks.get(team.rosterId) ?? 12;
    const lineupScore = rankComponentScore(metrics.redraftLineupRank);
    const depthScore = rankComponentScore(metrics.depthRank);
    const balanceScore =
      rankComponentScore(metrics.qbRoomRank) * 0.1 +
      rankComponentScore(metrics.rbRoomRank) * 0.3 +
      rankComponentScore(metrics.wrRoomRank) * 0.45 +
      rankComponentScore(metrics.teRoomRank) * 0.15;
    const scoringScore = rankComponentScore(scoringRank);
    const score = lineupScore * 0.55 + depthScore * 0.25 + balanceScore * 0.1 + scoringScore * 0.1;
    const relevantPlayers = insight.redraftBoard.filter((player) => player.redraftValue > 0).slice(0, 10);
    const relevantValue = relevantPlayers.reduce((total, player) => total + player.redraftValue, 0) || 1;
    const topThreeShare = relevantPlayers.slice(0, 3).reduce((total, player) => total + player.redraftValue, 0) / relevantValue;
    const rbShare = relevantPlayers.filter((player) => player.position === "RB").reduce((total, player) => total + player.redraftValue, 0) / relevantValue;
    const concentrationRisk = Math.max(0, Math.min(100, ((topThreeShare - 0.35) / 0.3) * 100));
    const depthRisk = ((metrics.depthRank - 1) / 11) * 100;
    const volatilityScore = concentrationRisk * 0.4 + depthRisk * 0.35 + rbShare * 100 * 0.25;
    return {
      rosterId: team.rosterId,
      rank: 0,
      grade: "—",
      tier: "",
      score: Number(score.toFixed(1)),
      lineupScore,
      depthScore,
      balanceScore: Number(balanceScore.toFixed(1)),
      scoringScore,
      scoringRank,
      pointsPerGame: games ? Number((history!.pointsFor / games).toFixed(1)) : 0,
      potentialPointsPerGame: games ? Number((history!.potentialPoints / games).toFixed(1)) : 0,
      lineupEfficiency: history?.potentialPoints ? Number(((history.pointsFor / history.potentialPoints) * 100).toFixed(1)) : 0,
      lineupVsMedian: Number((((metrics.redraftLineupValue / medianLineupValue) - 1) * 100).toFixed(1)),
      depthVsMedian: Number((((metrics.depthValue / medianDepthValue) - 1) * 100).toFixed(1)),
      eliteCount: insight.redraftBoard.filter((player) => player.redraftRank && player.redraftRank <= 36).length,
      startableCount: insight.redraftBoard.filter((player) => player.redraftRank && player.redraftRank <= 120).length,
      topThreeShare: Number((topThreeShare * 100).toFixed(1)),
      rbShare: Number((rbShare * 100).toFixed(1)),
      volatilityScore: Number(volatilityScore.toFixed(1)),
      volatilityLabel: volatilityScore <= 35 ? "Stable" : volatilityScore <= 55 ? "Balanced" : volatilityScore <= 70 ? "Volatile" : "High variance",
    };
  })
  .sort((a, b) => b.score - a.score)
  .map((profile, index) => ({
    ...profile,
    rank: index + 1,
    grade: viabilityGrade(profile.score),
    tier: competitionTier(index + 1),
  }));

function powerProfileFor(team: Team) {
  return powerProfiles.find((profile) => profile.rosterId === team.rosterId)!;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function playerVolatilityScore(player: RedraftPlayer) {
  const trendRate = player.dynastyValue ? Math.abs(player.trend30Day) / player.dynastyValue : 0;
  return (
    (player.position === "RB" ? 28 : 0) +
    (player.age && player.age >= 28 ? 24 : 0) +
    (player.age && player.age <= 23.5 ? 16 : 0) +
    (!player.redraftRank || player.redraftRank > 72 ? 18 : 0) +
    (trendRate >= 0.06 ? 18 : 0) +
    (player.rosterStatus !== "starter" ? 8 : 0)
  );
}

function playerVolatilityLabel(player: RedraftPlayer) {
  const trendRate = player.dynastyValue ? Math.abs(player.trend30Day) / player.dynastyValue : 0;
  if (player.position === "RB" && player.age && player.age >= 28) return "Veteran RB exposure";
  if (player.position === "RB") return "RB role / health swing";
  if (player.age && player.age <= 23.5 && (!player.redraftRank || player.redraftRank > 72)) return "Young role still forming";
  if (trendRate >= 0.06) return "Fast-moving market";
  if (player.redraftRank && player.redraftRank <= 48) return "Weekly anchor";
  return "Flex-role variance";
}

function volatilePlayersFor(team: Team) {
  return insightFor(team).redraftBoard
    .filter((player) => player.redraftValue > 0)
    .slice(0, 12)
    .sort((a, b) => playerVolatilityScore(b) - playerVolatilityScore(a) || (a.redraftRank ?? 999) - (b.redraftRank ?? 999))
    .slice(0, 4);
}

function pickNumber(slot: string) {
  const [round, position] = slot.split(".").map(Number);
  return (round - 1) * 12 + position;
}

function pickAnalysis(team: Team, pick: Pick) {
  const overall = pickNumber(pick.slot);
  const expertGap = pick.expertRank ? overall - pick.expertRank : 0;
  const marketGap = pick.marketRank ? overall - pick.marketRank : 0;
  const audit = insightFor(team).draftAudit.picks.find((entry) => entry.slot === pick.slot);
  const marketRatio = audit?.marketValueRatio ?? 1;
  const expertRatio = audit?.expertValueRatio ?? 1;
  const blendedRatio = (marketRatio + expertRatio) / 2;
  let label = "Defensible value";
  let tone = "neutral";
  let grade = "B";
  let boardRead = `This pick returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value across the expert and market curves—a reasonable price without a major surplus.`;

  if (blendedRatio >= 1.2) {
    label = "Premium value";
    tone = "positive";
    grade = "A+";
    boardRead = `This is the pick that drives the class: it returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value, with both curves pricing ${pick.player} above pick ${overall}.`;
  } else if (blendedRatio >= 1.1) {
    label = "Clear value";
    tone = "positive";
    grade = "A";
    boardRead = `The selection created a real cushion, returning ${(blendedRatio * 100).toFixed(1)}% of slot value across the two curves.`;
  } else if (blendedRatio >= 1.03) {
    label = "Positive value";
    tone = "positive";
    grade = "A−";
    boardRead = `The pick beat its expected cost by ${(blendedRatio * 100 - 100).toFixed(1)}%, enough to create value without overstating a small rank gap.`;
  } else if (blendedRatio >= 0.98) {
    label = "Market price";
    grade = "B+";
    boardRead = `The player returned ${(blendedRatio * 100).toFixed(1)}% of expected value. That is disciplined slot execution, even if it is not a steal.`;
  } else if (blendedRatio < 0.85) {
    label = "Reach";
    tone = "warning";
    grade = blendedRatio < 0.75 ? "D" : "C";
    boardRead = `The pick retained only ${(blendedRatio * 100).toFixed(1)}% of expected slot value. Both the nonlinear value curve and the rank board indicate that trading down was the cleaner process.`;
  } else if (blendedRatio < 0.93) {
    label = "Aggressive bet";
    tone = "warning";
    grade = "C+";
    boardRead = `The selection returned ${(blendedRatio * 100).toFixed(1)}% of expected slot value. The miss is survivable, but the player must outperform the tier.`;
  }

  const rankRead = expertGap === 0 && marketGap === 0
    ? " Both ordinal boards matched the slot exactly."
    : ` Expert rank ${pick.expertRank}; market rank ${pick.marketRank}; selected ${overall}${expertGap >= 0 || marketGap >= 0 ? "." : "—ahead of both signals."}`;

  const formatRead = pick.position === "QB"
    ? "In this 1QB, four-point pass-TD format, the payoff requires starter-level value or a future trade market."
    : pick.position === "TE"
      ? "With no TE premium, the player needs a credible starting path—not merely an interesting athletic profile."
      : `The three-FLEX lineup gives another ${pick.position} more ways to become useful than it would have in a shallow format.`;
  const capitalRead = pick.acquired
    ? " Because the pick was acquired, its trade cost remains part of the permanent cycle grade."
    : " The selection came from original capital, so no volume bonus or acquisition penalty applies.";

  return { grade, label, tone, copy: `${boardRead}${rankRead} ${formatRead}${capitalRead}`, team: team.name, blendedRatio };
}

function SiteNav({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="site-nav__brand" aria-hidden="true">
        <img src="./assets/app/league-seal.png" alt="" />
        <span>Ape’s Mac Salad</span>
      </div>
      <div className="site-nav__links">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            className={active === item.id ? "bottom-nav__item is-active" : "bottom-nav__item"}
            key={item.id}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon size={25} weight={active === item.id ? "duotone" : "regular"} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function AppHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="masthead">
      <img className="league-seal" src="./assets/app/league-seal.png" alt="Ape’s Mac Salad league seal" />
      <p className="masthead__name">Ape’s Mac Salad · Dynasty</p>
      <button className="icon-button" type="button" aria-label="Open methodology" onClick={onMenu}>
        <List size={29} weight="regular" aria-hidden="true" />
      </button>
    </header>
  );
}

function AnalysisScreen({
  onTeam,
  onNavigate,
  onMethodology,
}: {
  onTeam: (team: Team) => void;
  onNavigate: (id: NavId) => void;
  onMethodology: () => void;
}) {
  const featured = teams[0];
  const board = teams.slice(1);

  return (
    <div className="app-screen almanac-screen web-screen">
      <main className="almanac-page" data-testid="almanac-screen">
        <AppHeader onMenu={onMethodology} />
        <section className="issue-intro">
          <h1>The 2026<br />Draft Analysis</h1>
          <p className="issue-deck">Every pick, trade, and roster fit—graded like a real draft desk, for this league.</p>
        </section>
        <div className="issue-rule" aria-label="Report status">
          <span>Aug 20 · {leagueInsights.draftState.status}</span>
          <span>{leagueInsights.draftState.picksMade} / {leagueInsights.draftState.totalPicks} picks</span>
        </div>
        <button className="lead-story" type="button" onClick={() => onTeam(featured)}>
          <div className="mac-salad-ribbon">
            <img className="mac-salad-trophy" src="./assets/app/mac-salad-trophy.webp" alt="" />
            <span><small>Inaugural draft bowl</small><strong>{featured.manager} gets to eat Ape’s Mac Salad</strong></span>
          </div>
          <div className="lead-story__teamline">
            <span className="story-rank">01</span>
            <span className="story-rule" aria-hidden="true" />
            <h2>{featured.name}</h2>
          </div>
          <div className="lead-story__main">
            <span className="lead-grade">{draftCycleGrade(featured)}</span>
            <div>
              <h3>{featured.headline}</h3>
              <p>{featured.commentary}</p>
            </div>
          </div>
          <div className="lead-scores">
            <div><span>Pick execution</span><strong>{featured.scores.execution}</strong></div>
            <div><span>Capital</span><strong>{featured.scores.capital}</strong></div>
            <div><span>Roster fit</span><strong>{featured.scores.fit}</strong></div>
          </div>
        </button>
        <section className="board-section" aria-labelledby="board-title">
          <div className="section-heading">
            <h2 id="board-title">The Board</h2>
            <button type="button" onClick={() => onNavigate("power")}>Power ranks</button>
          </div>
          {board.map((team, index) => (
            <div key={team.name}>
              {index === 3 ? (
                <button className="editor-note" type="button" onClick={onMethodology}>
                  <Info size={20} weight="fill" aria-hidden="true" />
                  <em>Extra picks earn credit only after acquisition cost.</em>
                </button>
              ) : null}
              <button className="board-row" type="button" onClick={() => onTeam(team)}>
                <span className="board-row__rank">{padRank(team.rank)}</span>
                <span className="board-row__copy">
                  <strong>{team.name}</strong>
                  <em>{team.headline}</em>
                </span>
                <span className="board-row__grade">{draftCycleGrade(team)}</span>
                <ArrowRight size={22} weight="regular" aria-hidden="true" />
              </button>
            </div>
          ))}
          <section className="draft-notebook" aria-labelledby="notebook-title">
            <div className="section-heading">
              <h2 id="notebook-title">From the scouting notebook</h2>
              <ChartBar size={18} weight="duotone" aria-hidden="true" />
            </div>
            {draftSuperlatives.map(([label, winner, note]) => (
              <div className="notebook-row" key={label}>
                <span>{label}</span>
                <strong>{winner}</strong>
                <p>{note}</p>
              </div>
            ))}
          </section>
        </section>
        <p className="method-note">Provisional while the slow draft remains live. Grades use league-specific settings, four expert boards, current market values, and the full 2026-pick trade ledger.</p>
      </main>
    </div>
  );
}

function DetailHeader({ onBack, team, context, grade }: { onBack: () => void; team: Team; context: string; grade: string }) {
  return (
    <div className="detail-header">
      <button type="button" onClick={onBack} aria-label="Back"><ArrowLeft size={24} /></button>
      <div><span>{context}</span><strong>{team.name}</strong></div>
      <span className="detail-header__grade">{grade}</span>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-bar">
      <div className="score-bar__label"><span>{label}</span><span>{value || "—"} · {value ? scoreLabel(value) : "Pending"}</span></div>
      <div className="score-bar__track"><span style={{ width: value + "%" }} /></div>
    </div>
  );
}

function DraftTeamScreen({ team }: { team: Team }) {
  const [metric, setMetric] = useState<"expert" | "market">("expert");
  const selectedCapture = metric === "expert" ? team.expertCapture : team.marketCapture;
  const insight = insightFor(team);
  const expectedCapital = insight.draftAudit.picks.reduce((total, pick) => total + pick.expectedSlotValue, 0);
  const heaviestPick = [...insight.draftAudit.picks].sort((a, b) => b.expectedSlotValue - a.expectedSlotValue)[0];
  const heaviestPickWeight = heaviestPick && expectedCapital ? (heaviestPick.expectedSlotValue / expectedCapital) * 100 : 0;

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page" data-testid={"team-" + team.rank}>
        <section className="team-hero">
          <p className="eyebrow">{team.manager} · Draft rank #{team.rank}</p>
          {team.rank === 1 ? (
            <div className="team-award"><img src="./assets/app/mac-salad-trophy.webp" alt="" /><span>2026 Draft Mac Salad winner</span></div>
          ) : null}
          <span className="team-hero__label">Draft-cycle grade</span>
          <div className="team-hero__grade">{draftCycleGrade(team)}</div>
          <h1>{team.headline}</h1>
          <p>{team.commentary}</p>
        </section>
        <section className="detail-block grade-build">
          <div className="detail-title"><span>01</span><h2>Grade build</h2></div>
          <p className="detail-explainer">Permanent grade: 60% pick execution, 30% capital management, 10% roster construction.</p>
          <ScoreBar label="Pick execution" value={team.scores.execution} />
          <ScoreBar label="Capital management" value={team.scores.capital} />
          <ScoreBar label="Roster construction" value={team.scores.fit} />
          <div className="grade-compare">
            <div><span>Pick grade</span><strong>{insight.draftAudit.executionGrade}</strong></div>
            <div><span>Cycle grade</span><strong>{draftCycleGrade(team)}</strong><small>{draftCycleScore(team)} / 100</small></div>
          </div>
          {heaviestPick ? (
            <p className="grade-audit-note"><strong>Why the pick letters do not average evenly:</strong> selections are weighted by nonlinear slot value. {heaviestPick.slot} represents {heaviestPickWeight.toFixed(0)}% of this class’s expected draft capital, so its result matters far more than a fourth-round pick.</p>
          ) : null}
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>02</span><h2>Value captured</h2></div>
          <div className="metric-toggle" role="group" aria-label="Ranking source">
            <button className={metric === "expert" ? "is-active" : ""} onClick={() => setMetric("expert")} type="button">Expert board</button>
            <button className={metric === "market" ? "is-active" : ""} onClick={() => setMetric("market")} type="button">Live market</button>
          </div>
          <div className="capture-readout">
            <strong>{selectedCapture ? selectedCapture.toFixed(1) + "%" : "Pending"}</strong>
            <span>{selectedCapture ? (selectedCapture >= 100 ? "Value above slot cost" : "Value below slot cost") : "No selections yet"}</span>
          </div>
          <p className="source-note">Expert board blends four current 1QB sources. Market capture uses current 12-team, 1QB, half-PPR trade values.</p>
        </section>
        <section className="detail-block">
          <div className="detail-title"><span>03</span><h2>Pick-by-pick analysis</h2></div>
          <p className="detail-explainer">Each call uses the same nonlinear expert and market value curves as the aggregate pick grade, then adds league fit and acquisition context.</p>
          {team.picks.length ? (
            <div className="pick-list">
              {team.picks.map((pick) => {
                const analysis = pickAnalysis(team, pick);
                return (
                  <article className={`pick-card pick-card--${analysis.tone}`} key={pick.slot}>
                    <div className="pick-row">
                      <span className="pick-slot">{pick.slot}</span>
                      <span className="pick-player"><strong>{pick.player}</strong><small>{pick.position}{pick.acquired ? " · acquired pick" : " · original pick"}</small></span>
                      <span className="pick-ranks"><small>EXP {pick.expertRank}</small><small>MKT {pick.marketRank}</small></span>
                    </div>
                    <div className="pick-call"><span><b>{analysis.grade}</b>{analysis.label}</span><p>{analysis.copy}</p></div>
                  </article>
                );
              })}
            </div>
          ) : <p className="empty-state">No selection recorded through pick 4.09. The draft-cycle evaluation therefore rests on capital management rather than pick execution.</p>}
          <div className="pick-summary">
            <span><strong>{team.originalPicks}</strong> original</span>
            <span><strong>{team.acquiredPicks}</strong> acquired</span>
          </div>
        </section>
        <section className="detail-block capital-block">
          <div className="detail-title"><span>04</span><h2>Capital context</h2></div>
          <div className="capital-number">
            <strong>{team.capitalOutcome?.toFixed(1)}%</strong>
            <span>current value received vs. sent</span>
          </div>
          <p>{team.capitalNote}</p>
        </section>
        <section className="verdict-block">
          <p className="eyebrow">The verdict</p>
          <h2>{team.bestPick}</h2>
          <p>{team.verdict}</p>
          <div><span>Biggest question</span><strong>{team.question}</strong></div>
        </section>
      </main>
    </div>
  );
}

function PowerTeamScreen({ team }: { team: Team }) {
  const insight = insightFor(team);
  const metrics = insight.metrics;
  const profile = powerProfileFor(team);
  const powerRead = powerEditorial[team.rosterId];
  const history = insight.previousSeason;
  const featuredRedraft = insight.redraftBoard.slice(0, 10);
  const volatilityPlayers = volatilePlayersFor(team);
  const rooms = [
    { position: "QB", rank: metrics.qbRoomRank },
    { position: "RB", rank: metrics.rbRoomRank },
    { position: "WR", rank: metrics.wrRoomRank },
    { position: "TE", rank: metrics.teRoomRank },
  ];
  const strongestRoom = [...rooms].sort((a, b) => a.rank - b.rank)[0];
  const weakestRoom = [...rooms].sort((a, b) => b.rank - a.rank)[0];
  const gradeComponents = [
    { label: "Optimal lineup", weight: "55%", score: profile.lineupScore, detail: `#${metrics.redraftLineupRank}` },
    { label: "Usable depth", weight: "25%", score: profile.depthScore, detail: `#${metrics.depthRank}` },
    { label: "Position balance", weight: "10%", score: profile.balanceScore, detail: `${profile.balanceScore.toFixed(0)}` },
    { label: "2025 scoring", weight: "10%", score: profile.scoringScore, detail: `#${profile.scoringRank}` },
  ];

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page power-detail-page" data-testid={`power-team-${team.rosterId}`}>
        <section className="team-hero power-team-hero">
          <p className="eyebrow">{team.manager} · {profile.tier}</p>
          <span className="team-hero__label">2026 viability grade</span>
          <div className="team-hero__grade">{profile.grade}</div>
          <h1>{powerRead.headline}</h1>
          <p>{powerRead.now}</p>
          <div className="power-rank-stamp"><span>League rank</span><strong>#{profile.rank}</strong><em>{profile.score.toFixed(1)} / 100</em></div>
        </section>

        <section className="detail-block viability-build">
          <div className="detail-title"><span>01</span><h2>Why this grade</h2></div>
          <p className="detail-explainer">This is a current-year roster grade—not the team’s draft grade. It measures the lineup that can score now, the bench that can survive attrition, positional balance in this league, and last season’s scoring baseline.</p>
          <div className="power-metric-grid viability-summary">
            <div><span>2026 rank</span><strong>#{profile.rank}</strong><small>{profile.tier}</small></div>
            <div><span>Roster grade</span><strong>{profile.grade}</strong><small>{profile.score.toFixed(1)} / 100</small></div>
            <div><span>Lineup</span><strong>#{metrics.redraftLineupRank}</strong><small>current market</small></div>
            <div><span>Depth</span><strong>#{metrics.depthRank}</strong><small>bench value</small></div>
          </div>
          <div className="viability-formula">
            {gradeComponents.map((component) => (
              <div key={component.label}>
                <span><strong>{component.label}</strong><small>{component.weight} of grade</small></span>
                <i><b style={{ width: `${component.score}%` }} /></i>
                <em>{component.detail}</em>
              </div>
            ))}
          </div>
          <p className="source-note">The formula deliberately excludes 2026 draft execution. It uses 55% optimal-lineup strength, 25% depth, 10% league-adjusted positional balance, and 10% 2025 points scored.</p>
        </section>

        <section className="detail-block scoring-profile">
          <div className="detail-title"><span>02</span><h2>Scoring profile</h2></div>
          <div className="scoring-grid">
            <div><span>2025 PPG</span><strong>{profile.pointsPerGame.toFixed(1)}</strong><small>#{profile.scoringRank} in league</small></div>
            <div><span>Potential PPG</span><strong>{profile.potentialPointsPerGame.toFixed(1)}</strong><small>best-ball output</small></div>
            <div><span>Lineup efficiency</span><strong>{profile.lineupEfficiency.toFixed(1)}%</strong><small>actual / potential</small></div>
            <div><span>2026 lineup</span><strong>{signedPercent(profile.lineupVsMedian)}</strong><small>vs. league median</small></div>
          </div>
          <p className="detail-explainer">Last year’s team scored {profile.pointsPerGame.toFixed(1)} points per game and converted {profile.lineupEfficiency.toFixed(1)}% of its potential points. The current optimal-lineup market value sits {Math.abs(profile.lineupVsMedian).toFixed(1)}% {profile.lineupVsMedian >= 0 ? "above" : "below"} the league median, which is the stronger forward-looking signal.</p>
          {history ? (
            <div className={history.finish === 1 ? "history-receipt is-champion" : "history-receipt"}>
              <ClockCounterClockwise size={25} weight="duotone" aria-hidden="true" />
              <div><span>2025 receipt</span><strong>{history.wins}–{history.losses}{history.ties ? `–${history.ties}` : ""} · {ordinal(history.finish)} finish</strong><small>{history.pointsFor.toLocaleString(undefined, { maximumFractionDigits: 1 })} points · {history.potentialPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} potential</small></div>
            </div>
          ) : null}
        </section>

        <section className="detail-block construction-profile">
          <div className="detail-title"><span>03</span><h2>Roster construction</h2></div>
          <div className="room-rank-grid">
            {rooms.map((room) => <div key={room.position}><span>{room.position}</span><strong>#{room.rank}</strong><small>{dynastyGrade(room.rank)}</small></div>)}
          </div>
          <p className="detail-explainer"><strong>{strongestRoom.position} is the clearest advantage at #{strongestRoom.rank}; {weakestRoom.position} is the pressure point at #{weakestRoom.rank}.</strong> With three FLEX spots, RB and WR depth carry more weekly leverage than surplus quarterback value, while tight end receives no scoring premium.</p>
          <div className="construction-facts">
            <div><span>Elite assets</span><strong>{profile.eliteCount}</strong><small>top-36 redraft players</small></div>
            <div><span>Startable pool</span><strong>{profile.startableCount}</strong><small>top-120 skill players</small></div>
            <div><span>Depth index</span><strong>{signedPercent(profile.depthVsMedian)}</strong><small>vs. league median</small></div>
          </div>
        </section>

        <section className="detail-block volatility-profile">
          <div className="detail-title"><span>04</span><h2>Stability & player volatility</h2></div>
          <div className="volatility-readout">
            <div><span>Volatility proxy</span><strong>{profile.volatilityLabel}</strong><em>{profile.volatilityScore.toFixed(0)} / 100 risk</em></div>
            <i><b style={{ width: `${profile.volatilityScore}%` }} /></i>
          </div>
          <div className="volatility-factors">
            <div><span>Top-three share</span><strong>{profile.topThreeShare.toFixed(1)}%</strong></div>
            <div><span>RB exposure</span><strong>{profile.rbShare.toFixed(1)}%</strong></div>
            <div><span>Depth rank</span><strong>#{metrics.depthRank}</strong></div>
          </div>
          <p className="detail-explainer">{profile.topThreeShare.toFixed(1)}% of the relevant redraft value sits in the top three players, while RBs account for {profile.rbShare.toFixed(1)}%. Combined with depth rank #{metrics.depthRank}, that produces a {profile.volatilityLabel.toLowerCase()} roster profile.</p>
          <div className="volatility-list">
            <span>Player watchlist</span>
            {volatilityPlayers.map((player) => {
              const trend = player.dynastyValue ? (player.trend30Day / player.dynastyValue) * 100 : 0;
              return (
                <div key={player.playerId}>
                  <span><strong>{player.player}</strong><small>{player.position} · age {player.age?.toFixed(1) ?? "—"} · {player.marketSlot.label}</small></span>
                  <em>{playerVolatilityLabel(player)}</em>
                  <b>{trend >= 0 ? "+" : ""}{trend.toFixed(1)}% 30d</b>
                </div>
              );
            })}
          </div>
          <p className="source-note">Volatility is a transparent proxy using top-player concentration, RB exposure, roster depth, age/role uncertainty, and 30-day dynasty-market movement. It is not observed weekly scoring standard deviation.</p>
        </section>

        <section className="detail-block redraft-block">
          <div className="detail-title"><span>05</span><h2>2026 scoring spine</h2></div>
          <p className="detail-explainer">Market-implied 12-team redraft slots show which players are expected to carry this lineup now—not what they may be worth in dynasty three years from today.</p>
          <div className="redraft-list">
            {featuredRedraft.map((player) => (
              <div className="redraft-row" key={player.playerId}>
                <span className="redraft-slot">{player.marketSlot.label === "Unranked" ? "—" : player.marketSlot.label}</span>
                <span><strong>{player.player}</strong><small>{player.position} · {player.nflTeam} · {player.rosterStatus}</small></span>
                <em>{player.redraftRank ? `#${player.redraftRank}` : "stash"}</em>
              </div>
            ))}
          </div>
          <details className="full-redraft-board"><summary>View all {insight.redraftBoard.length} skill-position players</summary><div className="redraft-list">{insight.redraftBoard.map((player) => <div className="redraft-row" key={player.playerId}><span className="redraft-slot">{player.marketSlot.label === "Unranked" ? "—" : player.marketSlot.label}</span><span><strong>{player.player}</strong><small>{player.position} · {player.nflTeam} · {player.rosterStatus}</small></span><em>{player.redraftRank ? `#${player.redraftRank}` : "stash"}</em></div>)}</div></details>
          <p className="source-note">{leagueInsights.redraftMethod} Kicker and team defense are excluded because the market feed does not value them on the same scale.</p>
        </section>

        <section className="detail-block runway-profile">
          <div className="detail-title"><span>06</span><h2>Three-year runway</h2></div>
          <div className="power-metric-grid">
            <div><span>Dynasty</span><strong>{dynastyGrade(metrics.dynastyCoreRank)}</strong><small>core #{metrics.dynastyCoreRank}</small></div>
            <div><span>Youth</span><strong>#{metrics.youthRank}</strong><small>{metrics.youthValueShare} share</small></div>
            <div><span>2027 firsts</span><strong>{metrics.futureFirsts}</strong><small>liquidity</small></div>
            <div><span>2027–29</span><strong>{metrics.futurePicksThreeYear}</strong><small>total picks</small></div>
          </div>
          <div className="horizon-read"><article><span>Win in 2026</span><p>{powerRead.now}</p></article><article><span>Build through 2028</span><p>{powerRead.future}</p></article></div>
          <div className="asset-list"><span>Dynasty foundation</span>{insight.topAssets.map((asset, index) => <div key={asset.player}><small>{String(index + 1).padStart(2, "0")}</small><strong>{asset.player}</strong><em>{asset.position} · {asset.nflTeam}</em></div>)}</div>
        </section>

        <section className="verdict-block power-verdict">
          <p className="eyebrow">2026 bottom line</p>
          <h2>{profile.tier}</h2>
          <p>{powerRead.headline} The clearest path to moving up is improving the {weakestRoom.position} room without weakening the current scoring spine.</p>
          <div><span>Ranking swing factor</span><strong>{profile.volatilityLabel} risk · {weakestRoom.position} room #{weakestRoom.rank}</strong></div>
        </section>
      </main>
    </div>
  );
}

function PowerRankingsScreen({ onTeam }: { onTeam: (team: Team) => void }) {
  const defendingChampion = teams.find((team) => team.rosterId === leagueInsights.previousSeason.championRosterId);
  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page">
        <p className="eyebrow">2026 league outlook</p>
        <h1>Power Rankings</h1>
        <p className="section-deck">Who can actually win this year—graded on scoring strength, lineup depth, roster balance, and the receipts from last season.</p>
        <div className="issue-rule"><span>Aug 20 snapshot</span><span>Sleeper + market data</span></div>
        {defendingChampion ? (
          <button className="champion-receipt" type="button" onClick={() => onTeam(defendingChampion)}>
            <Trophy size={30} weight="duotone" aria-hidden="true" />
            <span><small>2025 champion</small><strong>{defendingChampion.name}</strong><em>8–6 · won the title from the middle of the bracket</em></span>
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        ) : null}
        <div className="power-list">
          {powerProfiles.map((profile) => {
            const team = teams.find((candidate) => candidate.rosterId === profile.rosterId)!;
            const insight = insightFor(team);
            const history = insight.previousSeason;
            const editorial = powerEditorial[team.rosterId];
            return (
              <button className="power-card" type="button" key={team.name} onClick={() => onTeam(team)}>
                <div className="power-card__header">
                  <span className="power-card__rank">{padRank(profile.rank)}</span>
                  <div><strong>{team.name}</strong><small>{team.manager} · {profile.tier}</small></div>
                  <ArrowRight size={22} aria-hidden="true" />
                </div>
                <p>{editorial.headline}</p>
                <div className="power-card__metrics">
                  <div><span>Grade</span><strong>{profile.grade}</strong><small>{profile.score.toFixed(1)}</small></div>
                  <div><span>Lineup</span><strong>#{insight.metrics.redraftLineupRank}</strong></div>
                  <div><span>Depth</span><strong>#{insight.metrics.depthRank}</strong></div>
                  <div><span>Volatility</span><strong>{profile.volatilityScore.toFixed(0)}</strong><small>{profile.volatilityLabel}</small></div>
                </div>
                <div className="power-card__horizon" aria-label="Current-year versus dynasty rank">
                  <div><span>Viability</span><i><b style={{ width: `${profile.score}%` }} /></i><strong>{profile.score.toFixed(0)}</strong></div>
                  <div><span>3-year</span><i><b style={{ width: rankBar(insight.metrics.dynastyCoreRank) }} /></i><strong>#{insight.metrics.dynastyCoreRank}</strong></div>
                </div>
                {history ? <div className="power-card__history"><span>2025</span><strong>{history.wins}–{history.losses} · {ordinal(history.finish)}</strong><em>{history.pointsFor.toLocaleString(undefined, { maximumFractionDigits: 0 })} PF</em></div> : null}
              </button>
            );
          })}
        </div>
        <p className="method-note">The 2026 ranking is 55% current optimal-lineup strength, 25% usable depth, 10% positional balance calibrated to this three-FLEX format, and 10% prior-season scoring. Letters come from the resulting score—not a forced league distribution. Dynasty grade and three-year rank are reported separately and cannot inflate the current-year grade.</p>
      </main>
    </div>
  );
}

function MatchupsScreen() {
  const topServingCount = macSaladStandings[0]?.count ?? 0;
  const kongLeaders = macSaladStandings.filter((entry) => entry.count === topServingCount);

  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page future-page">
        <p className="eyebrow">Every Tuesday</p>
        <h1>The Weekend<br />Review</h1>
        <p className="section-deck">Matchup stories will explain what happened—not just repeat the final score.</p>
        <div className="issue-rule"><span>Begins Week 1</span><span>Tuesday AM</span></div>
        <section className="weekly-award">
          <img src="./assets/app/mac-salad-trophy.webp" alt="" />
          <div>
            <span>The weekly honor</span>
            <h2>Who gets to eat Ape’s Mac Salad?</h2>
            <p>Every Tuesday, one manager earns the bowl for the league's best performance—not automatically the highest score. Upset quality, lineup decisions, opponent strength, and how far the result beat expectation all matter.</p>
          </div>
        </section>
        <section className="hall-of-mac" aria-labelledby="hall-of-mac-title">
          <header className="hall-heading">
            <div>
              <span>Permanent league record</span>
              <h2 id="hall-of-mac-title">Hall of Mac</h2>
              <p>Every bowl gets a permanent receipt. Draft and weekly winners each add one serving to the annual race.</p>
            </div>
            <div className="hall-total"><strong>{String(macSaladHistory.awards.length).padStart(2, "0")}</strong><small>{macSaladHistory.awards.length === 1 ? "serving" : "servings"}</small></div>
          </header>
          <div className="hall-grid">
            <article className="kong-card">
              <img src="./assets/app/mac-salad-trophy.webp" alt="" />
              <div className="kong-card__copy">
                <span>Year-end crown · {macSaladHistory.currentSeason}</span>
                <h3>Kong Mac Salad Award</h3>
                <p>The manager who collects the most Ape’s Mac Salads across the draft and weekly awards takes home the annual Kong.</p>
                <div className="kong-leader">
                  <small>{kongLeaders.length > 1 ? "Current co-leaders" : "Current leader"}</small>
                  <strong>{kongLeaders.map((leader) => leader.manager).join(" · ") || "Race opens Week 1"}</strong>
                  <em>{topServingCount} {topServingCount === 1 ? "serving" : "servings"}</em>
                </div>
              </div>
            </article>
            <div className="hall-ledger">
              {macSaladSeasons.map((season) => {
                const seasonAwards = macSaladHistory.awards.filter((award) => award.season === season);
                return (
                  <section className="hall-season" key={season} aria-label={`${season} Mac Salad winners`}>
                    <div className="hall-ledger__head"><span>{season} serving ledger</span><strong>{seasonAwards.length} {seasonAwards.length === 1 ? "award" : "awards"}</strong></div>
                    {[...seasonAwards].reverse().map((award) => (
                      <article className="hall-entry" key={award.id}>
                        <time dateTime={award.date}>{award.displayDate}</time>
                        <div><strong>{award.manager}</strong><small>{award.team} · {award.occasion}</small><p>{award.reason}</p></div>
                        <span>+1</span>
                      </article>
                    ))}
                  </section>
                );
              })}
              <p className="hall-ledger__next">Weekly servings begin after Week 1. Every Tuesday winner will be added here.</p>
            </div>
          </div>
        </section>
        <section className="future-feature">
          <span>Lead story</span>
          <h2>The upset, the lineup decision and the player who swung the week</h2>
          <p>Each matchup gets an original recap built from final scores, expected points, lineup efficiency and the largest player-level swings.</p>
        </section>
        <div className="story-metrics">
          <div><strong>01</strong><span>Points left on bench</span></div>
          <div><strong>02</strong><span>Lineup efficiency</span></div>
          <div><strong>03</strong><span>Upset index</span></div>
          <div><strong>04</strong><span>Weekly luck</span></div>
        </div>
        <p className="method-note">Stories will use structured matchup data first; commentary is generated only after the underlying facts pass validation.</p>
      </main>
    </div>
  );
}

function ForecastScreen() {
  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page future-page">
        <p className="eyebrow">Weekly model</p>
        <h1>Season Forecast</h1>
        <p className="section-deck">A week-by-week view of where every team is headed—and how quickly the outlook is changing.</p>
        <div className="issue-rule"><span>Model opens Week 1</span><span>Monte Carlo</span></div>
        <section className="forecast-preview">
          <div><span>Projected record</span><strong>—</strong><small>After Week 1</small></div>
          <div><span>Playoff odds</span><strong>—</strong><small>After Week 1</small></div>
          <div><span>Median finish</span><strong>—</strong><small>After Week 1</small></div>
        </section>
        <section className="trend-explainer">
          <h2>What will move the line</h2>
          <ol>
            <li><span>01</span><p><strong>Actual record</strong>Every completed matchup changes the remaining paths.</p></li>
            <li><span>02</span><p><strong>Lineup strength</strong>Projected starters matter more than total roster value.</p></li>
            <li><span>03</span><p><strong>Schedule difficulty</strong>Every team is simulated against its remaining opponents.</p></li>
            <li><span>04</span><p><strong>Availability</strong>Injuries and role changes adjust weekly uncertainty.</p></li>
          </ol>
        </section>
      </main>
    </div>
  );
}

function MethodologyScreen() {
  return (
    <div className="app-screen methodology-screen web-screen">
      <main className="methodology-page">
        <p className="eyebrow">How to read this</p>
        <h1>League-specific by design</h1>
        <p className="section-deck">Generic rookie rankings are only the starting point. These grades reflect the rules, the price paid to get each pick, and the roster that has to use it.</p>
        <section><span>60%</span><div><h2>Pick execution</h2><p>Expert consensus and current trade-market value captured at the exact selection.</p></div></section>
        <section><span>30%</span><div><h2>Capital management</h2><p>Current value received versus sent in every trade containing a 2026 rookie pick.</p></div></section>
        <section><span>10%</span><div><h2>Roster construction</h2><p>Positional fit, competitive window and the value of consolidation versus diversification.</p></div></section>
        <div className="rules-box">
          <h2>The rules that matter</h2>
          <p>12 teams · 1QB · half-PPR · 4-point pass TD · no TE premium · three FLEX · two rookie taxi spots.</p>
        </div>
        <div className="rules-box history-method">
          <h2>Historical results</h2>
          <p>The app follows Sleeper's previous_league_id into the 2025 league, then combines regular-season roster records and points with the winners and consolation brackets to reconstruct final finish.</p>
        </div>
        <div className="rules-box power-method">
          <h2>Power Rankings are a separate grade</h2>
          <p>The 2026 viability score is 55% current optimal-lineup strength, 25% usable depth, 10% positional balance calibrated to three FLEX spots, and 10% 2025 scoring. Letter grades come from score thresholds rather than a forced curve. Draft grades do not enter the calculation; dynasty strength and the three-year runway are shown alongside the grade, but cannot inflate it.</p>
        </div>
        <p className="source-note">Sources: Sleeper league, roster, matchup, bracket, draft, and transaction data; FantasyCalc dynasty and redraft values; FantasyPros ECR; RotoBaller; Justin Boone; and DraftSharks. Snapshot: Aug 20, 2026.</p>
      </main>
    </div>
  );
}

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (value === "methodology") return { kind: "methodology" };
  if (value.startsWith("power-team-")) {
    const rosterId = Number(value.slice("power-team-".length));
    if (teams.some((team) => team.rosterId === rosterId)) return { kind: "powerTeam", rosterId };
  }
  if (value.startsWith("team-")) {
    const rank = Number(value.slice(5));
    if (teams.some((team) => team.rank === rank)) return { kind: "team", rank };
  }
  if (value === "teams" || value === "power-rankings" || value === "power") {
    return { kind: "nav", id: "power" };
  }
  if (value === "analysis" || value === "matchups" || value === "forecast") {
    return { kind: "nav", id: value };
  }
  if (value === "almanac") return { kind: "nav", id: "analysis" };
  return { kind: "nav", id: "analysis" };
}

function routeHash(route: Route) {
  if (route.kind === "team") return `#team-${route.rank}`;
  if (route.kind === "powerTeam") return `#power-team-${route.rosterId}`;
  if (route.kind === "methodology") return "#methodology";
  if (route.id === "power") return "#power-rankings";
  return route.id === "analysis" ? "#analysis" : `#${route.id}`;
}

export default function Prototype() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const initial = routeFromHash();
    if (initial.kind === "nav") return initial.id;
    return initial.kind === "powerTeam" ? "power" : "analysis";
  });

  useEffect(() => {
    const handleHash = () => {
      const next = routeFromHash();
      setRoute(next);
      if (next.kind === "nav") setActiveNav(next.id);
      if (next.kind === "powerTeam") setActiveNav("power");
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

  const selectedTeam = route.kind === "team" ? teams.find((team) => team.rank === route.rank) : undefined;
  const selectedPowerTeam = route.kind === "powerTeam" ? teams.find((team) => team.rosterId === route.rosterId) : undefined;

  return (
    <div className="site-shell">
      <SiteNav active={activeNav} onNavigate={(id) => go({ kind: "nav", id })} />
      <div className="site-content">
        {route.kind === "powerTeam" ? (
          selectedPowerTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedPowerTeam} context="Power Rankings" grade={powerProfileFor(selectedPowerTeam).grade} />
              <PowerTeamScreen team={selectedPowerTeam} />
            </>
          ) : (
            <PowerRankingsScreen onTeam={(team) => go({ kind: "powerTeam", rosterId: team.rosterId })} />
          )
        ) : route.kind === "team" ? (
          selectedTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedTeam} context="Draft Analysis" grade={draftCycleGrade(selectedTeam)} />
              <DraftTeamScreen team={selectedTeam} />
            </>
          ) : (
            <AnalysisScreen
              onTeam={(team) => go({ kind: "team", rank: team.rank })}
              onNavigate={(id) => go({ kind: "nav", id })}
              onMethodology={() => go({ kind: "methodology" })}
            />
          )
        ) : route.kind === "methodology" ? (
          <>
            <div className="detail-header methodology-header">
              <button type="button" onClick={goBack} aria-label="Back"><ArrowLeft size={24} /></button>
              <div><span>Draft Analysis</span><strong>Methodology</strong></div>
            </div>
            <MethodologyScreen />
          </>
        ) : route.id === "power" ? (
          <PowerRankingsScreen onTeam={(team) => go({ kind: "powerTeam", rosterId: team.rosterId })} />
        ) : route.id === "matchups" ? (
          <MatchupsScreen />
        ) : route.id === "forecast" ? (
          <ForecastScreen />
        ) : (
          <AnalysisScreen
            onTeam={(team) => go({ kind: "team", rank: team.rank })}
            onNavigate={(id) => go({ kind: "nav", id })}
            onMethodology={() => go({ kind: "methodology" })}
          />
        )}
      </div>
    </div>
  );
}
