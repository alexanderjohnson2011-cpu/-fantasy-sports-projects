import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function phaseOneCorrectness() {
  return {
    name: "phase-one-correctness",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("/src/Prototype.tsx")) return null;

      let next = code;
      const replaceRequired = (from: string, to: string, label: string) => {
        if (!next.includes(from)) throw new Error(`Phase 1 transform could not find ${label}`);
        next = next.replace(from, to);
      };

      // Draft ranks are derived from the published composite instead of stale rank literals.
      const teamBlock = /const teams: Team\[\] = \[([\s\S]*?)\n\];\n\nconst powerEditorial/;
      if (!teamBlock.test(next)) throw new Error("Phase 1 transform could not find the draft team block");
      next = next.replace(
        teamBlock,
        (_match, body) => `const teamInputs: Team[] = [${body}\n];\n\nconst teams: Team[] = [...teamInputs]\n  .sort((a, b) => draftCycleScore(b) - draftCycleScore(a) || a.rosterId - b.rosterId)\n  .map((team, index) => ({ ...team, rank: index + 1 }));\n\nconst powerEditorial`,
      );

      // A draft award cannot exist until every pick has been made.
      replaceRequired(
        "const macSaladHistory = macSaladAwardsJson as MacSaladHistory;",
        `const draftComplete = leagueInsights.draftState.picksMade >= leagueInsights.draftState.totalPicks;\nconst rawMacSaladHistory = macSaladAwardsJson as MacSaladHistory;\nconst macSaladHistory: MacSaladHistory = {\n  ...rawMacSaladHistory,\n  awards: rawMacSaladHistory.awards.filter((award) => award.occasion !== \"Draft\" || draftComplete),\n};`,
        "Mac Salad history initialization",
      );
      replaceRequired(
        '<div className="mac-salad-ribbon">',
        '{draftComplete ? <div className="mac-salad-ribbon">',
        "draft winner ribbon",
      );
      replaceRequired(
        '</div>\n          <div className="lead-story__teamline">',
        '</div> : null}\n          <div className="lead-story__teamline">',
        "draft winner ribbon close",
      );
      replaceRequired(
        "{team.rank === 1 ? (",
        "{draftComplete && team.rank === 1 ? (",
        "draft winner detail badge",
      );

      // The generated power rank is canonical; the browser calculates diagnostics, not a second ordering.
      replaceRequired(
        `.sort((a, b) => b.score - a.score)\n  .map((profile, index) => ({\n    ...profile,\n    rank: index + 1,\n    grade: viabilityGrade(profile.score),\n    tier: competitionTier(index + 1),\n  }));`,
        `.map((profile) => {\n    const rank = leagueInsights.teams[String(profile.rosterId)].metrics.powerRank;\n    return {\n      ...profile,\n      rank,\n      grade: viabilityGrade(profile.score),\n      tier: competitionTier(rank),\n    };\n  })\n  .sort((a, b) => a.rank - b.rank);`,
        "power ranking sort",
      );

      // Factual editorial corrections identified in the Phase 1 audit.
      replaceRequired("No. 6 redraft lineup", "No. 7 redraft lineup", "2 Dagos redraft rank copy");
      replaceRequired(
        "future-pick inventory is only average",
        "future-pick inventory is below average",
        "Final Boss future-pick copy",
      );

      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  plugins: [phaseOneCorrectness(), react()],
});
