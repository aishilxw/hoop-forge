import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type CareerState,
  type CommandPayload,
  type GameCommand,
  type TacticalPlan,
} from '../../src/contracts';
import { catalog } from '../../src/data/catalog';
import { applyCommand, createCareer, isFeaturedMatch } from '../../src/domain';
import { DEFAULT_PLAN } from '../../src/config/simulation';

function ready(seed = 420): CareerState {
  const created = createCareer(seed, catalog);
  if (!created.ok) throw Error(created.error.code);
  return act(created.value, {
    type: 'CONFIRM_DRAFT',
    name: '重点场验收球员',
    teamId: 'BOS',
    style: 'primaryCreator',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, created.value.initialCards[i].instanceId]),
    ) as Record<AttributeKey, string>,
  });
}
function act(
  state: CareerState,
  payload: CommandPayload,
  id = `featured-${state.revision}`,
): CareerState {
  const result = applyCommand(
    state,
    { ...payload, commandId: id, expectedRevision: state.revision },
    catalog,
  );
  if (!result.ok) throw Error(result.error.code);
  return result.value;
}
const defaultPlan = (): TacticalPlan => structuredClone(DEFAULT_PLAN);

describe('featured match lifecycle v0.3', () => {
  it('selects exactly eight spotlight regular fixtures, including the season opener', () => {
    const state = ready();
    const indices = state.schedule.flatMap((_, i) =>
      isFeaturedMatch({ ...state, scheduleIndex: i }) ? [i] : [],
    );
    expect(indices).toEqual([0, 10, 21, 32, 43, 54, 65, 76]);
  });
  it('begins without reward or league result and blocks player upgrades while live', () => {
    const initial = ready();
    const live = act(initial, { type: 'START_FEATURED_MATCH' });
    expect(live.phase).toBe('live');
    expect(live.activeMatch).toEqual({
      matchId: live.schedule[0].matchId,
      completedQuarters: 0,
      plans: [],
      preview: null,
    });
    expect(live.coins).toBe(initial.coins);
    expect(
      live.league!.games.find((g) => g.id === live.schedule[0].leagueGameId)!.homeScore,
    ).toBeUndefined();
    const result = applyCommand(
      live,
      {
        type: 'SET_PLAY_STYLE',
        style: 'teamOrganizer',
        commandId: 'cannot-edit',
        expectedRevision: live.revision,
      },
      catalog,
    );
    expect(result).toEqual({ ok: false, error: { code: 'INVALID_PHASE' } });
  });
  it('rejects unsupported tactic values and non-roster focus without changing the snapshot', () => {
    const state = act(ready(), { type: 'START_FEATURED_MATCH' });
    for (const plan of [
      { ...defaultPlan(), originalMinutes: 45 },
      { ...defaultPlan(), focusPlayerId: 'not-an-owned-roster-player' },
      { ...defaultPlan(), offense: 'always-win' },
    ]) {
      const before = structuredClone(state);
      const result = applyCommand(
        state,
        {
          type: 'PLAY_FEATURED_QUARTER',
          plan,
          commandId: 'bad-plan',
          expectedRevision: state.revision,
        } as GameCommand,
        catalog,
      );
      expect(result).toEqual({ ok: false, error: { code: 'INVALID_PLAN' } });
      expect(state).toEqual(before);
    }
  });
  it('persists quarter prefixes, settles only after quarter four, and pays once', () => {
    let state = act(ready(422), { type: 'START_FEATURED_MATCH' });
    const coins = state.coins;
    for (let q = 1; q <= 3; q++) {
      state = act(state, { type: 'PLAY_FEATURED_QUARTER', plan: defaultPlan() });
      expect(state.phase).toBe('live');
      expect(state.activeMatch!.completedQuarters).toBe(q);
      expect(state.activeMatch!.preview!.reward).toBe(0);
      expect(state.matches).toHaveLength(0);
      expect(state.coins).toBe(coins);
      expect(state.activeMatch!.preview!.events.every((e) => e.quarter <= q)).toBe(true);
      state = JSON.parse(JSON.stringify(state));
    }
    const finalCommand: GameCommand = {
      type: 'PLAY_FEATURED_QUARTER',
      plan: defaultPlan(),
      commandId: 'settle-once',
      expectedRevision: state.revision,
    };
    const result = applyCommand(state, finalCommand, catalog);
    if (!result.ok) throw Error(result.error.code);
    expect(result.value.phase).toBe('result');
    expect(result.value.activeMatch).toBeNull();
    expect(result.value.matches).toHaveLength(1);
    expect(result.value.matches[0].featured).toBe(true);
    expect(result.value.coins).toBe(coins + result.value.matches[0].reward);
    expect(applyCommand(result.value, finalCommand, catalog)).toEqual({
      ok: true,
      value: result.value,
    });
  });
  it('refuses a damaged partial score rather than silently rewriting the prior quarter', () => {
    let state = act(ready(426), { type: 'START_FEATURED_MATCH' });
    state = act(state, { type: 'PLAY_FEATURED_QUARTER', plan: defaultPlan() });
    state.activeMatch!.preview!.homeBox[0].points++;
    const before = structuredClone(state);
    const result = applyCommand(
      state,
      {
        type: 'PLAY_FEATURED_QUARTER',
        plan: defaultPlan(),
        commandId: 'bad-partial',
        expectedRevision: state.revision,
      },
      catalog,
    );
    expect(result).toEqual({ ok: false, error: { code: 'SIMULATION_PREFIX_CHANGED' } });
    expect(state).toEqual(before);
  });
  it('gives the same scored game for quick simulation and four default-plan quarters', () => {
    const initial = ready(423);
    const quick = act(initial, { type: 'PLAY_NEXT_MATCH' });
    let watched = act(initial, { type: 'START_FEATURED_MATCH' });
    for (let q = 0; q < 4; q++)
      watched = act(watched, { type: 'PLAY_FEATURED_QUARTER', plan: defaultPlan() });
    const a = quick.matches[0],
      b = watched.matches[0];
    expect([b.homeScore, b.awayScore, b.reward]).toEqual([a.homeScore, a.awayScore, a.reward]);
    expect(b.homeBox).toEqual(a.homeBox);
    expect(b.awayBox).toEqual(a.awayBox);
    expect(b.events).toEqual(a.events);
    expect(watched.player!.condition).toBe(quick.player!.condition);
  });
  it('records young growth and veteran decline, resets condition, and allows offseason retirement', () => {
    const first = ready();
    first.phase = 'offseason';
    first.player!.condition = 40;
    const young = act(first, { type: 'START_NEXT_SEASON' });
    expect(young.player!.age).toBe(20);
    expect(young.player!.condition).toBe(100);
    expect(young.growthLog.at(-1)).toContain('休赛期');
    const veteran = ready();
    veteran.phase = 'offseason';
    veteran.player!.age = 33;
    const speed = veteran.player!.attributes.speed;
    const next = act(veteran, { type: 'START_NEXT_SEASON' });
    expect(next.player!.age).toBe(34);
    expect(next.player!.attributes.speed).toBe(Math.max(25, speed - 2));
    const retiring = ready();
    retiring.phase = 'offseason';
    const retired = act(retiring, { type: 'RETIRE_PLAYER' });
    expect(retired.phase).toBe('finished');
    expect(retired.player).toEqual(retiring.player);
    expect(retired.milestones).toContain('retired:s1');
    expect(
      applyCommand(
        ready(),
        { type: 'RETIRE_PLAYER', commandId: 'too-early', expectedRevision: 1 },
        catalog,
      ).ok,
    ).toBe(false);
  });
});
