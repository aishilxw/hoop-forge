import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type CareerState,
  type CommandPayload,
  type GameCommand,
  type TacticalPlan,
} from '../../src/contracts';
import { DEFAULT_PLAN } from '../../src/config/simulation';
import { RULES_VERSION } from '../../src/config/balance';
import { catalog } from '../../src/data/catalog';
import { createCareer, applyCommand } from '../../src/domain';
import { validateSave } from '../../src/application/save';
import { loadStoredCareer, storeCareer } from '../../src/application/repository';
function act(
  state: CareerState,
  payload: CommandPayload,
  id = `qa-v03-${state.revision}`,
): CareerState {
  const result = applyCommand(
    state,
    { ...payload, commandId: id, expectedRevision: state.revision },
    catalog,
  );
  if (!result.ok) throw Error(result.error.code);
  return result.value;
}
function ready(seed = 3307): CareerState {
  const result = createCareer(seed, catalog);
  if (!result.ok) throw Error(result.error.code);
  return act(result.value, {
    type: 'CONFIRM_DRAFT',
    teamId: 'BOS',
    name: '独立重点QA',
    style: 'primaryCreator',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, result.value.initialCards[i].instanceId]),
    ) as Record<AttributeKey, string>,
  });
}
const plan = (): TacticalPlan => structuredClone(DEFAULT_PLAN);
const roundTrip = (s: CareerState) => validateSave(JSON.parse(JSON.stringify(s)), catalog);
describe('independent v0.3 live persistence', () => {
  it('persists every completed quarter in IndexedDB and only settles Q4 once', async () => {
    const initial = ready();
    let state = act(initial, { type: 'START_FEATURED_MATCH' });
    expect(roundTrip(state)).toEqual(state);
    for (let q = 1; q <= 3; q++) {
      state = act(state, { type: 'PLAY_FEATURED_QUARTER', plan: plan() });
      await storeCareer(state);
      const loaded = await loadStoredCareer(catalog);
      expect(loaded).toEqual(state);
      state = loaded!;
      expect(state.phase).toBe('live');
      expect(state.matches).toHaveLength(0);
      expect(state.coins).toBe(initial.coins);
      expect(state.activeMatch!.completedQuarters).toBe(q);
      expect(state.activeMatch!.preview!.events.every((e) => e.quarter <= q)).toBe(true);
      expect(
        state.league!.games.find((g) => g.id === state.schedule[0].leagueGameId)!.homeScore,
      ).toBeUndefined();
    }
    const command: GameCommand = {
      type: 'PLAY_FEATURED_QUARTER',
      plan: plan(),
      commandId: 'qa-final-once',
      expectedRevision: state.revision,
    };
    const final = applyCommand(state, command, catalog);
    if (!final.ok) throw Error(final.error.code);
    state = roundTrip(final.value);
    expect(state.phase).toBe('result');
    expect(state.activeMatch).toBeNull();
    expect(state.matches).toHaveLength(1);
    expect(state.coins).toBe(initial.coins + state.matches[0].reward);
    expect(applyCommand(state, command, catalog)).toEqual({ ok: true, value: state });
    for (const m of state.matches)
      for (const boxes of [m.homeBox, m.awayBox])
        for (const b of boxes) {
          expect(b.minutes).toBeGreaterThanOrEqual(0);
          expect(b.points).toBe(2 * b.fgm + b.threePM + (b.ftm ?? 0));
          expect(b.ftm ?? 0).toBeLessThanOrEqual(b.fta ?? 0);
        }
  });
  it('retains the identical default-plan game through quick and watched routes after save/load', async () => {
    const first = ready(3308);
    const quick = act(first, { type: 'PLAY_NEXT_MATCH' });
    let watched = act(first, { type: 'START_FEATURED_MATCH' });
    for (let q = 0; q < 4; q++) {
      watched = act(roundTrip(watched), { type: 'PLAY_FEATURED_QUARTER', plan: plan() });
    }
    const a = quick.matches[0],
      b = watched.matches[0];
    expect([b.homeScore, b.awayScore, b.reward]).toEqual([a.homeScore, a.awayScore, a.reward]);
    expect(b.homeBox).toEqual(a.homeBox);
    expect(b.awayBox).toEqual(a.awayBox);
  });
  it('accepts a genuinely tied live quarter without treating it as a final result', () => {
    const baseline = ready(3309);
    let tied: CareerState | undefined;
    for (let seed = 1; seed <= 150; seed++) {
      const s = structuredClone(baseline);
      s.schedule[0].seed = seed;
      s.league!.games.find((g) => g.id === s.schedule[0].leagueGameId)!.seed = seed;
      const q = act(act(s, { type: 'START_FEATURED_MATCH' }), {
        type: 'PLAY_FEATURED_QUARTER',
        plan: plan(),
      });
      const p = q.activeMatch!.preview!;
      if (p.homeScore === p.awayScore) {
        tied = q;
        break;
      }
    }
    expect(tied, 'fixed seed search should locate a tied first quarter').toBeDefined();
    expect(roundTrip(tied!)).toEqual(tied);
    expect(tied!.coins).toBe(0);
  }, 20000);
  it('rejects damaged prefix, illegal focus and plans without mutating the committed live state', () => {
    let live = act(ready(3310), { type: 'START_FEATURED_MATCH' });
    live = act(live, { type: 'PLAY_FEATURED_QUARTER', plan: plan() });
    const bad = structuredClone(live);
    bad.activeMatch!.preview!.homeBox[0].points++;
    expect(() => roundTrip(bad)).toThrow();
    for (const invalidPlan of [
      { ...plan(), focusPlayerId: 'unknown-athlete' },
      { ...plan(), pace: 'teleport' },
    ]) {
      const before = structuredClone(live);
      const result = applyCommand(
        live,
        {
          type: 'PLAY_FEATURED_QUARTER',
          plan: invalidPlan,
          commandId: 'bad',
          expectedRevision: live.revision,
        } as GameCommand,
        catalog,
      );
      expect(result.ok).toBe(false);
      expect(live).toEqual(before);
    }
  });
  it('upgrades a legacy v0.2 career while preserving scored matches and archived progress', () => {
    const scored = act(ready(3311), { type: 'PLAY_NEXT_MATCH' });
    const legacy = JSON.parse(JSON.stringify(scored));
    legacy.rulesVersion = '0.2.0';
    delete legacy.player.age;
    delete legacy.player.condition;
    delete legacy.activeMatch;
    // Keep this fixture game as a genuine engine result, merely remove newer presentation fields.
    const expectedMatches = structuredClone(legacy.matches);
    const migrated = validateSave(legacy, catalog);
    expect(migrated.rulesVersion).toBe(RULES_VERSION);
    expect(migrated.matches).toEqual(expectedMatches);
    expect(migrated.revision).toBe(scored.revision);
    expect(migrated.coins).toBe(scored.coins);
    expect(migrated.player!.age).toBe(19);
    expect(migrated.growthLog.at(-1)).toContain('历史比赛保留');
  });
  it('statically gates future box scores and chart data behind the playback cursor', () => {
    const ui = readFileSync('src/views/LiveMatchView.vue', 'utf8');
    expect(ui).toContain('events.value.slice(0, cursor.value)');
    expect(ui).toContain('current.value?.homeScore ?? 0');
    expect(ui).toContain('const shown = visible.value');
    expect(ui).toMatch(/const statRows[\s\S]*atEnd.value/);
    expect(ui).toContain('cursor.value = length'); // Mounted/restored completed snapshot can end immediately.
  });
});
