import { describe, expect, it } from 'vitest';
import { createCareer, applyCommand } from '../../src/domain';
import { catalog } from '../../src/data/catalog';
import {
  ATTRIBUTE_KEYS,
  type CareerState,
  type CommandPayload,
  type AttributeKey,
} from '../../src/contracts';
import { DEFAULT_PLAN } from '../../src/config/simulation';
import { buildCoachContext, canApplyCoach } from '../../src/ai/coach-context';
import { buildCareerFacts } from '../../src/ai/career-facts';
import { factsKey, coachKey, cachedCoach, saveCoach } from '../../src/ai/client';
import 'fake-indexeddb/auto';
function act(s: CareerState, p: CommandPayload) {
  const r = applyCommand(
    s,
    { ...p, commandId: `coach-test-${s.revision}`, expectedRevision: s.revision },
    catalog,
  );
  if (!r.ok) throw Error(r.error.code);
  return r.value;
}
function live() {
  const r = createCareer(4404, catalog);
  if (!r.ok) throw Error('create');
  const s = act(r.value, {
    type: 'CONFIRM_DRAFT',
    teamId: 'BOS',
    name: '教练测试',
    style: 'primaryCreator',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, r.value.initialCards[i].instanceId]),
    ) as Record<AttributeKey, string>,
  });
  return act(s, { type: 'START_FEATURED_MATCH' });
}
describe('coach facts and adoption boundary', () => {
  it('keeps each round average separate from the entire postseason average', () => {
    let s = live();
    for (let q = 0; q < 4; q++)
      s = act(s, { type: 'PLAY_FEATURED_QUARTER', plan: { ...DEFAULT_PLAN } });
    const first = structuredClone(s.matches[0]);
    first.input.stage = 'firstRound';
    first.homeBox[0].turnovers = 2;
    const final = structuredClone(first);
    final.matchId = 'synthetic-final';
    final.input.stage = 'final';
    final.homeBox[0].turnovers = 8;
    s.matches = [first, final];
    const facts = buildCareerFacts(s, 'all');
    expect(facts.facts.find((f) => f.id === 'playoffs')?.text).toContain('5.0失误');
    expect(facts.facts.find((f) => f.id === 'round:1')?.text).toContain('8.0失误');
    expect(facts.facts.find((f) => f.id === 'round:1')?.text).not.toContain('5.0失误');
  });
  it('has no future events or seeds and does not invent pregame statistics', () => {
    const s = live();
    const ctx = buildCoachContext(s, catalog)!;
    expect(ctx.completedQuarters).toBe(0);
    expect(ctx.facts.find((f) => f.id === 'own')?.text).toContain('尚未开赛');
    expect(JSON.stringify(ctx)).not.toMatch(/"(seed|events|initialCards|quarterPlans)"/);
    expect(ctx.focusCandidates.length).toBeLessThanOrEqual(6);
    expect(canApplyCoach(ctx, s)).toBe(true);
  });
  it('expires advice after progressing and only summarizes completed quarters', async () => {
    let s = live();
    const old = buildCoachContext(s, catalog)!;
    s = act(s, { type: 'PLAY_FEATURED_QUARTER', plan: { ...DEFAULT_PLAN } });
    const ctx = buildCoachContext(s, catalog)!;
    expect(canApplyCoach(old, s)).toBe(false);
    expect(ctx.facts.find((f) => f.id === 'situation')?.text).toContain(
      `${s.activeMatch!.preview!.homeScore}:${s.activeMatch!.preview!.awayScore}`,
    );
    expect(ctx.completedQuarters).toBe(1);
    expect(await coachKey(ctx)).not.toBe(await coachKey(old));
    const future = structuredClone(s);
    future.activeMatch!.preview!.events.push({
      ...future.activeMatch!.preview!.events[0],
      quarter: 2,
    });
    expect(buildCoachContext(future, catalog)).toBe(null);
  });
  it('excludes six-foul players from coach focus choices', () => {
    const s = act(live(), { type: 'PLAY_FEATURED_QUARTER', plan: { ...DEFAULT_PLAN } });
    const preview = s.activeMatch!.preview!;
    preview.homeBox.find((b) => b.playerId === 'original-player')!.fouls = 6;
    const teammate = preview.homeBox.find((b) => b.playerId !== 'original-player')!;
    teammate.fouls = 6;
    const ctx = buildCoachContext(s, catalog)!;
    expect(
      ctx.focusCandidates.some((p) => p.id === 'original-player' || p.id === teammate.playerId),
    ).toBe(false);
  });
  it('separates coach cache from reports and restores a saved recommendation', async () => {
    const ctx = buildCoachContext(live(), catalog)!;
    const key = await coachKey(ctx);
    expect(key).toMatch(/^coach:/);
    const r = {
      model: 'deepseek-flash',
      generatedAt: '2026-10-30T00:00:00Z',
      fingerprint: 'test',
      context: ctx,
      advice: {
        headline: '先稳住',
        analysis: [{ text: '尚未开赛', evidenceIds: ['situation'] }],
        plan: { ...DEFAULT_PLAN },
        reason: '保持均衡',
        tradeoff: '不偏向单一强项',
      },
    };
    await saveCoach(key, r);
    expect(await cachedCoach(key)).toEqual(r);
  });
  it('reuses an archived-season report after current player changes', async () => {
    let s = live();
    for (let q = 0; q < 4; q++)
      s = act(s, { type: 'PLAY_FEATURED_QUARTER', plan: { ...DEFAULT_PLAN } });
    s.seasonArchives.push({
      season: 1,
      teamId: 'BOS',
      wins: 1,
      losses: 0,
      championId: null,
      rank: 1,
    });
    const before = await factsKey(buildCareerFacts(s, 1));
    s.player = {
      ...s.player!,
      age: 25,
      attributes: { ...s.player!.attributes, outsideScoring: 99 },
    };
    s.growthLog.push('第2季：外线成长');
    s.season = 2;
    expect(await factsKey(buildCareerFacts(s, 1))).toBe(before);
  });
});
