import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  type BoxScore,
  type CareerState,
  type Catalog,
  type PlayerDefinition,
  type TacticalPlan,
} from '../contracts';
import { NBA_TEAMS } from '../data/teams';
import { DEFAULT_PLAN } from '../config/simulation';
import { describePlan } from '../config/tactics';
import type { AiMetrics, ReportFact } from './career-facts';
export interface CoachCandidate {
  id: string;
  name: string;
}
export interface CoachContext {
  version: 1;
  matchId: string;
  completedQuarters: number;
  facts: ReportFact[];
  focusCandidates: CoachCandidate[];
}
export interface CoachAdvice {
  headline: string;
  analysis: { text: string; evidenceIds: string[] }[];
  plan: TacticalPlan;
  reason: string;
  tradeoff: string;
}
export interface CoachRecord {
  model: string;
  generatedAt: string;
  fingerprint: string;
  context: CoachContext;
  advice: CoachAdvice;
  metrics?: AiMetrics;
  servedFromCache?: boolean;
}
const teamName = (id: string | null) => NBA_TEAMS.find((t) => t.id === id)?.nameZh ?? '我的球队';
const traits = (p: PlayerDefinition) =>
  [...ATTRIBUTE_KEYS]
    .sort((a, b) => p.attributes[b] - p.attributes[a])
    .slice(0, 2)
    .map((k) => ATTRIBUTE_LABELS[k])
    .join('/');
const strength = (p: PlayerDefinition) => ATTRIBUTE_KEYS.reduce((s, k) => s + p.attributes[k], 0);
const stats = (boxes: BoxScore[]) => {
  const sum = (k: keyof BoxScore) =>
    boxes.reduce((s, b) => s + (typeof b[k] === 'number' ? (b[k] as number) : 0), 0);
  return `投篮${sum('fgm')}/${sum('fga')}，三分${sum('threePM')}/${sum('threePA')}，罚球${sum('ftm')}/${sum('fta')}，篮板${sum('rebounds')}，助攻${sum('assists')}，失误${sum('turnovers')}，犯规${sum('fouls')}`;
};
/** Built only from completed quarters. Never accepts a seed, unplayed event or future score. */
export function buildCoachContext(state: CareerState, catalog: Catalog): CoachContext | null {
  const active = state.activeMatch;
  if (state.phase !== 'live' || !active || !state.player || active.completedQuarters >= 4)
    return null;
  const entry = state.schedule[state.scheduleIndex];
  if (!entry || active.matchId !== entry.matchId) return null;
  const q = active.completedQuarters;
  const preview = active.preview;
  if ((q > 0 && !preview) || (q === 0 && preview)) return null;
  if (
    preview &&
    (preview.events.some((e) => e.quarter > q) ||
      (preview.quarters ?? []).some((s) => s.quarter > q))
  )
    return null;
  const facts: ReportFact[] = [];
  const add = (id: string, label: string, text: string) => facts.push({ id, label, text });
  add(
    'situation',
    '当前局势',
    `第${state.season}季，${entry.isHome ? '主场' : '客场'}，${teamName(state.selectedTeamId)}对${entry.opponent.name}；${q ? `已完成${q}节，比分${preview!.homeScore}:${preview!.awayScore}` : '赛前，0:0'}，现在为第${q + 1}节布置。`,
  );
  add(
    'player',
    '原创球员',
    `${state.player.displayName}；赛前身体状态${Math.round(state.player.condition ?? 100)}%；${ATTRIBUTE_KEYS.map((k) => `${ATTRIBUTE_LABELS[k]}${state.player!.attributes[k]}`).join('、')}。状态不是场上实时体力。`,
  );
  const ownBoxes = preview?.homeBox ?? [];
  const opponentBoxes = preview?.awayBox ?? [];
  add('own', '我方累计表现', q ? stats(ownBoxes) : '尚未开赛，无已发生的技术统计。');
  add('opponent', '对手累计表现', q ? stats(opponentBoxes) : '尚未开赛，无已发生的技术统计。');
  if (q) {
    const b = ownBoxes.find((b) => b.playerId === 'original-player');
    if (b)
      add(
        'self',
        '原创球员累计表现',
        `${b.minutes.toFixed(1)}分钟，${b.points}分${b.rebounds}篮板${b.assists}助攻，${b.turnovers}失误，${b.fouls ?? 0}犯规。六犯不得推荐重点使用。`,
      );
    add(
      'quarters',
      '已完成节比分',
      (preview?.quarters ?? [])
        .filter((x) => x.quarter <= q)
        .map((x) => `第${x.quarter}节${x.ownPoints}:${x.opponentPoints}`)
        .join('；'),
    );
  }
  add(
    'previous',
    '上一节实际计划',
    q ? describePlan(active.plans.at(-1) ?? DEFAULT_PLAN) : '首节尚未执行，无上一节计划。',
  );
  const available = catalog.players
    .filter(
      (p) =>
        p.teamLabel === state.selectedTeamId &&
        (ownBoxes.find((b) => b.playerId === p.playerId)?.fouls ?? 0) < 6,
    )
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, 5);
  const focusCandidates: CoachCandidate[] = [];
  if ((ownBoxes.find((b) => b.playerId === 'original-player')?.fouls ?? 0) < 6)
    focusCandidates.push({ id: 'original-player', name: state.player.displayName });
  focusCandidates.push(...available.map((p) => ({ id: p.playerId, name: p.nameZh ?? p.nameEn })));
  add(
    'rotation',
    '可推荐的重点球员',
    focusCandidates
      .map((c) => {
        const b = ownBoxes.find((b) => b.playerId === c.id);
        const p = available.find((p) => p.playerId === c.id);
        return `${c.name}${p ? `（长处${traits(p)}）` : ''}，累计${b?.minutes.toFixed(1) ?? 0}分钟/${b?.fouls ?? 0}犯规`;
      })
      .join('；') || '无人可指定，使用自动分配。',
  );
  const rivals = catalog.players
    .filter((p) => p.teamLabel === entry.opponent.id)
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, 3);
  add(
    'scouting',
    '对手名册特征',
    rivals.map((p) => `${p.nameZh ?? p.nameEn}：${traits(p)}`).join('；') +
      '。这是游戏能力快照，不是对手当前战术或真实新闻。',
  );
  return { version: 1, matchId: active.matchId, completedQuarters: q, facts, focusCandidates };
}
export function canApplyCoach(context: CoachContext, state: CareerState): boolean {
  return (
    state.phase === 'live' &&
    state.activeMatch?.matchId === context.matchId &&
    state.activeMatch.completedQuarters === context.completedQuarters &&
    context.completedQuarters < 4
  );
}
