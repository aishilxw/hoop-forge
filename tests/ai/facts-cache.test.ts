import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createCareer, applyCommand } from '../../src/domain';
import { catalog } from '../../src/data/catalog';
import {
  ATTRIBUTE_KEYS,
  type CareerState,
  type CommandPayload,
  type AttributeKey,
} from '../../src/contracts';
import { buildCareerFacts, type AiReportRecord } from '../../src/ai/career-facts';
import { cachedReport, factsKey, saveReport } from '../../src/ai/client';
function act(state: CareerState, payload: CommandPayload) {
  const r = applyCommand(
    state,
    { ...payload, commandId: `ai-test-${state.revision}`, expectedRevision: state.revision },
    catalog,
  );
  if (!r.ok) throw Error(r.error.code);
  return r.value;
}
function ready() {
  const r = createCareer(4404, catalog);
  if (!r.ok) throw Error(r.error.code);
  return act(r.value, {
    type: 'CONFIRM_DRAFT',
    name: 'AI测试球员',
    style: 'primaryCreator',
    teamId: 'BOS',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, r.value.initialCards[i].instanceId]),
    ) as Record<AttributeKey, string>,
  });
}
describe('AI context and browser cache', () => {
  it('explicitly distinguishes multiple seasons and does not mutate career history', () => {
    const s = act(ready(), { type: 'PLAY_NEXT_MATCH' });
    s.matches.push({
      ...s.matches[0],
      matchId: 'synthetic-second-season',
      input: { ...s.matches[0].input, season: 2 },
    });
    s.season = 2;
    const before = JSON.stringify(s);
    const facts = buildCareerFacts(s, 'all');
    expect(facts.facts.find((f) => f.id === 'overall')?.text).toContain('跨2季累计，非单季');
    expect(facts.facts.find((f) => f.id === 'coverage')?.text).toContain('第1季：1场');
    expect(facts.facts.find((f) => f.id === 'coverage')?.text).toContain('第2季：1场');
    expect(buildCareerFacts(s, 1).facts.find((f) => f.id === 'overall')?.text).not.toContain(
      '跨2季',
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it('only summarizes settled games, not active quarter previews or hidden cards', () => {
    let s = ready();
    expect(buildCareerFacts(s, 'all').facts).toHaveLength(0);
    s = act(s, { type: 'START_FEATURED_MATCH' });
    s = act(s, {
      type: 'PLAY_FEATURED_QUARTER',
      plan: {
        offense: 'balanced',
        defense: 'balanced',
        pace: 'normal',
        rotation: 'balanced',
        originalMinutes: 32,
      },
    });
    expect(buildCareerFacts(s, 'all').facts).toHaveLength(0);
  });
  it('separates stages and generates a new cache key when settled facts change', async () => {
    let s = act(ready(), { type: 'PLAY_NEXT_MATCH' });
    const f = buildCareerFacts(s, 'all');
    expect(f.facts.find((x) => x.id === 'regular')?.text).toContain('1场');
    expect(f.facts.find((x) => x.id === 'playoffs')?.text).toBe('尚无已完成比赛');
    expect(JSON.stringify(f)).not.toContain('initialCards');
    const before = await factsKey(f);
    s = act(s, { type: 'ACK_MATCH_RESULT' });
    s = act(s, { type: 'PLAY_NEXT_MATCH' });
    expect(await factsKey(buildCareerFacts(s, 'all'))).not.toBe(before);
  });
  it('persists generated narrative independently of gameplay saves', async () => {
    const facts = buildCareerFacts(act(ready(), { type: 'PLAY_NEXT_MATCH' }), 'all');
    const key = await factsKey(facts);
    const r: AiReportRecord = {
      model: 'deepseek-flash',
      generatedAt: '2026-10-30T00:00:00Z',
      fingerprint: 'test',
      facts,
      narrative: { title: '测试', sections: [], nextSteps: [] },
    };
    await saveReport(key, r);
    expect(await cachedReport(key)).toEqual(r);
  });
});
