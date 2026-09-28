import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { copyRecapText, matchupQuip, recapHonors } from "./recap-roundup";

type Props = {
  week: number;
  matchups: any[];
  publication: string;
  roundupOnly: boolean;
  onDeepDive?: (matchupId: number) => void;
};

export default function RecapRoundup({ week, matchups, publication, roundupOnly, onDeepDive }: Props) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const honors = recapHonors(matchups);
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const roundupUrl = `${base}#recaps/week-${week}/roundup`;

  const copy = async (kind: "text" | "link") => {
    const lines = matchups.map((matchup) =>
      `• ${matchupQuip(matchup, honors)}\n  Deep dive: ${base}#recaps/week-${week}/matchup-${matchup.matchupId}`
    );
    const value = kind === "link"
      ? roundupUrl
      : `${publication.toUpperCase()} · WEEK ${week} MATCHUP RECAPS\n\n${lines.join("\n\n")}\n\nFull roundup: ${roundupUrl}`;
    if (await copyRecapText(value)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2500);
    }
  };

  return (
    <section className="recap-roundup" aria-labelledby="recap-roundup-title">
      <div className="recap-roundup-heading">
        <div>
          <p className="eyebrow">The league text · Week {week}</p>
          <h2 id="recap-roundup-title">Every matchup in two sentences</h2>
          <p>Quick hits for the group chat. Open any deep dive for the full story and box score.</p>
        </div>
        <div className="recap-roundup-actions">
          <button type="button" className="recap-roundup-copy" onClick={() => void copy("text")}>
            {copied === "text" ? "Copied league text" : "Copy all for league text"}
          </button>
          <button type="button" className="recap-roundup-link-copy" onClick={() => void copy("link")}>
            {copied === "link" ? "Copied roundup link" : "Copy roundup link"}
          </button>
        </div>
      </div>
      <ol className="recap-roundup-list">
        {matchups.map((matchup) => (
          <li key={matchup.matchupId}>
            <span className="recap-roundup-number">{String(matchup.matchupId).padStart(2, "0")}</span>
            <div>
              <p>{matchupQuip(matchup, honors)}</p>
              <a href={`#recaps/week-${week}/matchup-${matchup.matchupId}`} onClick={() => onDeepDive?.(matchup.matchupId)}>
                Read deep dive &amp; box score <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ol>
      <div className="recap-roundup-footer">
        {roundupOnly
          ? <a href={`#recaps/week-${week}`}>View full Week {week} recaps and standings <ArrowRight size={14} aria-hidden="true" /></a>
          : <a href={`#recaps/week-${week}/roundup`}>Open the shareable roundup <ArrowRight size={14} aria-hidden="true" /></a>}
      </div>
    </section>
  );
}
