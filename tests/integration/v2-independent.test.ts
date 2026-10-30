import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  type CareerState,
  type CommandPayload,
  type GameCommand,
} from '../../src/contracts';
import { catalog } from '../../src/data/catalog';
import { NBA_TEAMS } from '../../src/data/teams';
import { createCareer, applyCommand } from '../../src/domain';
import { storeCareer, loadStoredCareer } from '../../src/application/repository';
import { validateSave } from '../../src/application/save';
function command(state: CareerState, payload: CommandPayload): CareerState {
  const r = applyCommand(
    state,
    {
      ...payload,
      commandId: `qa-v2-${state.revision}`,
      expectedRevision: state.revision,
    } as GameCommand,
    catalog,
  );
  if (!r.ok) throw new Error(`${payload.type}: ${r.error.code}`);
  return r.value;
}
function ready(teamId = 'BOS', seed = 663): CareerState {
  const r = createCareer(seed, catalog);
  if (!r.ok) throw new Error(r.error.code);
  const s = r.value;
  return command(s, {
    type: 'CONFIRM_DRAFT',
    teamId,
    name: '独立质检球员',
    style: 'primaryCreator',
    assignments: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k, i) => [k, s.initialCards[i].instanceId]),
    ) as Record<(typeof ATTRIBUTE_KEYS)[number], string>,
  });
}
const source = (path: string) =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
describe('independent v2 acceptance', () => {
  it('has thirty distinct real teams with usable Chinese named roster references', () => {
    expect(NBA_TEAMS).toHaveLength(30);
    expect(new Set(NBA_TEAMS.map((t) => t.id)).size).toBe(30);
    expect(NBA_TEAMS.filter((t) => t.conference === 'east')).toHaveLength(15);
    expect(NBA_TEAMS.filter((t) => t.conference === 'west')).toHaveLength(15);
    for (const team of NBA_TEAMS) {
      const roster = catalog.players.filter((p) => p.teamLabel === team.id);
      expect(roster.length).toBeGreaterThanOrEqual(8);
      expect([...roster.map((p) => p.playerId)].sort()).toEqual([...team.playerIds].sort());
    }
    expect(catalog.players.every((p) => !!p.nameZh && /[\u3400-\u9fff]/.test(p.nameZh))).toBe(true);
  });
  it('keeps candidate ratings and ability ordering out of draft/card templates, and report in game', () => {
    const card = source('components/PlayerCard.vue'),
      draft = source('views/DraftBuilder.vue'),
      summary = source('views/SummaryView.vue'),
      report = source('components/CareerReport.vue');
    expect(card).not.toMatch(/player\.attributes/);
    expect(card).toContain('能力待揭晓');
    expect(draft).not.toContain('.sort(');
    expect(draft).not.toContain('RadarChart');
    expect(draft).not.toContain('chosen(key)?.attributes');
    expect(summary).toContain('<CareerReport');
    expect(summary).not.toContain('exportSave');
    expect(report).toContain('常规赛');
    expect(report).toContain('逐季足迹');
    expect(report).toContain('生涯统计分析 · 根据比赛与成长记录计算。');
    expect(report).toContain('<AiCareerReport');
  });
  it('completes 82 games, conserves actual home/away records, persists the season and continues', async () => {
    let s = ready();
    let guard = 0;
    while (s.phase !== 'seasonSummary' && guard++ < 230) {
      if (s.phase === 'ready') s = command(s, { type: 'PLAY_NEXT_MATCH' });
      else if (s.phase === 'result') s = command(s, { type: 'ACK_MATCH_RESULT' });
      else throw new Error(s.phase);
      s = validateSave(JSON.parse(JSON.stringify(s)), catalog);
    }
    expect(s.phase).toBe('seasonSummary');
    expect(s.selectedTeamId).toBe('BOS');
    expect(s.matches.filter((m) => m.input.stage === 'regular')).toHaveLength(82);
    expect(s.matches.filter((m) => m.input.stage === 'regular' && m.input.isHome)).toHaveLength(41);
    const completed = s.league!.games.filter((g) => g.stage === 'regular');
    expect(completed).toHaveLength(1230);
    expect(
      completed.every(
        (g) =>
          g.homeScore !== undefined && g.awayScore !== undefined && g.homeScore !== g.awayScore,
      ),
    ).toBe(true);
    for (const standing of s.league!.standings) expect(standing.wins + standing.losses).toBe(82);
    for (const m of s.matches) {
      const g = s.league!.games.find((g) => g.id === m.matchId)!;
      expect(m.homeBox[0].playerId).toBe('original-player');
      expect(m.input.isHome ? g.homeScore : g.awayScore).toBe(m.homeScore);
      expect(m.input.isHome ? g.awayScore : g.homeScore).toBe(m.awayScore);
      expect(
        m.homeBox
          .slice(1)
          .every((b) =>
            catalog.players.some((p) => p.playerId === b.playerId && p.teamLabel === 'BOS'),
          ),
      ).toBe(true);
    }
    expect(s.league!.series).toHaveLength(15);
    expect(s.league!.championId).toBeTruthy();
    await storeCareer(s);
    expect(await loadStoredCareer(catalog)).toEqual(s);
    s = command(s, { type: 'ACK_MATCH_RESULT' });
    s = command(s, { type: 'START_NEXT_SEASON' });
    expect(s.season).toBe(2);
    expect(s.selectedTeamId).toBe('BOS');
    expect(s.schedule).toHaveLength(82);
    expect(s.seasonArchives).toHaveLength(1);
  }, 60000);
  it('rejects missing historical stage and a user-team mismatch in a real match snapshot', () => {
    const state = command(ready('LAL', 105), { type: 'PLAY_NEXT_MATCH' });
    const withoutStage = structuredClone(state);
    delete withoutStage.matches[0].input.stage;
    expect(() => validateSave(withoutStage, catalog)).toThrow();
    const wrongTeam = structuredClone(state);
    wrongTeam.matches[0].input.ownTeamId = 'BOS';
    expect(() => validateSave(wrongTeam, catalog)).toThrow();
  });
  it('rejects a saved league score inconsistent with the user match result', () => {
    const state = command(ready('LAL', 105), { type: 'PLAY_NEXT_MATCH' });
    const broken = structuredClone(state);
    const game = broken.league!.games.find((g) => g.id === broken.currentMatchId)!;
    game.homeScore! += 7;
    expect(() => validateSave(broken, catalog)).toThrow();
  });
});
