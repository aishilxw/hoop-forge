import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, STYLE_LABELS, type CareerState } from '../contracts';
import { NBA_TEAMS } from '../data/teams';

export interface ReportFact {
  id: string;
  label: string;
  text: string;
}
export interface CareerFacts {
  version: 1;
  scope: string;
  facts: ReportFact[];
}
export interface NarrativeSection {
  title: string;
  body: string;
  evidenceIds: string[];
}
export interface CareerNarrative {
  title: string;
  sections: NarrativeSection[];
  nextSteps: NarrativeSection[];
}
export interface AiReportRecord {
  model: string;
  generatedAt: string;
  fingerprint: string;
  narrative: CareerNarrative;
  facts: CareerFacts;
  metrics?: AiMetrics;
  servedFromCache?: boolean;
}
export interface AiMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  durationMs: number;
}
const teamName = (id: string | null) => NBA_TEAMS.find((t) => t.id === id)?.nameZh ?? '未确认球队';
const roundNames: Record<string, string> = {
  playIn: '附加赛',
  firstRound: '季后赛首轮',
  conferenceSemifinal: '分区半决赛',
  conferenceFinal: '分区决赛',
  final: '总决赛',
};

/** Only settled records enter AI context. Never includes a key, hidden card ratings or future results. */
export function buildCareerFacts(state: CareerState, season: number | 'all'): CareerFacts {
  const archive =
    season === 'all' ? undefined : state.seasonArchives.find((a) => a.season === season);
  const scope =
    season === 'all'
      ? '完整生涯截至当前'
      : archive
        ? `第${season}赛季（已归档）`
        : `第${season}赛季截至当前`;
  if (!state.player) return { version: 1, scope, facts: [] };
  const games = state.matches.filter((m) => season === 'all' || m.input.season === season);
  if (!games.length) return { version: 1, scope, facts: [] };
  const subject = archive ? games.at(-1)!.input.player : state.player;
  const facts: ReportFact[] = [];
  const add = (id: string, label: string, text: string) => facts.push({ id, label, text });
  add(
    'identity',
    archive ? '该季末次比赛记录中的球员' : '当前球员',
    `${subject.displayName}；${archive ? '该季记录' : '当前'}年龄${subject.age === undefined ? '未记录' : `${subject.age}岁`}；球队${teamName(archive?.teamId ?? state.selectedTeamId)}；打法${STYLE_LABELS[subject.playStyle]}。`,
  );
  add(
    'boundary',
    '游戏事实边界',
    `阅读范围：${scope}。游戏模拟，非现实NBA新闻。未知奖项、伤病、交易和采访不可编造。${archive ? '球员和能力取该季末次比赛快照，年龄缺失不得猜测。' : '当前球员信息不代表历史赛季信息。'}`,
  );
  add(
    'abilities',
    archive ? '该季末次比赛九维能力' : '当前九维能力',
    ATTRIBUTE_KEYS.map((k) => `${ATTRIBUTE_LABELS[k]}${subject.attributes[k]}`).join('、'),
  );
  const stage = (m: (typeof games)[number]) =>
    m.input.stage ??
    state.schedule.find((s) => s.matchId === m.matchId)?.stage ??
    state.league?.games.find((g) => g.id === m.matchId)?.stage ??
    'regular';
  const box = (m: (typeof games)[number]) =>
    m.homeBox.find((b) => b.playerId === 'original-player') ?? m.homeBox[0];
  const summarize = (list: typeof games) => {
    const n = list.length;
    if (!n) return '尚无已完成比赛';
    const sum = (
      key: 'points' | 'rebounds' | 'assists' | 'turnovers' | 'fgm' | 'fga' | 'threePM' | 'threePA',
    ) => list.reduce((s, m) => s + (box(m)?.[key] ?? 0), 0);
    const wins = list.filter((m) => m.won).length;
    return `${n}场，${wins}胜${n - wins}负；原创球员场均${(sum('points') / n).toFixed(1)}分、${(sum('rebounds') / n).toFixed(1)}篮板、${(sum('assists') / n).toFixed(1)}助攻、${(sum('turnovers') / n).toFixed(1)}失误；投篮${sum('fga') ? ((100 * sum('fgm')) / sum('fga')).toFixed(1) + '%' : '无出手'}，三分${sum('threePA') ? ((100 * sum('threePM')) / sum('threePA')).toFixed(1) + '%' : '无出手'}。`;
  };
  const includedSeasons = [...new Set(games.map((m) => m.input.season))].sort((a, b) => a - b);
  const coverage = includedSeasons
    .slice(-8)
    .map((s) => {
      const list = games.filter((m) => m.input.season === s);
      const archive = state.seasonArchives.find((a) => a.season === s);
      const regularCount = list.filter((m) => stage(m) === 'regular').length;
      const playoffCount = list.filter((m) => !['regular', 'playIn'].includes(stage(m))).length;
      const wins = list.filter((m) => m.won).length;
      return `第${s}季：${list.length}场，${wins}胜${list.length - wins}负，其中常规赛${regularCount}场、季后赛${playoffCount}场；${archive ? '赛季已归档' : s === state.season && ['seasonSummary', 'offseason', 'finished'].includes(state.phase) ? '赛季已结束' : '截至目前，赛季尚未归档'}。`;
    })
    .join('');
  add(
    'coverage',
    '逐季统计边界',
    `所选范围涉及${includedSeasons.length}个赛季。${coverage}${includedSeasons.length > 8 ? '仅列最近八季的拆分。' : ''}累计统计不能写成单个赛季的数据，单季常规赛最多82场。`,
  );
  add(
    'overall',
    includedSeasons.length > 1 ? '跨赛季累计总览' : '所选赛季总览',
    `${includedSeasons.length > 1 ? `跨${includedSeasons.length}季累计，非单季：` : ''}${summarize(games)}`,
  );
  add('regular', '常规赛', summarize(games.filter((m) => stage(m) === 'regular')));
  add('playin', '附加赛', summarize(games.filter((m) => stage(m) === 'playIn')));
  add(
    'playoffs',
    '季后赛',
    summarize(games.filter((m) => !['regular', 'playIn'].includes(stage(m)))),
  );
  const best = [...games]
    .sort((a, b) => {
      const score = (m: (typeof games)[number]) => {
        const b = box(m);
        return b ? b.points + b.rebounds * 1.2 + b.assists * 1.5 - b.turnovers * 2 : 0;
      };
      return score(b) - score(a);
    })
    .slice(0, 3);
  for (const [index, m] of best.entries()) {
    const b = box(m);
    add(
      `highlight:${index}`,
      `代表比赛 ${index + 1}`,
      `第${m.input.season}季，${roundNames[stage(m)] ?? '常规赛'}，对${m.input.opponent.name}，我的球队${m.homeScore}比${m.awayScore}${m.won ? '获胜' : '失利'}；${b?.points ?? 0}分、${b?.rebounds ?? 0}篮板、${b?.assists ?? 0}助攻。`,
    );
  }
  const groups = new Map<
    string,
    {
      season: number;
      stage: string;
      opponent: string;
      wins: number;
      losses: number;
      points: number;
      turnovers: number;
    }
  >();
  for (const m of games.filter((m) => stage(m) !== 'regular')) {
    const st = stage(m);
    const key = `${m.input.season}:${st}:${m.input.opponent.id}`;
    const g = groups.get(key) ?? {
      season: m.input.season,
      stage: st,
      opponent: m.input.opponent.name,
      wins: 0,
      losses: 0,
      points: 0,
      turnovers: 0,
    };
    if (m.won) g.wins++;
    else g.losses++;
    g.points += box(m)?.points ?? 0;
    g.turnovers += box(m)?.turnovers ?? 0;
    groups.set(key, g);
  }
  for (const [index, g] of [...groups.values()].slice(-16).entries())
    add(
      `round:${index}`,
      '季后赛征程',
      `第${g.season}季${roundNames[g.stage] ?? g.stage}对${g.opponent}，已完成${g.wins}胜${g.losses}负；本轮原创球员场均${(g.points / (g.wins + g.losses)).toFixed(1)}分、${(g.turnovers / (g.wins + g.losses)).toFixed(1)}失误。未完轮次不能推断晋级，不能混用整个季后赛场均。`,
    );
  for (const a of state.seasonArchives
    .filter((a) => season === 'all' || a.season === season)
    .slice(-12))
    add(
      `archive:${a.season}`,
      '已归档赛季',
      `第${a.season}季${teamName(a.teamId)}常规赛${a.wins}胜${a.losses}负，分区第${a.rank}，联盟冠军${teamName(a.championId)}。`,
    );
  const seasons = new Set(games.map((m) => m.input.season));
  const titles = [...seasons].filter((s) => state.milestones.includes(`s${s}:champion`));
  add(
    'titles',
    '所选范围冠军记录',
    titles.length
      ? `第${titles.join('、')}季夺冠。`
      : '所选范围没有已记录的冠军。不能自行编造其他奖项。',
  );
  const growth = state.growthLog.filter(
    (entry) => !/升级至重点比赛版本|存档迁移|数据版本/.test(entry),
  );
  if (growth.length && !archive)
    add('growth', '最近生涯成长记录（跨季）', growth.slice(-6).join('；').slice(0, 1400));
  return { version: 1, scope, facts };
}
