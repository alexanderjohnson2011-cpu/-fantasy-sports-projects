import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const compiled = await mkdtemp(join(tmpdir(), 'ams-analytics-'));
let contract;
try {
  execFileSync('./node_modules/.bin/tsc', ['--ignoreConfig', 'src/analytics-contract.ts', '--target', 'es2022', '--module', 'esnext', '--skipLibCheck', '--outDir', compiled]);
  const javascript = await readFile(join(compiled, 'analytics-contract.js'), 'utf8');
  contract = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
} finally { await rm(compiled, { recursive: true, force: true }); }
const { publishedPowerProfile, championshipFavorite } = contract;
const power = JSON.parse(await readFile(new URL('../src/generated/power-rankings.json', import.meta.url), 'utf8'));
test('all detail profiles preserve the published ranking, exact score and components', () => {
  for (const row of power.teams) {
    const detail = publishedPowerProfile(power.teams, row.rosterId);
    for (const key of ['rank', 'score', 'lineupScore', 'depthScore', 'balanceScore']) assert.equal(detail[key], row[key]);
    assert.equal(detail.scoringScore, row.priorScore);
  }
});
test('missing roster cannot silently display the first team', () => {
  assert.throws(() => publishedPowerProfile(power.teams, 999), /Missing/);
});
test('favorite uses title probability, regardless of insertion order or projected finish', () => {
  const rows = [{ rosterId: 1, championshipProbability: 19.5, projectedRank: 1 }, { rosterId: 12, championshipProbability: 26.7, projectedRank: 2 }];
  assert.equal(championshipFavorite(rows).rosterId, 12);
  assert.equal(championshipFavorite([...rows].reverse()).rosterId, 12);
  assert.equal(championshipFavorite([]), undefined);
  assert.equal(rows[0].rosterId, 1);
});
test('equal title probabilities have stable roster-id ordering', () => {
  assert.equal(championshipFavorite([{ rosterId: 12, championshipProbability: 10 }, { rosterId: 1, championshipProbability: 10 }]).rosterId, 1);
});
