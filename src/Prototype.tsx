import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChartLineUp,
  Football,
  Info,
  List,
  UsersThree,
} from "@phosphor-icons/react";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";

type Pick = {
  slot: string;
  player: string;
  position: string;
  expertRank?: number;
  marketRank?: number;
  acquired?: boolean;
};

type Team = {
  rank: number;
  powerRank: number;
  name: string;
  manager: string;
  grade: string;
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
    rank: 1,
    powerRank: 12,
    name: "Final Boss",
    manager: "OldManBacala",
    grade: "A−",
    pickGrade: "A",
    headline: "Great selections, weaker capital management",
    commentary: "A measured draft with championship intent—even if the roster is still rebuilding.",
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
    rank: 2,
    powerRank: 10,
    name: "Terry Tate’s Pain Train",
    manager: "mannyrsox24",
    grade: "A−",
    pickGrade: "A",
    headline: "Excellent picks; the full trade ledger lands near neutral",
    commentary: "Five picks plus a calculated Olave-for-RB reset created several paths forward.",
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
    rank: 3,
    powerRank: 5,
    name: "2 Dagos and A Dream",
    manager: "TGamby",
    grade: "A−",
    pickGrade: "A−",
    headline: "Value everywhere, with every pick aimed at a weakness",
    commentary: "A small class with almost no wasted motion and the league's best capital outcome.",
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
    rank: 4,
    powerRank: 11,
    name: "Bub’s Club",
    manager: "bubberdubber",
    grade: "B+",
    pickGrade: "B",
    headline: "Strong acquisition economics lift an uneven eight-pick haul",
    commentary: "Volume, volatility and one enormous safety net in Jeremiyah Love.",
    bestPick: "Omar Cooper at 2.01",
    question: "Why spend so much capital ahead of consensus after the early wins?",
    verdict: "The picks were mixed, but four acquired selections were earned through sharp capital management—not purchased through overpayment.",
    capitalNote: "Four of eight picks were acquired. The complete ledger returns 138.6% of value sent, earning an A for capital management without granting a volume bonus.",
    capitalOutcome: 138.6,
    expertCapture: 98.3,
    marketCapture: 99.6,
    originalPicks: 4,
    acquiredPicks: 4,
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
    ],
  },
  {
    rank: 5,
    powerRank: 3,
    name: "Ertz & Krafts",
    manager: "jccbraves99",
    grade: "B+",
    pickGrade: "B",
    headline: "Ordinary picks, excellent contender consolidation",
    commentary: "The trades were the real win: surplus TE depth became Chris Olave.",
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
    rank: 6,
    powerRank: 2,
    name: "Bijan And The Maye-ssiah",
    manager: "jcflash59",
    grade: "B",
    pickGrade: "C+",
    headline: "Capital wins rescue inefficient selections",
    commentary: "The positional plan made sense; the prices repeatedly did not.",
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
    rank: 7,
    powerRank: 9,
    name: "My Nabers Tetties",
    manager: "DRockefeller",
    grade: "B−",
    pickGrade: "C+",
    headline: "Efficiently acquired capital, uneven execution",
    commentary: "Seven selections never fully chose between value and conviction.",
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
    rank: 8,
    powerRank: 8,
    name: "Gridiron geezers",
    manager: "kong58",
    grade: "B−",
    pickGrade: "B−",
    headline: "Correct positions, expensive capital path",
    commentary: "The roster logic was impeccable; the board value was ordinary.",
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
    rank: 9,
    powerRank: 6,
    name: "arkinsjt",
    manager: "arkinsjt",
    grade: "B−",
    pickGrade: "B−",
    headline: "Near-neutral capital and sensible need picks",
    commentary: "Nicholas Singleton was boring-correct; Matt Hibner is the swing.",
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
    rank: 10,
    powerRank: 7,
    name: "Max’s Shadynasty",
    manager: "maxjabb",
    grade: "C+",
    pickGrade: "B−",
    headline: "One value pick cannot cover capital leakage",
    commentary: "Skyler Bell saves the class; Drew Allar was a luxury in 1QB.",
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
    rank: 11,
    powerRank: 4,
    name: "The Ape",
    manager: "sduda351",
    grade: "C−",
    pickGrade: "C−",
    headline: "Acquired picks magnify four below-market selections",
    commentary: "Four selections, four bets against the board—and three were acquired.",
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
    rank: 12,
    powerRank: 1,
    name: "Bronco Stampede",
    manager: "5FinkleRay",
    grade: "INC",
    pickGrade: "INC",
    headline: "The league favorite has not made a selection",
    commentary: "No pick through 4.08; the capital record currently grades as a C.",
    bestPick: "Not yet made",
    question: "Can the final pick address TE depth without sacrificing value?",
    verdict: "A late pick cannot materially change the league's No. 1 roster, but it can still become a useful taxi or trade asset.",
    capitalNote: "No selection through 4.08. Current capital retained is 83.8% of value sent, so the provisional capital-management mark is a C.",
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

type NavId = "almanac" | "teams" | "matchups" | "forecast";

type Route =
  | { kind: "nav"; id: NavId }
  | { kind: "team"; rank: number }
  | { kind: "methodology" };

const navItems: Array<{ id: NavId; label: string; icon: typeof BookOpenText }> = [
  { id: "almanac", label: "Almanac", icon: BookOpenText },
  { id: "teams", label: "Teams", icon: UsersThree },
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

function SiteNav({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="site-nav__brand" aria-hidden="true">
        <img src="./assets/app/league-seal.png" alt="" />
        <span>Ape Invitational</span>
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
      <img className="league-seal" src="./assets/app/league-seal.png" alt="Ape Invitational league seal" />
      <p className="masthead__name">Ape Invitational · Dynasty</p>
      <button className="icon-button" type="button" aria-label="Open methodology" onClick={onMenu}>
        <List size={29} weight="regular" aria-hidden="true" />
      </button>
    </header>
  );
}

function AlmanacScreen({
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
          <h1>The 2026<br />Draft Almanac</h1>
          <p className="issue-deck">Every pick, trade and roster fit—graded for your league.</p>
        </section>
        <div className="issue-rule" aria-label="Report status">
          <span>Aug 20 edition</span>
          <span>44 / 48 picks</span>
        </div>
        <button className="lead-story" type="button" onClick={() => onTeam(featured)}>
          <div className="lead-story__teamline">
            <span className="story-rank">01</span>
            <span className="story-rule" aria-hidden="true" />
            <h2>{featured.name}</h2>
          </div>
          <div className="lead-story__main">
            <span className="lead-grade">{featured.grade}</span>
            <div>
              <h3>A measured draft with championship intent</h3>
              <p>Nailed the pivot points and left with elite upside across the board. Strong core, flexible future.</p>
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
            <button type="button" onClick={() => onNavigate("teams")}>Power ranks</button>
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
                <span className="board-row__grade">{team.grade}</span>
                <ArrowRight size={22} weight="regular" aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
        <p className="method-note">Provisional while the slow draft remains live. Grades use league-specific settings and current source values.</p>
      </main>
    </div>
  );
}

function DetailHeader({ onBack, team }: { onBack: () => void; team: Team }) {
  return (
    <div className="detail-header">
      <button type="button" onClick={onBack} aria-label="Back to the draft board"><ArrowLeft size={24} /></button>
      <div><span>Draft dossier</span><strong>{team.name}</strong></div>
      <span className="detail-header__grade">{team.grade}</span>
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

function TeamScreen({ team }: { team: Team }) {
  const [metric, setMetric] = useState<"expert" | "market">("expert");
  const selectedCapture = metric === "expert" ? team.expertCapture : team.marketCapture;

  return (
    <div className="app-screen detail-screen web-screen">
      <main className="detail-page" data-testid={"team-" + team.rank}>
        <section className="team-hero">
          <p className="eyebrow">{team.manager} · Power rank #{team.powerRank}</p>
          <div className="team-hero__grade">{team.grade}</div>
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
            <div><span>Pick grade</span><strong>{team.pickGrade}</strong></div>
            <div><span>Cycle grade</span><strong>{team.grade}</strong></div>
          </div>
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
          <div className="detail-title"><span>03</span><h2>Draft haul</h2></div>
          {team.picks.length ? (
            <div className="pick-list">
              {team.picks.map((pick) => (
                <div className="pick-row" key={pick.slot}>
                  <span className="pick-slot">{pick.slot}</span>
                  <span className="pick-player"><strong>{pick.player}</strong><small>{pick.position}{pick.acquired ? " · acquired pick" : " · original pick"}</small></span>
                  <span className="pick-ranks"><small>EXP {pick.expertRank}</small><small>MKT {pick.marketRank}</small></span>
                </div>
              ))}
            </div>
          ) : <p className="empty-state">No selection recorded through pick 4.08.</p>}
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
        <section className="detail-block">
          <div className="detail-title"><span>05</span><h2>Roster read</h2></div>
          <div className="roster-grid">
            <div><span>Window</span><strong>{team.window}</strong></div>
            <div><span>Power rank</span><strong>#{team.powerRank} of 12</strong></div>
            <div><span>Strength</span><strong>{team.strength}</strong></div>
            <div><span>Pressure point</span><strong>{team.weakness}</strong></div>
          </div>
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

function TeamsScreen({ onTeam }: { onTeam: (team: Team) => void }) {
  const powerBoard = useMemo(() => [...teams].sort((a, b) => a.powerRank - b.powerRank), []);
  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page">
        <p className="eyebrow">Roster strength</p>
        <h1>League Power Board</h1>
        <p className="section-deck">A separate view from draft grades: current core, starting lineup, depth and future capital.</p>
        <div className="issue-rule"><span>Aug 20 snapshot</span><span>12 teams</span></div>
        <div className="power-list">
          {powerBoard.map((team) => (
            <button type="button" key={team.name} onClick={() => onTeam(team)}>
              <span>{padRank(team.powerRank)}</span>
              <div><strong>{team.name}</strong><small>{team.window}</small></div>
              <div><small>Draft</small><strong>{team.grade}</strong></div>
              <ArrowRight size={20} />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function MatchupsScreen() {
  return (
    <div className="app-screen section-screen web-screen">
      <main className="section-page future-page">
        <p className="eyebrow">Every Tuesday</p>
        <h1>The Weekend<br />Review</h1>
        <p className="section-deck">Matchup stories will explain what happened—not just repeat the final score.</p>
        <div className="issue-rule"><span>Begins Week 1</span><span>Tuesday AM</span></div>
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
        <p className="section-deck">Generic rookie rankings are only the starting point. These grades reflect the rules and the price paid to get each pick.</p>
        <section><span>60%</span><div><h2>Pick execution</h2><p>Expert consensus and current trade-market value captured at the exact selection.</p></div></section>
        <section><span>30%</span><div><h2>Capital management</h2><p>Current value received versus sent in every trade containing a 2026 rookie pick.</p></div></section>
        <section><span>10%</span><div><h2>Roster construction</h2><p>Positional fit, competitive window and the value of consolidation versus diversification.</p></div></section>
        <div className="rules-box">
          <h2>The rules that matter</h2>
          <p>12 teams · 1QB · half-PPR · 4-point pass TD · no TE premium · three FLEX · two rookie taxi spots.</p>
        </div>
        <p className="source-note">Sources: Sleeper league data, FantasyCalc trade values, FantasyPros ECR, RotoBaller, Justin Boone and DraftSharks. Snapshot: Aug 20, 2026.</p>
      </main>
    </div>
  );
}

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (value === "methodology") return { kind: "methodology" };
  if (value.startsWith("team-")) {
    const rank = Number(value.slice(5));
    if (teams.some((team) => team.rank === rank)) return { kind: "team", rank };
  }
  if (value === "teams" || value === "matchups" || value === "forecast") {
    return { kind: "nav", id: value };
  }
  return { kind: "nav", id: "almanac" };
}

function routeHash(route: Route) {
  if (route.kind === "team") return `#team-${route.rank}`;
  if (route.kind === "methodology") return "#methodology";
  return route.id === "almanac" ? "#almanac" : `#${route.id}`;
}

export default function Prototype() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const initial = routeFromHash();
    return initial.kind === "nav" ? initial.id : "almanac";
  });

  useEffect(() => {
    const handleHash = () => {
      const next = routeFromHash();
      setRoute(next);
      if (next.kind === "nav") setActiveNav(next.id);
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

  return (
    <div className="site-shell">
      <SiteNav active={activeNav} onNavigate={(id) => go({ kind: "nav", id })} />
      <div className="site-content">
        {route.kind === "team" ? (
          selectedTeam ? (
            <>
              <DetailHeader onBack={goBack} team={selectedTeam} />
              <TeamScreen team={selectedTeam} />
            </>
          ) : (
            <AlmanacScreen
              onTeam={(team) => go({ kind: "team", rank: team.rank })}
              onNavigate={(id) => go({ kind: "nav", id })}
              onMethodology={() => go({ kind: "methodology" })}
            />
          )
        ) : route.kind === "methodology" ? (
          <>
            <div className="detail-header methodology-header">
              <button type="button" onClick={goBack} aria-label="Back"><ArrowLeft size={24} /></button>
              <div><span>Draft Almanac</span><strong>Methodology</strong></div>
            </div>
            <MethodologyScreen />
          </>
        ) : route.id === "teams" ? (
          <TeamsScreen onTeam={(team) => go({ kind: "team", rank: team.rank })} />
        ) : route.id === "matchups" ? (
          <MatchupsScreen />
        ) : route.id === "forecast" ? (
          <ForecastScreen />
        ) : (
          <AlmanacScreen
            onTeam={(team) => go({ kind: "team", rank: team.rank })}
            onNavigate={(id) => go({ kind: "nav", id })}
            onMethodology={() => go({ kind: "methodology" })}
          />
        )}
      </div>
    </div>
  );
}
