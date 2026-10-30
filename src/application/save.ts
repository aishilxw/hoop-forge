import { z } from 'zod';
import { ATTRIBUTE_KEYS, type Catalog, type CareerState } from '../contracts';
import { RULES_VERSION } from '../config/balance';
import { NBA_TEAMS } from '../data/teams';
const stage = z.enum([
  'regular',
  'playIn',
  'firstRound',
  'conferenceSemifinal',
  'conferenceFinal',
  'final',
]);
const teamIds = new Set(NBA_TEAMS.map((t) => t.id));
const attrs = z.object(
  Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, z.number().int().min(25).max(99)])) as Record<
    (typeof ATTRIBUTE_KEYS)[number],
    z.ZodNumber
  >,
);
const style = z.enum(['primaryCreator', 'offBallScorer', 'interiorAnchor', 'teamOrganizer']);
const card = z.object({
  instanceId: z.string().min(1),
  playerId: z.string().min(1),
  acquiredBy: z.enum(['initialDraft', 'standardPack', 'positionPack']),
  acquisitionSequence: z.number().int().nonnegative(),
});
const lineage = z.record(
  z.enum(ATTRIBUTE_KEYS),
  z.object({
    initialPlayerId: z.string(),
    inheritedFromPlayerId: z.string(),
    trainedPoints: z.number().int().min(0).max(74),
  }),
);
const player = z.object({
  age: z.number().int().min(16).max(120).optional(),
  condition: z.number().min(0).max(100).optional(),
  displayName: z.string().min(1).max(30),
  attributes: attrs,
  playStyle: style,
  lineage,
});
const opponent = z.object({ id: z.string(), name: z.string(), attributes: attrs, style });
export const tacticalPlanSchema = z.object({
  offense: z.enum(['balanced', 'attackPaint', 'perimeter', 'pickAndRoll']),
  defense: z.enum(['balanced', 'protectPaint', 'pressurePerimeter']),
  pace: z.enum(['slow', 'normal', 'fast']),
  rotation: z.enum(['balanced', 'starters', 'bench']),
  originalMinutes: z.union([z.literal(26), z.literal(32), z.literal(38)]),
  focusPlayerId: z.string().optional(),
});
const input = z.object({
  matchId: z.string(),
  seed: z.number().int().nonnegative(),
  season: z.number().int().min(1).max(1000),
  player,
  opponent,
  ownTeamId: z.string(),
  opponentTeamId: z.string(),
  isHome: z.boolean(),
  stage,
  quarterPlans: z.array(tacticalPlanSchema).max(4).optional(),
  ownRestDays: z.number().min(0).max(1000).optional(),
  opponentRestDays: z.number().min(0).max(1000).optional(),
});
const count = z.number().int().nonnegative();
const box = z.object({
  playerId: z.string(),
  name: z.string(),
  minutes: z.number().min(0).max(1000),
  points: count,
  rebounds: count,
  assists: count,
  steals: count,
  blocks: count,
  turnovers: count,
  fgm: count,
  fga: count,
  threePM: count,
  threePA: count,
  ftm: count.optional(),
  fta: count.optional(),
  fouls: count.optional(),
});
const match = z.object({
  matchId: z.string(),
  input,
  homeScore: count,
  awayScore: count,
  won: z.boolean(),
  homeBox: z.array(box).max(30),
  awayBox: z.array(box).max(30),
  events: z
    .array(
      z.object({
        quarter: count,
        text: z.string().max(500),
        homeScore: count,
        awayScore: count,
        secondsRemaining: z.number().min(0).max(720).optional(),
        kind: z
          .enum([
            'two',
            'three',
            'freeThrow',
            'miss',
            'turnover',
            'rebound',
            'foul',
            'substitution',
          ])
          .optional(),
        actorId: z.string().optional(),
        side: z.enum(['own', 'opponent']).optional(),
        x: z.number().min(0).max(100).optional(),
        y: z.number().min(0).max(100).optional(),
        ownLineup: z.array(z.string()).length(5).optional(),
        opponentLineup: z.array(z.string()).length(5).optional(),
      }),
    )
    .max(10000),
  overtimes: count,
  reward: count,
  featured: z.boolean().optional(),
  quarters: z
    .array(
      z.object({
        quarter: count,
        homeScore: count,
        awayScore: count,
        ownPoints: count,
        opponentPoints: count,
        plan: tacticalPlanSchema,
      }),
    )
    .max(24)
    .optional(),
});
export const careerSaveSchema = z.object({
  schemaVersion: z.literal(2),
  activeMatch: z
    .object({
      matchId: z.string(),
      completedQuarters: z.number().int().min(0).max(3),
      plans: z.array(tacticalPlanSchema).max(3),
      preview: match.nullable(),
    })
    .nullable()
    .optional(),
  rulesVersion: z.literal(RULES_VERSION),
  dataVersion: z.string(),
  careerId: z.string(),
  revision: count,
  careerSeed: count,
  rngState: count,
  phase: z.enum(['draft', 'ready', 'live', 'result', 'seasonSummary', 'offseason', 'finished']),
  initialCards: z.array(card).length(20),
  inventory: z.array(card).max(10000),
  player: player.nullable(),
  coins: count,
  season: z.number().int().min(1).max(1000),
  schedule: z
    .array(
      z.object({
        matchId: z.string(),
        opponent,
        seed: count,
        stage,
        isHome: z.boolean(),
        leagueGameId: z.string(),
      }),
    )
    .max(160),
  scheduleIndex: count,
  matches: z.array(match).max(150000),
  currentMatchId: z.string().nullable(),
  regularWins: count,
  seriesWins: count,
  seriesLosses: count,
  championships: count,
  milestones: z.array(z.string()).max(1000),
  appliedCommandIds: z.array(z.string()).max(1000000),
  growthLog: z.array(z.string().max(500)).max(10000),
  selectedTeamId: z.string().nullable(),
  league: z
    .object({
      games: z
        .array(
          z.object({
            id: z.string(),
            homeTeamId: z.string(),
            awayTeamId: z.string(),
            day: count,
            seed: count,
            stage,
            homeScore: count.optional(),
            awayScore: count.optional(),
          }),
        )
        .max(1600),
      standings: z
        .array(
          z.object({
            teamId: z.string(),
            wins: count,
            losses: count,
            pointsFor: count,
            pointsAgainst: count,
            seed: count,
          }),
        )
        .length(30),
      series: z
        .array(
          z.object({
            id: z.string(),
            homeTeamId: z.string(),
            awayTeamId: z.string(),
            homeWins: count,
            awayWins: count,
            round: stage,
            winnerId: z.string().nullable(),
            conference: z.enum(['east', 'west', 'final']),
            games: z.array(z.string()),
          }),
        )
        .max(32),
      round: stage,
      regularComplete: z.boolean(),
      championId: z.string().nullable(),
      scheduleSource: z.literal('generated'),
      playInSeeds: z.record(z.string(), z.array(z.string())),
    })
    .nullable(),
  seasonArchives: z
    .array(
      z
        .object({
          season: count,
          teamId: z.string(),
          wins: count,
          losses: count,
          championId: z.string().nullable(),
          rank: count,
        })
        .passthrough(),
    )
    .max(1000),
});
export const SAVE_KEY = 'hoop-forge:career:v2';
export function validateSave(raw: unknown, catalog: Catalog): CareerState {
  let candidate = raw;
  if (raw && typeof raw === 'object') {
    const old = raw as Record<string, unknown>;
    if (
      old.schemaVersion === 2 &&
      old.rulesVersion === '0.2.0' &&
      String(RULES_VERSION) !== '0.2.0'
    ) {
      const oldPlayer = old.player as Record<string, unknown> | null;
      candidate = {
        ...old,
        rulesVersion: RULES_VERSION,
        activeMatch: null,
        player: oldPlayer
          ? { ...oldPlayer, age: 19 + Number(old.season ?? 1) - 1, condition: 100 }
          : null,
        growthLog: [
          ...(Array.isArray(old.growthLog) ? old.growthLog : []),
          '升级至重点比赛版本：历史比赛保留，新模型仅作用于后续比赛。',
        ],
      };
    }
  }
  const parsed = careerSaveSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('存档格式或版本不受支持，原存档已保留。');
  const state = parsed.data as CareerState;
  if (state.dataVersion !== catalog.dataVersion)
    throw new Error('存档球员数据版本不同，暂不能导入。');
  const ids = new Set(catalog.players.map((p) => p.playerId));
  if ([...state.inventory, ...state.initialCards].some((c) => !ids.has(c.playerId)))
    throw new Error('存档包含未知球员。');
  const stars = new Set(catalog.starIds);
  if (
    new Set(state.initialCards.map((c) => c.instanceId)).size !== 20 ||
    new Set(state.initialCards.map((c) => c.playerId)).size !== 20 ||
    state.initialCards.filter((c) => stars.has(c.playerId)).length !== 5
  )
    throw new Error('存档初始抽卡记录无效。');
  if (
    state.phase === 'draft' &&
    (state.inventory.length !== 20 ||
      state.inventory.some(
        (c) =>
          !state.initialCards.some(
            (a) => a.instanceId === c.instanceId && a.playerId === c.playerId,
          ),
      ))
  )
    throw new Error('初始库存与抽卡记录不一致。');
  if (new Set(state.inventory.map((c) => c.instanceId)).size !== state.inventory.length)
    throw new Error('存档库存包含重复卡实例。');
  if (state.selectedTeamId && !teamIds.has(state.selectedTeamId))
    throw new Error('存档球队不存在。');
  if (state.league) {
    if (
      state.league.standings.some((t) => !teamIds.has(t.teamId)) ||
      new Set(state.league.standings.map((t) => t.teamId)).size !== 30
    )
      throw new Error('联盟排名球队无效。');
    for (const g of state.league.games) {
      if (!teamIds.has(g.homeTeamId) || !teamIds.has(g.awayTeamId) || g.homeTeamId === g.awayTeamId)
        throw new Error('联盟赛程球队无效。');
    }
  }
  if (state.phase !== 'draft' && (!state.selectedTeamId || !state.league))
    throw new Error('存档缺少球队与联盟信息。');
  if (state.phase !== 'draft' && !state.player) throw new Error('存档缺少原创球员。');
  if (
    state.player &&
    ATTRIBUTE_KEYS.some(
      (k) =>
        !ids.has(state.player!.lineage[k].initialPlayerId) ||
        !ids.has(state.player!.lineage[k].inheritedFromPlayerId),
    )
  )
    throw new Error('能力来源无法核对。');
  if (new Set(state.matches.map((m) => m.matchId)).size !== state.matches.length)
    throw new Error('存档比赛记录重复。');
  for (const m of state.matches) {
    if (
      m.input.matchId !== m.matchId ||
      !teamIds.has(m.input.ownTeamId!) ||
      !teamIds.has(m.input.opponentTeamId!) ||
      m.input.opponent.id !== m.input.opponentTeamId ||
      m.homeBox[0]?.playerId !== 'original-player'
    )
      throw new Error('比赛身份记录无效。');
    const sum = (bs: typeof m.homeBox) => bs.reduce((n, b) => n + b.points, 0);
    if (
      sum(m.homeBox) !== m.homeScore ||
      sum(m.awayBox) !== m.awayScore ||
      m.won !== m.homeScore > m.awayScore ||
      m.homeScore === m.awayScore
    )
      throw new Error('存档比赛统计不一致。');
    if (
      [...m.homeBox, ...m.awayBox].some(
        (b) =>
          b.fgm > b.fga ||
          b.threePM > b.threePA ||
          b.threePM > b.fgm ||
          b.points !== 2 * b.fgm + b.threePM + (b.ftm ?? 0) ||
          (b.ftm ?? 0) > (b.fta ?? 0),
      )
    )
      throw new Error('存档个人统计不一致。');
  }
  if (state.league) {
    const league = state.league;
    const unique = new Set(league.games.map((g) => g.id));
    if (unique.size !== league.games.length) throw new Error('联盟赛程含重复比赛。');
    for (const match of state.matches.filter((m) => m.input.season === state.season)) {
      const game = league.games.find((g) => g.id === match.matchId);
      const isHome = match.input.isHome !== false;
      if (
        !game ||
        match.input.ownTeamId !== state.selectedTeamId ||
        (isHome ? game.homeTeamId : game.awayTeamId) !== state.selectedTeamId ||
        (isHome ? game.awayTeamId : game.homeTeamId) !== match.input.opponentTeamId
      )
        throw new Error('比赛球队身份与赛程不一致。');
      if (
        !game ||
        game.homeScore !== (isHome ? match.homeScore : match.awayScore) ||
        game.awayScore !== (isHome ? match.awayScore : match.homeScore)
      )
        throw new Error('联盟赛果与个人比赛记录不一致。');
    }
    const regular = league.games.filter((g) => g.stage === 'regular');
    if (regular.length !== 1230) throw new Error('常规赛总场次必须为1230场。');
    for (const team of NBA_TEAMS) {
      const home = regular.filter((g) => g.homeTeamId === team.id),
        away = regular.filter((g) => g.awayTeamId === team.id);
      if (home.length !== 41 || away.length !== 41) throw new Error('球队常规赛必须为41主41客。');
      const done = [...home, ...away].filter(
        (g) => g.homeScore !== undefined && g.awayScore !== undefined,
      );
      let wins = 0,
        pf = 0,
        pa = 0;
      for (const game of done) {
        const atHome = game.homeTeamId === team.id;
        const own = atHome ? game.homeScore! : game.awayScore!;
        const other = atHome ? game.awayScore! : game.homeScore!;
        if (own === other) throw new Error('已完成比赛不能平局。');
        wins += Number(own > other);
        pf += own;
        pa += other;
      }
      const record = league.standings.find((r) => r.teamId === team.id)!;
      if (
        record.wins !== wins ||
        record.losses !== done.length - wins ||
        record.pointsFor !== pf ||
        record.pointsAgainst !== pa
      )
        throw new Error('联盟排名与已完成比赛不一致。');
    }
  }
  if (['ready', 'live', 'result'].includes(state.phase) && !state.schedule[state.scheduleIndex])
    throw new Error('存档赛程游标无效。');
  if (
    state.phase === 'result' &&
    (!state.currentMatchId ||
      !state.matches.some((m) => m.matchId === state.currentMatchId) ||
      state.schedule[state.scheduleIndex]?.matchId !== state.currentMatchId)
  )
    throw new Error('存档赛后记录缺失或与赛程不符。');
  if (state.phase === 'live') {
    const active = state.activeMatch;
    const entry = state.schedule[state.scheduleIndex];
    if (
      !active ||
      !entry ||
      entry.matchId !== active.matchId ||
      active.completedQuarters !== active.plans.length
    )
      throw new Error('重点比赛进度与赛程不一致。');
    if (active.completedQuarters === 0 && active.preview !== null)
      throw new Error('比赛尚未开始却包含回合数据。');
    if (active.completedQuarters > 0) {
      const preview = active.preview;
      if (
        !preview ||
        preview.matchId !== active.matchId ||
        preview.reward !== 0 ||
        preview.events.some((e) => e.quarter > active.completedQuarters)
      )
        throw new Error('重点比赛包含未进行节的数据或提前奖励。');
      for (const boxes of [preview.homeBox, preview.awayBox])
        for (const b of boxes)
          if (b.points !== 2 * b.fgm + b.threePM + (b.ftm ?? 0) || (b.ftm ?? 0) > (b.fta ?? 0))
            throw new Error('重点比赛统计不一致。');
      if (
        preview.homeBox.reduce((n, b) => n + b.points, 0) !== preview.homeScore ||
        preview.awayBox.reduce((n, b) => n + b.points, 0) !== preview.awayScore
      )
        throw new Error('重点比赛比分无效。');
    }
    if (
      state.matches.some((m) => m.matchId === active.matchId) ||
      state.league?.games.find((g) => g.id === entry.leagueGameId)?.homeScore !== undefined
    )
      throw new Error('重点比赛已提前结算。');
    const allowed = new Set(
      catalog.players.filter((p) => p.teamLabel === state.selectedTeamId).map((p) => p.playerId),
    );
    allowed.add('original-player');
    if (active.plans.some((p) => p.focusPlayerId && !allowed.has(p.focusPlayerId)))
      throw new Error('战术指定了非本队球员。');
  } else if (state.activeMatch) throw new Error('比赛进度与当前阶段不一致。');
  return state;
}
export function loadSave(catalog: Catalog): CareerState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? validateSave(JSON.parse(raw), catalog) : null;
}
export function persistSave(state: CareerState): void {
  const serialized = JSON.stringify(state);
  if (new Blob([serialized]).size > 64 * 1024 * 1024)
    throw new Error('存档已超过容量限制，请导出备份。');
  const old = localStorage.getItem(SAVE_KEY);
  if (old) localStorage.setItem(`${SAVE_KEY}:backup`, old);
  localStorage.setItem(SAVE_KEY, serialized);
}
