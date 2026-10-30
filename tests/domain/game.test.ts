import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  type CareerState,
  type CommandPayload,
  type GameCommand,
} from '../../src/contracts';
import { catalog } from '../../src/data/catalog';
import { NBA_TEAMS } from '../../src/data/teams';
import { applyCommand, createCareer, simulateMatch } from '../../src/domain';
import {
  generateLeagueSchedule,
  teamById,
  leagueStandings,
  progressPostseason,
  recordSeriesResult,
  userEntry,
} from '../../src/domain/league';
function run(s: CareerState, p: CommandPayload, id = `cmd-${s.revision}`) {
  const r = applyCommand(
    s,
    { ...p, commandId: id, expectedRevision: s.revision } as GameCommand,
    catalog,
  );
  if (!r.ok) throw Error(r.error.code);
  return r.value;
}
function create(seed = 17) {
  const r = createCareer(seed, catalog);
  if (!r.ok) throw Error(r.error.code);
  return r.value;
}
function drafted(seed = 17, teamId = 'LAL') {
  const s = create(seed);
  return run(s, {
    type: 'CONFIRM_DRAFT',
    name: '测试球员',
    teamId,
    style: 'primaryCreator',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, s.initialCards[i].instanceId]),
    ) as never,
  });
}
describe('NBA schedule', () => {
  it('creates 1230 games, every team 82 and 41 home, with exact NBA opponent frequencies', () => {
    for (const seed of [1, 17, 99]) {
      const games = generateLeagueSchedule(NBA_TEAMS, seed, 1);
      expect(games).toHaveLength(1230);
      for (const team of NBA_TEAMS) {
        const own = games.filter((g) => g.homeTeamId === team.id || g.awayTeamId === team.id);
        expect(own).toHaveLength(82);
        expect(own.filter((g) => g.homeTeamId === team.id)).toHaveLength(41);
        const per = new Map<string, number>();
        for (const g of own) {
          const opp = g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId;
          per.set(opp, (per.get(opp) || 0) + 1);
        }
        let nonDiv4 = 0,
          nonDiv3 = 0;
        for (const [id, count] of per) {
          const opp = teamById(id);
          if (opp.conference !== team.conference) expect(count).toBe(2);
          else if (opp.division === team.division) expect(count).toBe(4);
          else if (count === 4) nonDiv4++;
          else if (count === 3) nonDiv3++;
          else throw Error('Invalid count');
        }
        expect(nonDiv4).toBe(6);
        expect(nonDiv3).toBe(4);
        expect(new Set(own.map((g) => g.day)).size).toBe(82);
      }
    }
  });
});
describe('blind draft and transactional economy', () => {
  it('has 20 different players, exactly 5 stars, consumes exactly nine', () => {
    for (let seed = 0; seed < 100; seed++) {
      const s = create(seed);
      expect(new Set(s.initialCards.map((c) => c.playerId)).size).toBe(20);
      expect(s.initialCards.filter((c) => catalog.starIds.includes(c.playerId))).toHaveLength(5);
    }
    expect(drafted().inventory).toHaveLength(11);
  });
  it('rejects stale/invalid assignment without mutation', () => {
    const s = create();
    const before = JSON.stringify(s);
    const bad = applyCommand(
      s,
      {
        type: 'CONFIRM_DRAFT',
        commandId: 'bad',
        expectedRevision: 0,
        name: 'X',
        style: 'primaryCreator',
        teamId: 'LAL',
        assignments: Object.fromEntries(
          ATTRIBUTE_KEYS.map((k) => [k, s.initialCards[0].instanceId]),
        ) as never,
      },
      catalog,
    );
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('blind inheritance consumes even a lower/equal card, never degrades, duplicate command is idempotent', () => {
    let s = drafted();
    const card = s.inventory[0];
    const def = catalog.players.find((p) => p.playerId === card.playerId)!;
    const key = 'outsideScoring';
    const old = s.player!.attributes[key];
    const command = {
      type: 'INHERIT_ATTRIBUTE' as const,
      attribute: key as (typeof ATTRIBUTE_KEYS)[number],
      instanceId: card.instanceId,
      commandId: 'once',
      expectedRevision: s.revision,
    };
    const r = applyCommand(s, command, catalog);
    if (!r.ok) throw Error(r.error.code);
    s = r.value;
    expect(s.inventory).toHaveLength(10);
    expect(s.player!.attributes[key]).toBe(Math.max(old, def.attributes[key]));
    const again = applyCommand(s, command, catalog);
    expect(again.ok && again.value).toEqual(s);
  });
});
describe('real rosters and full league season', () => {
  it('uses actual roster names and at least eight participants, with conserved points/minutes', () => {
    const s = drafted();
    const entry = s.schedule[0];
    const team = catalog.players.filter((p) => p.teamLabel === s.selectedTeamId);
    const opp = catalog.players.filter((p) => p.teamLabel === entry.opponent.id);
    const input = {
      matchId: entry.matchId,
      seed: entry.seed,
      season: 1,
      player: s.player!,
      opponent: entry.opponent,
      ownRoster: team,
      opponentRoster: opp,
      ownTeamId: s.selectedTeamId!,
      opponentTeamId: entry.opponent.id,
      isHome: entry.isHome,
      stage: entry.stage,
    };
    const m = simulateMatch(input);
    expect(simulateMatch(input)).toEqual(m);
    expect(m.homeBox.length).toBeGreaterThanOrEqual(8);
    expect(m.awayBox.length).toBeGreaterThanOrEqual(8);
    for (const [boxes, points] of [
      [m.homeBox, m.homeScore],
      [m.awayBox, m.awayScore],
    ] as const) {
      expect(boxes.reduce((a, b) => a + b.points, 0)).toBe(points);
      expect(boxes.reduce((a, b) => a + b.minutes, 0)).toBe(5 * (48 + m.overtimes * 5));
      for (const b of boxes) {
        expect(b.points).toBe(2 * b.fgm + b.threePM + (b.ftm ?? 0));
        expect(b.fgm).toBeLessThanOrEqual(b.fga);
      }
    }
    expect(m.homeBox.slice(1).every((b) => team.some((p) => p.playerId === b.playerId))).toBe(true);
    expect(m.awayBox.every((b) => opp.some((p) => p.playerId === b.playerId))).toBe(true);
  });
  it('finishes 82 regular games for every team, play-in and 15 BO7 series, and permits a fourth season', () => {
    let s = drafted(9);
    let guard = 0;
    while (s.season < 4 && guard++ < 900) {
      if (s.phase === 'ready') s = run(s, { type: 'PLAY_NEXT_MATCH' });
      else if (s.phase === 'result' || s.phase === 'seasonSummary')
        s = run(s, { type: 'ACK_MATCH_RESULT' });
      else if (s.phase === 'offseason') {
        expect(s.league!.standings.every((r) => r.wins + r.losses === 82)).toBe(true);
        expect(
          s.league!.games.filter((g) => g.stage === 'regular' && g.homeScore !== undefined),
        ).toHaveLength(1230);
        expect(s.league!.games.filter((g) => g.stage === 'playIn')).toHaveLength(6);
        expect(s.league!.series).toHaveLength(15);
        for (const series of s.league!.series) {
          expect(Math.max(series.homeWins, series.awayWins)).toBe(4);
          expect(series.games.length).toBeGreaterThanOrEqual(4);
          expect(series.games.length).toBeLessThanOrEqual(7);
          const first = s.league!.games.find((g) => g.id === series.games[0])!;
          expect(first.homeTeamId).toBe(series.homeTeamId);
        }
        expect(s.league!.championId).toBeTruthy();
        s = run(s, { type: 'START_NEXT_SEASON' });
      } else throw Error(s.phase);
    }
    expect(s.season).toBe(4);
    expect(s.phase).toBe('ready');
    expect(s.seasonArchives).toHaveLength(3);
  }, 60000);
});

describe('play-in ladder and home court', () => {
  it('handles seeds 7–10 and produces 2-2-1-1-1 home court without reseeding', () => {
    for (const place of [7, 8, 9, 10]) {
      let s = drafted(100 + place);
      const league = s.league!;
      const confTeams = (conf: string) =>
        NBA_TEAMS.filter((t) => t.conference === conf)
          .map((t) => t.id)
          .sort();
      for (const g of league.games) {
        const a = confTeams(teamById(g.homeTeamId).conference).indexOf(g.homeTeamId),
          b = confTeams(teamById(g.awayTeamId).conference).indexOf(g.awayTeamId);
        g.homeScore = a <= b ? 110 : 90;
        g.awayScore = a <= b ? 90 : 110;
      }
      league.standings = leagueStandings(league);
      s.selectedTeamId = league.standings.find(
        (r) => teamById(r.teamId).conference === 'east' && r.seed === place,
      )!.teamId;
      s.schedule = league.games
        .filter((g) => g.homeTeamId === s.selectedTeamId || g.awayTeamId === s.selectedTeamId)
        .map((g) => userEntry(g, s, catalog));
      s.scheduleIndex = 82;
      progressPostseason(s, catalog);
      expect(s.schedule[82].stage).toBe('playIn');
      let ownPlayIn = 0,
        guard = 0;
      while (s.phase !== 'seasonSummary' && guard++ < 40) {
        const entry = s.schedule[s.scheduleIndex],
          g = league.games.find((g) => g.id === entry.leagueGameId)!;
        const win = !(
          entry.stage === 'playIn' &&
          ((place === 7 && ownPlayIn === 0) || place === 10)
        );
        if (entry.stage === 'playIn') ownPlayIn++;
        const ownHome = g.homeTeamId === s.selectedTeamId;
        g.homeScore = win === ownHome ? 110 : 90;
        g.awayScore = win === ownHome ? 90 : 110;
        recordSeriesResult(s, g);
        s.scheduleIndex++;
        progressPostseason(s, catalog);
      }
      expect(s.phase).toBe('seasonSummary');
      expect(ownPlayIn).toBe(place === 7 || place === 9 ? 2 : 1);
      expect(league.championId === s.selectedTeamId).toBe(place !== 10);
      for (const series of league.series) {
        const pattern = series.games.map(
          (id) => league.games.find((g) => g.id === id)!.homeTeamId === series.homeTeamId,
        );
        expect(pattern).toEqual(
          [true, true, false, false, true, false, true].slice(0, pattern.length),
        );
      }
    }
  });
});

describe('NBA standings tiebreak', () => {
  function standingsFor(games: [string, string, number, number][]) {
    const state = drafted();
    state.league!.games = games.map(([homeTeamId, awayTeamId, homeScore, awayScore], i) => ({
      id: `tie-${i}`,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      day: i,
      seed: 42,
      stage: 'regular',
    }));
    return leagueStandings(state.league!);
  }
  it('ranks unequal games played by winning percentage rather than win count', () => {
    const rows = standingsFor([
      ['BOS', 'PHI', 101, 100],
      ['NYK', 'TOR', 110, 100],
      ['NYK', 'BKN', 110, 100],
      ['NYK', 'MIL', 90, 110],
    ]);
    expect(rows.find((r) => r.teamId === 'BOS')!.seed).toBeLessThan(
      rows.find((r) => r.teamId === 'NYK')!.seed,
    );
  });
  it('uses head-to-head before the remaining two-team criteria', () => {
    const rows = standingsFor([
      ['BOS', 'NYK', 110, 100],
      ['BOS', 'PHI', 90, 100],
      ['NYK', 'TOR', 110, 100],
    ]);
    expect(rows.find((r) => r.teamId === 'BOS')!.seed).toBeLessThan(
      rows.find((r) => r.teamId === 'NYK')!.seed,
    );
  });
});
