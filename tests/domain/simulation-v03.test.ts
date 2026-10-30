import { describe, expect, it } from 'vitest';
import type { MatchInput, OriginalPlayer, TacticalPlan } from '../../src/contracts';
import { ATTRIBUTE_KEYS } from '../../src/contracts';
import { catalog } from '../../src/data/catalog';
import { DEFAULT_PLAN } from '../../src/config/simulation';
import { simulateMatch, simulateThroughQuarter } from '../../src/domain/simulation';
const own = catalog.players.filter((p) => p.teamLabel === 'BOS');
const opp = catalog.players.filter((p) => p.teamLabel === 'LAL');
function input(seed = 44): MatchInput {
  const attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((k) => [k, 80]),
  ) as OriginalPlayer['attributes'];
  return {
    matchId: `sim-${seed}`,
    seed,
    season: 1,
    player: {
      displayName: '模拟验收球员',
      attributes,
      playStyle: 'primaryCreator',
      condition: 100,
      lineage: Object.fromEntries(
        ATTRIBUTE_KEYS.map((k) => [
          k,
          {
            initialPlayerId: own[0].playerId,
            inheritedFromPlayerId: own[0].playerId,
            trainedPoints: 0,
          },
        ]),
      ) as OriginalPlayer['lineage'],
    },
    opponent: { id: 'LAL', name: '湖人', attributes, style: 'primaryCreator' },
    ownRoster: own,
    opponentRoster: opp,
    ownTeamId: 'BOS',
    opponentTeamId: 'LAL',
    isHome: true,
    stage: 'regular',
  };
}
const plans = (plan: TacticalPlan = DEFAULT_PLAN) => Array.from({ length: 4 }, () => ({ ...plan }));
describe('v0.3 possession engine', () => {
  it('conserves points including free throws, time and valid foul/free-throw counts', () => {
    let freeThrows = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulateMatch(input(seed));
      for (const [boxes, score] of [
        [r.homeBox, r.homeScore],
        [r.awayBox, r.awayScore],
      ] as const) {
        expect(boxes.reduce((n, b) => n + b.points, 0)).toBe(score);
        expect(boxes.reduce((n, b) => n + b.minutes, 0)).toBe(5 * (48 + r.overtimes * 5));
        for (const b of boxes) {
          expect(b.points).toBe(2 * b.fgm + b.threePM + (b.ftm ?? 0));
          expect(b.ftm ?? 0).toBeLessThanOrEqual(b.fta ?? 0);
          expect(b.fgm).toBeLessThanOrEqual(b.fga);
          expect(b.threePM).toBeLessThanOrEqual(b.threePA);
          expect(b.minutes).toBeGreaterThanOrEqual(0);
          expect(b.fouls ?? 0).toBeLessThanOrEqual(6);
          freeThrows += b.fta ?? 0;
        }
      }
      expect(
        r.events.every(
          (e) =>
            e.ownLineup?.length === 5 &&
            new Set(e.ownLineup).size === 5 &&
            e.opponentLineup?.length === 5 &&
            new Set(e.opponentLineup).size === 5,
        ),
      ).toBe(true);
      expect(
        r.events.every(
          (e) =>
            e.secondsRemaining !== undefined &&
            e.secondsRemaining >= 0 &&
            e.x! >= 0 &&
            e.x! <= 100 &&
            e.y! >= 0 &&
            e.y! <= 100,
        ),
      ).toBe(true);
    }
    expect(freeThrows).toBeGreaterThan(300);
  });
  it('only simulates completed quarters and preserves plan prefixes', () => {
    const x = input();
    const first = simulateThroughQuarter(x, [DEFAULT_PLAN], 1);
    expect(first.reward).toBe(0);
    expect(first.quarters).toHaveLength(1);
    expect(first.events.every((e) => e.quarter === 1)).toBe(true);
    const changed = plans();
    changed[1] = { ...DEFAULT_PLAN, offense: 'perimeter', pace: 'fast' };
    const two = simulateThroughQuarter(x, changed, 2);
    expect(two.events.filter((e) => e.quarter === 1)).toEqual(first.events);
    const full = simulateThroughQuarter(x, changed, 4);
    expect(full).toEqual(simulateMatch({ ...x, quarterPlans: changed }));
    expect(full.events.filter((e) => e.quarter <= 2)).toEqual(two.events);
    expect(full.quarters?.slice(0, 2)).toEqual(two.quarters);
  });
  it('allocates explicit original-player minutes and uses positional lineups', () => {
    for (const minutes of [26, 32, 38] as const) {
      const r = simulateMatch({
        ...input(91),
        quarterPlans: plans({ ...DEFAULT_PLAN, originalMinutes: minutes }),
      });
      if ((r.homeBox[0].fouls ?? 0) < 6)
        expect(r.homeBox[0].minutes).toBe(minutes + r.overtimes * 5);
      const originalPos = 'guard';
      const positions = new Map(own.map((p) => [p.playerId, p.drawPosition]));
      positions.set('original-player', originalPos);
      expect(
        r.events
          .filter((e) => e.kind !== 'foul' && e.kind !== 'substitution')
          .every(
            (e) =>
              e.ownLineup!.some((id) => positions.get(id) === 'guard') &&
              e.ownLineup!.some((id) => positions.get(id) === 'big'),
          ),
      ).toBe(true);
    }
  });
  it('changes shot mix for perimeter versus paint across fixed seeds', () => {
    let perimeter = 0,
      paint = 0;
    for (let seed = 1; seed <= 35; seed++) {
      perimeter += simulateMatch({
        ...input(seed),
        quarterPlans: plans({ ...DEFAULT_PLAN, offense: 'perimeter' }),
      }).homeBox.reduce((n, b) => n + b.threePA, 0);
      paint += simulateMatch({
        ...input(seed),
        quarterPlans: plans({ ...DEFAULT_PLAN, offense: 'attackPaint' }),
      }).homeBox.reduce((n, b) => n + b.threePA, 0);
    }
    expect(perimeter).toBeGreaterThan(paint * 1.5);
  });
  it('changes results with home court and depleted conditioning, while remaining deterministic', () => {
    let fresh = 0,
      tired = 0,
      home = 0,
      away = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const x = input(seed);
      const a = simulateMatch(x);
      expect(a).toEqual(simulateMatch(x));
      fresh += a.homeBox[0].points;
      tired += simulateMatch({ ...x, player: { ...x.player, condition: 35 } }).homeBox[0].points;
      home += a.homeScore;
      away += simulateMatch({ ...x, isHome: false }).homeScore;
    }
    expect(fresh).toBeGreaterThan(tired);
    expect(home).toBeGreaterThan(away);
  });
  it('gives a selected deep reserve actual minutes and removes six-foul players at the dead ball', () => {
    const reserve = own.at(-1)!;
    const m = simulateMatch({
      ...input(812),
      quarterPlans: plans({ ...DEFAULT_PLAN, focusPlayerId: reserve.playerId }),
    });
    expect(m.homeBox.find((b) => b.playerId === reserve.playerId)!.minutes).toBeGreaterThan(15);
    const foulCounts = new Map<string, number>();
    const out = new Set<string>();
    for (const event of m.events) {
      if (event.kind === 'foul' && event.actorId) {
        const key = `${event.side}:${event.actorId}`;
        const n = (foulCounts.get(key) ?? 0) + 1;
        foulCounts.set(key, n);
        if (n === 6) out.add(key);
      } else if (event.actorId && event.kind !== 'substitution')
        expect(out.has(`${event.side}:${event.actorId}`)).toBe(false);
    }
  });
  it('rejects unknown plans or player focus outside the team', () => {
    expect(() =>
      simulateThroughQuarter(
        input(),
        [{ ...DEFAULT_PLAN, focusPlayerId: 'not-a-roster-player' }],
        1,
      ),
    ).toThrow('INVALID_FOCUS_PLAYER');
    expect(() => simulateThroughQuarter(input(), [], 5)).toThrow('INVALID_QUARTER');
  });
});
