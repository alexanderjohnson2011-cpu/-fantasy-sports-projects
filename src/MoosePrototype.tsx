import { useEffect, useState } from "react";
import { Phone } from "@phosphor-icons/react";

type MooseSection = "analysis" | "power" | "matchups" | "forecast" | "hall";

const sections: Array<[MooseSection, string]> = [
  ["analysis", "Draft Analysis"],
  ["power", "Power Rankings"],
  ["matchups", "Matchups"],
  ["forecast", "Forecast"],
  ["hall", "Hall of Callers"],
];

const copy: Record<MooseSection, { eyebrow: string; title: string; body: string }> = {
  analysis: {
    eyebrow: "2026 inaugural issue",
    title: "The draft story starts tonight.",
    body: "Pick-by-pick value, roster fit, and league-specific grades publish only after Yahoo’s final draft ledger is reconciled.",
  },
  power: {
    eyebrow: "League-wide viability",
    title: "Power Rankings",
    body: "Current-lineup strength, depth, balance, scoring history, and uncertainty populate after the verified Yahoo roster import.",
  },
  matchups: {
    eyebrow: "Weekly field guide",
    title: "Matchups",
    body: "Head-to-head projections and tactical previews arrive with the first verified Yahoo schedule release.",
  },
  forecast: {
    eyebrow: "Simulation desk",
    title: "Season Forecast",
    body: "Playoff, seed, title, and last-place probabilities are calculated from league-scoped simulations.",
  },
  hall: {
    eyebrow: "Permanent league record",
    title: "Hall of Callers",
    body: "No callers have been recorded yet. The draft winner and each weekly honoree are added only after approval.",
  },
};

function sectionFromHash(): MooseSection {
  const value = window.location.hash.replace(/^#\/?/, "") as MooseSection;
  return sections.some(([id]) => id === value) ? value : "analysis";
}

export default function MoosePrototype() {
  const [section, setSection] = useState<MooseSection>(() => sectionFromHash());
  const [release, setRelease] = useState<{ generatedAt: string; data: { sections?: Partial<Record<MooseSection, { summary?: string; items?: Array<{ title: string; value?: string; badge?: string; detail?: string }> }>> } } | null>(null);
  const active = copy[section];
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    fetch("./data/mooseys-mommy/release.json")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No release")))
      .then(setRelease)
      .catch(() => setRelease(null));
  }, []);
  const sectionData = release?.data?.sections?.[section];
  const items = sectionData?.items || [];
  useEffect(() => {
    document.title = "Moosey’s Mommy · Fantasy League Desk";
    document.querySelector('meta[name="description"]')?.setAttribute("content", "Moosey’s Mommy: a team-name-only fantasy league publication.");
  }, []);
  const navigate = (next: MooseSection) => {
    setSection(next);
    window.location.hash = next;
  };
  return (
    <div className="moose-publication">
      <header>
        <button type="button" className="moose-wordmark" onClick={() => navigate("analysis")}>
          <span><Phone size={27} weight="duotone" /></span><strong>Moosey’s Mommy</strong>
        </button>
        <nav aria-label="Primary">
          {sections.map(([id, label]) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} className={section === id ? "is-active" : ""} onClick={() => navigate(id)}>{label}</button>)}
        </nav>
      </header>
      <main>
        <div className="moose-hero-copy"><p className="draft-kicker">{active.eyebrow}</p><h1>{active.title}</h1><p className="moose-deck">{sectionData?.summary || active.body}</p></div>
        <img className="moose-hero-art" src="./assets/app/mooseys-mommy-og.png" alt="A suited moose answers a vintage telephone at a fantasy football draft desk." />
        {items.length ? <section className="moose-release-grid">{items.map((item, index) => <article key={`${item.title}-${index}`}><div>{item.badge ? <span>{item.badge}</span> : null}{item.value ? <strong>{item.value}</strong> : null}</div><h2>{item.title}</h2>{item.detail ? <p>{item.detail}</p> : null}</article>)}</section> : <section className="moose-empty"><Phone size={48} weight="thin" /><div><strong>{section === "hall" ? "The line is open." : "Awaiting the verified Yahoo release."}</strong><p>Team names only. No manager identity, private chat, platform account data, or restricted provider content is included in this publication.</p></div></section>}
        {section === "hall" ? <div className="caller-rule"><span>Weekly honor</span><strong>Gets to Call Moosey’s Mommy</strong></div> : null}
      </main>
      <footer>Moosey’s Mommy · {release?.generatedAt ? `Release ${new Date(release.generatedAt).toLocaleDateString()}` : "Awaiting first verified release"} · Versioned, source-aware data</footer>
    </div>
  );
}
