export function recapHonors(matchups: any[]) {
  const results = matchups.filter((m) => m.winnerRosterId != null).map((m) => {
    const winner = m.winnerRosterId === m.teamA.rosterId ? m.teamA : m.teamB;
    const loser = winner === m.teamA ? m.teamB : m.teamA;
    return { id: m.matchupId, winner, loser, margin: Math.abs(winner.points - loser.points) };
  });
  const epic = [...results].sort((a, b) => b.margin - a.margin)[0];
  const gitty = results.filter((r) => r.loser.optimalPoints - r.loser.points >= 25 && r.loser.optimalPoints - r.loser.points > r.margin && r.loser.lineupEfficiency < 85)
    .sort((a, b) => (b.loser.optimalPoints - b.loser.points) - (a.loser.optimalPoints - a.loser.points))[0];
  const skine = results.filter((r) => r.id !== gitty?.id && r.loser.optimalPoints - r.loser.points >= 15)
    .sort((a, b) => a.loser.lineupEfficiency - b.loser.lineupEfficiency)[0];
  const sniff = [...results].filter((r) => r.winner.lineupEfficiency >= 95)
    .sort((a, b) => b.winner.lineupEfficiency - a.winner.lineupEfficiency)[0];
  return { epic: epic?.id, skine: skine?.id, gitty: gitty?.id, sniff: sniff?.id };
}

export function matchupQuip(matchup: any, honors: ReturnType<typeof recapHonors>): string {
  const a = matchup.teamA;
  const b = matchup.teamB;
  if (matchup.winnerRosterId == null) {
    return `${a.teamName} and ${b.teamName} finished level at ${a.points.toFixed(2)} apiece; even the scoreboard refused to pick a side. The league gets a tie and two managers get a whole week to argue about decimals.`;
  }
  const winner = matchup.winnerRosterId === a.rosterId ? a : b;
  const loser = winner === a ? b : a;
  const star = [...(winner.starters || [])].sort((left: any, right: any) => Number(right.points || 0) - Number(left.points || 0))[0];
  const margin = Math.abs(winner.points - loser.points);
  const flavor = Number(matchup.matchupId || 0) % 3;
  const first = margin <= 5
    ? `${winner.teamName} escaped ${loser.teamName} by ${margin.toFixed(2)} points; the league chat can start its recount conspiracy now.`
    : margin >= 35
      ? (flavor === 2
        ? `${winner.teamName} served ${loser.teamName} a ${margin.toFixed(2)}-point loss; the mercy rule apparently missed the group text.`
        : `${winner.teamName} flattened ${loser.teamName} by ${margin.toFixed(2)} points; the box score may need a content warning.`)
      : winner.points + loser.points >= 300
        ? `${winner.teamName} won a ${Math.round(winner.points + loser.points)}-point shootout over ${loser.teamName}; defense was an optional accessory.`
        : [
          `${winner.teamName} took down ${loser.teamName}, ${winner.points.toFixed(2)}–${loser.points.toFixed(2)}; the scoreboard has already filed the paperwork.`,
          `${winner.teamName} beat ${loser.teamName} by ${margin.toFixed(2)}; ${loser.teamName} can file its appeal with the scoreboard, which has already declined comment.`,
          `${winner.teamName} handed ${loser.teamName} a ${margin.toFixed(2)}-point loss; that's a receipt nobody asked to see.`,
        ][flavor];
  const missed = Number(loser.optimalPoints || loser.points) - loser.points;
  const second = honors.gitty === matchup.matchupId
    ? `Gitty Gat: ${loser.teamName} finished ${missed.toFixed(1)} points shy of its optimal lineup in a ${margin.toFixed(2)}-point loss; the alternate lineup had enough to win.`
    : honors.skine === matchup.matchupId
      ? `SKINE of the Week goes to ${loser.teamName}: ${missed.toFixed(1)} points shy of its optimal lineup and a loss to show for it; the lineup card is seeking privacy.`
      : honors.epic === matchup.matchupId && honors.sniff === matchup.matchupId
        ? `Epic Jerks honors go to ${winner.teamName} for the week's biggest win at +${margin.toFixed(2)}, and *Sniff* for converting ${winner.lineupEfficiency}% of its optimal lineup.`
        : honors.epic === matchup.matchupId
          ? `Epic Jerks honors go to ${winner.teamName} for the week's biggest win at +${margin.toFixed(2)}; ${star?.name || "the lineup"} supplied the loudest receipt.`
          : honors.sniff === matchup.matchupId
            ? `*Sniff*: ${winner.teamName} squeezed ${winner.lineupEfficiency}% out of its optimal lineup; ${star?.name || "the starters"} made the decision look very smart.`
            : star
    ? [
      `${star.name} dropped ${Number(star.points || 0).toFixed(2)} for the winners; the rest of the roster can sign the thank-you card.`,
      `${star.name} supplied ${Number(star.points || 0).toFixed(2)} points; ${loser.teamName} can save the excuses for the waiver wire.`,
      `${star.name} brought ${Number(star.points || 0).toFixed(2)} points to the potluck; ${loser.teamName} brought an appetite for next week.`,
    ][flavor]
    : `${loser.teamName} gets another shot next week, once the scoreboard stops staring back.`;
  return `${first} ${second}`;
}

export async function copyRecapText(text: string): Promise<boolean> {
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (copied) return true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
