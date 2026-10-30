import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type CareerState,
  type Catalog,
  type GameStage,
  type LeagueGame,
  type LeagueState,
  type PlayerDefinition,
  type PlayoffSeries,
  type ScheduleEntry,
  type Standing,
  type TeamDefinition,
  type TeamTemplate,
} from '../contracts';
import { NBA_TEAMS } from '../data/teams';
import { hashSeed, Random } from './rng';
import { simulateMatch } from './simulation';
export const teamById = (id: string) => {
  const t = NBA_TEAMS.find((t) => t.id === id);
  if (!t) throw Error('Unknown NBA team ' + id);
  return t;
};
export const rosterFor = (id: string, catalog: Catalog) =>
  catalog.players.filter((p) => p.teamLabel === id);
export function teamTemplate(id: string, catalog: Catalog): TeamTemplate {
  const t = teamById(id);
  const roster = rosterFor(id, catalog)
    .sort(
      (a, b) =>
        Object.values(b.attributes).reduce((s, v) => s + v, 0) -
        Object.values(a.attributes).reduce((s, v) => s + v, 0),
    )
    .slice(0, 8);
  if (roster.length < 8) throw Error('Incomplete roster ' + id);
  return {
    id,
    name: t.nameZh,
    style: 'primaryCreator',
    attributes: Object.fromEntries(
      ATTRIBUTE_KEYS.map((k) => [
        k,
        Math.round(roster.reduce((s, p) => s + p.attributes[k], 0) / roster.length),
      ]),
    ) as Attributes,
  };
}
/** A generated NBA-format schedule, explicitly not the official dated fixture list. */
export function generateLeagueSchedule(
  teams: TeamDefinition[],
  seed: number,
  season: number,
): LeagueGame[] {
  if (teams.length !== 30) throw Error('NBA requires 30 teams');
  const rng = new Random(seed);
  const ordered = rng.shuffle(teams);
  const pairGames = new Map<string, { home: string; away: string }[]>();
  const odd: { a: string; b: string; used: boolean }[] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i],
        b = teams[j];
      let count = 2;
      if (a.conference === b.conference) {
        if (a.division === b.division) count = 4;
        else {
          const divisions = [
            ...new Set(teams.filter((t) => t.conference === a.conference).map((t) => t.division)),
          ].sort();
          const dA = divisions.indexOf(a.division),
            dB = divisions.indexOf(b.division);
          const ia = teams
              .filter((t) => t.division === a.division)
              .map((t) => t.id)
              .sort()
              .indexOf(a.id),
            ib = teams
              .filter((t) => t.division === b.division)
              .map((t) => t.id)
              .sort()
              .indexOf(b.id);
          const diff = dA < dB ? (ib - ia + season - 1 + 50) % 5 : (ia - ib + season - 1 + 50) % 5;
          count = diff < 3 ? 4 : 3;
        }
      }
      const list: { home: string; away: string }[] = [];
      for (let n = 0; n < Math.floor(count / 2); n++)
        list.push({ home: a.id, away: b.id }, { home: b.id, away: a.id });
      if (count % 2) odd.push({ a: a.id, b: b.id, used: false });
      pairGames.set([a.id, b.id].sort().join(':'), list);
    }
  // Odd-pair graph has even degree (four per team): orient each Euler circuit for balanced home games.
  for (const start of teams) {
    while (odd.some((e) => !e.used && (e.a === start.id || e.b === start.id))) {
      let current = start.id;
      while (true) {
        const e = odd.find((e) => !e.used && (e.a === current || e.b === current));
        if (!e) break;
        e.used = true;
        const other = e.a === current ? e.b : e.a;
        pairGames.get([current, other].sort().join(':'))!.push({ home: current, away: other });
        current = other;
      }
    }
  }
  // Preserve 41/41 totals while avoiding entire opening blocks at home.
  for (const [key, list] of pairGames) pairGames.set(key, rng.shuffle(list));
  const rotation = [...ordered.map((t) => t.id)];
  const games: LeagueGame[] = [];
  for (let cycle = 0; cycle < 4; cycle++)
    for (let round = 0; round < 29; round++) {
      for (let i = 0; i < 15; i++) {
        const a = rotation[i],
          b = rotation[29 - i];
        const key = [a, b].sort().join(':');
        const g = pairGames.get(key)!.shift();
        if (g) {
          const id = `s${season}-regular-${cycle}-${round}-${key}`;
          games.push({
            id,
            homeTeamId: g.home,
            awayTeamId: g.away,
            day: Math.floor((cycle * 29 + round) * 1.55),
            seed: hashSeed(`${seed}:${id}`),
            stage: 'regular',
          });
        }
      }
      rotation.splice(1, 0, rotation.pop()!);
    }
  if (games.length !== 1230 || [...pairGames.values()].some((v) => v.length))
    throw Error('Invalid NBA schedule');
  return games;
}
export function createLeague(seed: number, season: number): LeagueState {
  const league: LeagueState = {
    games: generateLeagueSchedule(NBA_TEAMS, seed, season),
    standings: [],
    series: [],
    round: 'regular',
    regularComplete: false,
    championId: null,
    scheduleSource: 'generated',
    playInSeeds: {},
  };
  league.standings = leagueStandings(league);
  return league;
}
function ratio(w: number, l: number) {
  return w + l ? w / (w + l) : 0;
}
export function leagueStandings(league: LeagueState, compareIds?: string[]): Standing[] {
  const completed = league.games.filter(
    (g) => g.stage === 'regular' && g.homeScore !== undefined && g.awayScore !== undefined,
  );
  const records = NBA_TEAMS.map((t) => {
    const gs = completed.filter((g) => g.homeTeamId === t.id || g.awayTeamId === t.id);
    let wins = 0,
      pf = 0,
      pa = 0;
    for (const g of gs) {
      const home = g.homeTeamId === t.id;
      const own = home ? g.homeScore! : g.awayScore!,
        opp = home ? g.awayScore! : g.homeScore!;
      wins += Number(own > opp);
      pf += own;
      pa += opp;
    }
    return {
      teamId: t.id,
      wins,
      losses: gs.length - wins,
      pointsFor: pf,
      pointsAgainst: pa,
      seed: 0,
    };
  });
  const winner = (g: LeagueGame) => (g.homeScore! > g.awayScore! ? g.homeTeamId : g.awayTeamId);
  const recordAgainst = (id: string, opponents: Set<string>) => {
    const gs = completed.filter(
      (g) =>
        (g.homeTeamId === id && opponents.has(g.awayTeamId)) ||
        (g.awayTeamId === id && opponents.has(g.homeTeamId)),
    );
    return ratio(
      gs.filter((g) => winner(g) === id).length,
      gs.filter((g) => winner(g) !== id).length,
    );
  };
  const divisionLeaders = new Set<string>();
  function resolve(group: Standing[], criterion = 0, divisionTie = false): Standing[] {
    if (group.length <= 1) return group;
    const allSameDivision = new Set(group.map((r) => teamById(r.teamId).division)).size === 1;
    const tied = new Set(group.map((r) => r.teamId));
    const metric = (r: Standing): number => {
      const team = teamById(r.teamId);
      const conferenceTeams = new Set(
        NBA_TEAMS.filter((t) => t.conference === team.conference).map((t) => t.id),
      );
      const values =
        group.length === 2
          ? [recordAgainst(r.teamId, tied), Number(!divisionTie && divisionLeaders.has(r.teamId))]
          : [Number(!divisionTie && divisionLeaders.has(r.teamId)), recordAgainst(r.teamId, tied)];
      values.push(
        allSameDivision
          ? recordAgainst(
              r.teamId,
              new Set(NBA_TEAMS.filter((t) => t.division === team.division).map((t) => t.id)),
            )
          : 0,
        recordAgainst(r.teamId, conferenceTeams),
      );
      const confs =
        group.length === 2
          ? [team.conference, team.conference === 'east' ? 'west' : 'east']
          : [team.conference];
      for (const conf of confs) {
        const conferenceRecords = records
          .filter((x) => teamById(x.teamId).conference === conf)
          .sort((a, b) => ratio(b.wins, b.losses) - ratio(a.wins, a.losses));
        const threshold = conferenceRecords[Math.min(9, conferenceRecords.length - 1)];
        const eligible = conferenceRecords.filter(
          (x) => ratio(x.wins, x.losses) >= ratio(threshold.wins, threshold.losses),
        );
        values.push(recordAgainst(r.teamId, new Set(eligible.map((x) => x.teamId))));
      }
      values.push(r.pointsFor - r.pointsAgainst);
      return values[criterion] ?? 0;
    };
    const maxCriteria = group.length === 2 ? 7 : 6;
    if (criterion >= maxCriteria) {
      const lotterySeed = league.games[0]?.seed ?? 0;
      return group.sort(
        (a, b) =>
          hashSeed(`${lotterySeed}:draw:${a.teamId}`) - hashSeed(`${lotterySeed}:draw:${b.teamId}`),
      );
    }
    const sorted = [...group].sort((a, b) => metric(b) - metric(a));
    const buckets: Standing[][] = [];
    for (const r of sorted) {
      const last = buckets.at(-1);
      if (last && metric(last[0]) === metric(r)) last.push(r);
      else buckets.push([r]);
    }
    return buckets.length === 1
      ? resolve(group, criterion + 1, divisionTie)
      : buckets.flatMap((b) => resolve(b, 0, divisionTie));
  }
  for (const division of new Set(NBA_TEAMS.map((t) => t.division))) {
    const list = records
      .filter((r) => teamById(r.teamId).division === division)
      .sort((a, b) => ratio(b.wins, b.losses) - ratio(a.wins, a.losses));
    const top = ratio(list[0].wins, list[0].losses);
    divisionLeaders.add(
      resolve(
        list.filter((r) => ratio(r.wins, r.losses) === top),
        0,
        true,
      )[0].teamId,
    );
  }
  if (compareIds) {
    const candidates = records.filter((r) => compareIds.includes(r.teamId));
    const sorted = [...candidates].sort(
      (a, b) => ratio(b.wins, b.losses) - ratio(a.wins, a.losses),
    );
    return sorted.length === 2 &&
      ratio(sorted[0].wins, sorted[0].losses) === ratio(sorted[1].wins, sorted[1].losses)
      ? resolve(sorted)
      : sorted;
  }
  const output: Standing[] = [];
  for (const conf of ['east', 'west']) {
    const list = records
      .filter((r) => teamById(r.teamId).conference === conf)
      .sort((a, b) => ratio(b.wins, b.losses) - ratio(a.wins, a.losses));
    const groups: Standing[][] = [];
    for (const r of list) {
      const last = groups.at(-1);
      if (last && ratio(last[0].wins, last[0].losses) === ratio(r.wins, r.losses)) last.push(r);
      else groups.push([r]);
    }
    groups.flatMap((g) => resolve(g)).forEach((r, i) => output.push({ ...r, seed: i + 1 }));
  }
  return output;
}
export function simulateLeagueGame(game: LeagueGame, catalog: Catalog, season: number) {
  const home = rosterFor(game.homeTeamId, catalog);
  const top = home[0];
  if (!top) throw Error('Roster missing');
  const result = simulateMatch({
    matchId: game.id,
    seed: game.seed,
    season,
    player: {
      displayName: top.nameZh || top.nameEn,
      attributes: top.attributes,
      playStyle: 'primaryCreator',
      lineage: Object.fromEntries(
        ATTRIBUTE_KEYS.map((k) => [
          k,
          { initialPlayerId: top.playerId, inheritedFromPlayerId: top.playerId, trainedPoints: 0 },
        ]),
      ) as import('../contracts').OriginalPlayer['lineage'],
    },
    opponent: teamTemplate(game.awayTeamId, catalog),
    ownRoster: home,
    opponentRoster: rosterFor(game.awayTeamId, catalog),
    ownTeamId: game.homeTeamId,
    opponentTeamId: game.awayTeamId,
    isHome: true,
    includeOriginal: false,
  });
  game.homeScore = result.homeScore;
  game.awayScore = result.awayScore;
}
export function userEntry(game: LeagueGame, state: CareerState, catalog: Catalog): ScheduleEntry {
  const isHome = game.homeTeamId === state.selectedTeamId;
  return {
    matchId: game.id,
    leagueGameId: game.id,
    seed: game.seed,
    stage: game.stage,
    isHome,
    opponent: teamTemplate(isHome ? game.awayTeamId : game.homeTeamId, catalog),
  };
}
export function advanceRegular(state: CareerState, catalog: Catalog, day: number) {
  for (const g of state.league!.games)
    if (
      g.stage === 'regular' &&
      g.day <= day &&
      g.homeScore === undefined &&
      g.homeTeamId !== state.selectedTeamId &&
      g.awayTeamId !== state.selectedTeamId
    )
      simulateLeagueGame(g, catalog, state.season);
  state.league!.standings = leagueStandings(state.league!);
}
function appendGame(
  state: CareerState,
  home: string,
  away: string,
  stage: GameStage,
  id: string,
): LeagueGame {
  const g = {
    id,
    homeTeamId: home,
    awayTeamId: away,
    stage,
    day: 200 + state.league!.games.length,
    seed: hashSeed(`${state.careerSeed}:${state.season}:${id}`),
  };
  state.league!.games.push(g);
  return g;
}
function addSeries(
  state: CareerState,
  a: string,
  b: string,
  round: GameStage,
  conf: 'east' | 'west' | 'final',
) {
  const league = state.league!;
  const seeds = league.standings;
  const ra = seeds.find((s) => s.teamId === a)!,
    rb = seeds.find((s) => s.teamId === b)!;
  const playoffSeeds = conf === 'final' ? [] : league.playInSeeds[conf];
  const aBetter =
    conf === 'final'
      ? leagueStandings(league, [a, b])[0].teamId === a
      : playoffSeeds.indexOf(a) < playoffSeeds.indexOf(b);
  league.series.push({
    id: `s${state.season}-${round}-${a}-${b}`,
    homeTeamId: aBetter ? a : b,
    awayTeamId: aBetter ? b : a,
    homeWins: 0,
    awayWins: 0,
    round,
    winnerId: null,
    conference: conf,
    games: [],
  });
}
function seriesGame(state: CareerState, s: PlayoffSeries) {
  const n = s.homeWins + s.awayWins;
  const home = [0, 1, 4, 6].includes(n) ? s.homeTeamId : s.awayTeamId;
  const away = home === s.homeTeamId ? s.awayTeamId : s.homeTeamId;
  const g = appendGame(state, home, away, s.round, `${s.id}-g${n + 1}`);
  s.games.push(g.id);
  return g;
}
export function recordSeriesResult(state: CareerState, game: LeagueGame) {
  const s = state.league!.series.find((s) => s.games.includes(game.id));
  if (!s) return;
  const winner = game.homeScore! > game.awayScore! ? game.homeTeamId : game.awayTeamId;
  if (winner === s.homeTeamId) s.homeWins++;
  else s.awayWins++;
  if (s.homeWins === 4 || s.awayWins === 4) s.winnerId = winner;
  state.seriesWins = s.homeTeamId === state.selectedTeamId ? s.homeWins : s.awayWins;
  state.seriesLosses = s.homeTeamId === state.selectedTeamId ? s.awayWins : s.homeWins;
}
function seasonEnd(state: CareerState) {
  const league = state.league!;
  if (
    league.championId === state.selectedTeamId &&
    !state.milestones.includes(`s${state.season}:champion`)
  ) {
    state.championships++;
    state.coins += 500;
    state.milestones.push(`s${state.season}:champion`);
  }
  const record = league.standings.find((s) => s.teamId === state.selectedTeamId)!;
  const games = state.matches.filter((m) => m.input.season === state.season);
  const playIn = games.filter((m) => m.input.stage === 'playIn');
  const regular = games.filter((m) => m.input.stage === 'regular'),
    playoffs = games.filter((m) => m.input.stage !== 'regular' && m.input.stage !== 'playIn');
  const averages = (list: typeof games) =>
    Object.fromEntries(
      ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'].map((key) => [
        key,
        list.length
          ? Math.round(
              (list.reduce((sum, m) => sum + m.homeBox[0][key as 'points'], 0) / list.length) * 10,
            ) / 10
          : 0,
      ]),
    );
  const lastSeries = league.series
    .filter((s) => s.homeTeamId === state.selectedTeamId || s.awayTeamId === state.selectedTeamId)
    .at(-1);
  const outcomes: Record<string, string> = {
    firstRound: '首轮止步',
    conferenceSemifinal: '分区半决赛止步',
    conferenceFinal: '分区决赛止步',
    final: '总决赛亚军',
  };
  const outcome =
    league.championId === state.selectedTeamId
      ? 'NBA总冠军'
      : lastSeries
        ? outcomes[lastSeries.round]
        : games.some((m) => m.input.stage === 'playIn')
          ? '附加赛止步'
          : '未进入附加赛';
  state.seasonArchives.push({
    season: state.season,
    teamId: state.selectedTeamId!,
    wins: record.wins,
    losses: record.losses,
    rank: record.seed,
    championId: league.championId,
    summary: {
      regularGames: regular.length,
      playInGames: playIn.length,
      playInAverages: averages(playIn),
      playoffGames: playoffs.length,
      regularAverages: averages(regular),
      playoffAverages: averages(playoffs),
      bestPoints: Math.max(0, ...games.map((m) => m.homeBox[0].points)),
      outcome,
    },
  });
  state.phase = 'seasonSummary';
}
/** Resolve every non-player fixture, pausing only when the selected team must play. */
export function progressPostseason(state: CareerState, catalog: Catalog): void {
  const league = state.league!;
  if (!league.regularComplete) {
    advanceRegular(state, catalog, Infinity);
    league.regularComplete = true;
    league.round = 'playIn';
    for (const conf of ['east', 'west'])
      league.playInSeeds[conf] = league.standings
        .filter((r) => teamById(r.teamId).conference === conf)
        .sort((a, b) => a.seed - b.seed)
        .slice(0, 10)
        .map((r) => r.teamId);
  }
  const playGame = (g: LeagueGame) => {
    if (g.homeScore !== undefined) return true;
    if (g.homeTeamId === state.selectedTeamId || g.awayTeamId === state.selectedTeamId) {
      state.schedule.push(userEntry(g, state, catalog));
      state.phase = 'ready';
      return false;
    }
    simulateLeagueGame(g, catalog, state.season);
    return true;
  };
  if (league.round === 'playIn') {
    for (const conf of ['east', 'west']) {
      const seeds = league.playInSeeds[conf];
      const get = (tag: string, home: string, away: string) =>
        league.games.find((g) => g.id === `s${state.season}-${conf}-${tag}`) ??
        appendGame(state, home, away, 'playIn', `s${state.season}-${conf}-${tag}`);
      const g78 = get('78', seeds[6], seeds[7]);
      if (!playGame(g78)) return;
      const g910 = get('910', seeds[8], seeds[9]);
      if (!playGame(g910)) return;
      const win = (g: LeagueGame) => (g.homeScore! > g.awayScore! ? g.homeTeamId : g.awayTeamId);
      const loser78 = win(g78) === g78.homeTeamId ? g78.awayTeamId : g78.homeTeamId;
      const last = get('last', loser78, win(g910));
      if (!playGame(last)) return;
      league.playInSeeds[conf] = [...seeds.slice(0, 6), win(g78), win(last), seeds[8], seeds[9]];
    }
    league.round = 'firstRound';
    for (const conf of ['east', 'west'] as const) {
      const s = league.playInSeeds[conf];
      for (const [a, b] of [
        [0, 7],
        [3, 4],
        [1, 6],
        [2, 5],
      ])
        addSeries(state, s[a], s[b], 'firstRound', conf);
    }
  }
  for (let guard = 0; guard < 10; guard++) {
    const current = league.series.filter((s) => s.round === league.round);
    for (const s of current) {
      while (!s.winnerId) {
        let g = s.games.length ? league.games.find((g) => g.id === s.games.at(-1))! : null;
        if (g?.homeScore !== undefined) g = null;
        if (!g) g = seriesGame(state, s);
        if (!playGame(g)) return;
        recordSeriesResult(state, g);
      }
    }
    if (league.round === 'final') {
      league.championId = current[0].winnerId;
      seasonEnd(state);
      return;
    }
    const next: GameStage =
      league.round === 'firstRound'
        ? 'conferenceSemifinal'
        : league.round === 'conferenceSemifinal'
          ? 'conferenceFinal'
          : 'final';
    if (next === 'final') {
      const winners = current.map((s) => s.winnerId!);
      addSeries(state, winners[0], winners[1], next, 'final');
    } else {
      for (const conf of ['east', 'west'] as const) {
        const winners = current.filter((s) => s.conference === conf).map((s) => s.winnerId!);
        for (let i = 0; i < winners.length; i += 2)
          addSeries(state, winners[i], winners[i + 1], next, conf);
      }
    }
    league.round = next;
  }
  throw Error('Postseason progression exceeded budget');
}
