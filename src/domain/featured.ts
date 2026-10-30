import type { CareerState, TacticalPlan, Catalog, MatchInput, MatchResult } from '../contracts';
import { advanceRegular, recordSeriesResult, rosterFor } from './league';
import { clamp } from './rng';

export const FEATURED_REGULAR_INDICES = [0, 10, 21, 32, 43, 54, 65, 76] as const;

/** Eight automatic spotlight fixtures; every other fixture can also be watched voluntarily. */
export function isFeaturedMatch(state: CareerState): boolean {
  const current = state.schedule[state.scheduleIndex];
  return (
    !!current &&
    current.stage === 'regular' &&
    FEATURED_REGULAR_INDICES.some((i) => i === state.scheduleIndex)
  );
}

export function isValidPlan(plan: TacticalPlan, state: CareerState, catalog: Catalog): boolean {
  if (!plan || typeof plan !== 'object') return false;
  if (!['balanced', 'attackPaint', 'perimeter', 'pickAndRoll'].includes(plan.offense)) return false;
  if (!['balanced', 'protectPaint', 'pressurePerimeter'].includes(plan.defense)) return false;
  if (!['slow', 'normal', 'fast'].includes(plan.pace)) return false;
  if (!['balanced', 'starters', 'bench'].includes(plan.rotation)) return false;
  if (![26, 32, 38].includes(plan.originalMinutes)) return false;
  return (
    plan.focusPlayerId === undefined ||
    plan.focusPlayerId === 'original-player' ||
    rosterFor(state.selectedTeamId ?? '', catalog).some((p) => p.playerId === plan.focusPlayerId)
  );
}

function restDays(state: CareerState, teamId: string, day: number): number {
  const previous = state.league!.games.filter(
    (g) =>
      g.day < day &&
      g.homeScore !== undefined &&
      (g.homeTeamId === teamId || g.awayTeamId === teamId),
  );
  const previousDay = previous.length ? Math.max(...previous.map((g) => g.day)) : day - 4;
  return Math.max(0, Math.min(4, day - previousDay - 1));
}

/** Called once before a quick game or when entering the live arena, never once per quarter. */
export function prepareMatchInput(
  state: CareerState,
  catalog: Catalog,
  recover = true,
): MatchInput {
  const entry = state.schedule[state.scheduleIndex];
  const game = state.league?.games.find((g) => g.id === entry?.leagueGameId);
  if (!state.player || !state.selectedTeamId || !entry || !game || game.homeScore !== undefined)
    throw Error('INVALID_PHASE');
  const ownRestDays = restDays(state, state.selectedTeamId, game.day);
  const opponentRestDays = restDays(state, entry.opponent.id, game.day);
  if (recover)
    state.player.condition = clamp((state.player.condition ?? 100) + ownRestDays * 8, 35, 100);
  return {
    matchId: entry.matchId,
    seed: entry.seed,
    season: state.season,
    stage: entry.stage,
    player: structuredClone(state.player),
    opponent: entry.opponent,
    ownTeamId: state.selectedTeamId,
    opponentTeamId: entry.opponent.id,
    ownRoster: rosterFor(state.selectedTeamId, catalog),
    opponentRoster: rosterFor(entry.opponent.id, catalog),
    isHome: entry.isHome,
    ownRestDays,
    opponentRestDays,
  };
}

/** Quick and live games share exactly one settlement path. */
export function settleMatch(state: CareerState, result: MatchResult, catalog: Catalog): void {
  const entry = state.schedule[state.scheduleIndex];
  const game = state.league?.games.find((g) => g.id === entry.leagueGameId);
  if (
    !game ||
    game.homeScore !== undefined ||
    state.matches.some((m) => m.matchId === result.matchId) ||
    result.matchId !== entry.matchId
  )
    throw Error('INVALID_PHASE');
  const compact = (match: MatchResult): MatchResult => {
    delete match.input.ownRoster;
    delete match.input.opponentRoster;
    return match;
  };
  state.matches = state.matches.map((match) =>
    compact({ ...match, events: match.events.slice(-5) }),
  );
  compact(result);
  state.matches.push(result);
  state.currentMatchId = result.matchId;
  state.coins += result.reward;
  game.homeScore = entry.isHome ? result.homeScore : result.awayScore;
  game.awayScore = entry.isHome ? result.awayScore : result.homeScore;
  if (entry.stage === 'regular') {
    if (result.won) state.regularWins++;
    advanceRegular(state, catalog, game.day);
  } else recordSeriesResult(state, game);
  if (state.player)
    state.player.condition = clamp(
      (state.player.condition ?? 100) - (result.homeBox[0].minutes / 48) * 14,
      35,
      100,
    );
  state.activeMatch = null;
  state.phase = 'result';
}
