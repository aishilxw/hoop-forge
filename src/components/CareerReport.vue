<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  STYLE_LABELS,
  type CareerState,
  type Catalog,
  type MatchResult,
} from '../contracts';
import { NBA_TEAMS } from '../data/teams';
import AiCareerReport from './AiCareerReport.vue';
const props = defineProps<{ state: CareerState; catalog: Catalog }>();
const selectedSeason = ref<number | 'all'>('all');
const teamName = (id: string | null | undefined) =>
  NBA_TEAMS.find((t) => t.id === id)?.nameZh ?? '未确认球队';
const games = computed(() =>
  props.state.matches.filter(
    (m) => selectedSeason.value === 'all' || m.input.season === selectedSeason.value,
  ),
);
const stage = (m: MatchResult) =>
  ('stage' in m.input ? m.input.stage : undefined) ??
  props.state.schedule.find((s) => s.matchId === m.matchId)?.stage ??
  props.state.league?.games.find((g) => g.id === m.matchId)?.stage ??
  'regular';
const regular = computed(() => games.value.filter((m) => stage(m) === 'regular'));
const playIn = computed(() => games.value.filter((m) => stage(m) === 'playIn'));
const playoffs = computed(() =>
  games.value.filter((m) => !['regular', 'playIn'].includes(stage(m))),
);
const row = (m: MatchResult) =>
  m.homeBox.find((b) => b.name === props.state.player?.displayName) ?? m.homeBox[0];
function aggregate(list: MatchResult[]) {
  const n = list.length;
  const total = list.reduce(
    (s, m) => {
      const b = row(m);
      if (b) for (const key of Object.keys(s) as (keyof typeof s)[]) s[key] += b[key] ?? 0;
      return s;
    },
    {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fgm: 0,
      fga: 0,
      threePM: 0,
      threePA: 0,
      minutes: 0,
      ftm: 0,
      fta: 0,
      fouls: 0,
    },
  );
  return {
    n,
    wins: list.filter((m) => m.won).length,
    avg: (key: keyof typeof total) => (n ? (total[key] / n).toFixed(1) : '—'),
    fg: total.fga ? `${((100 * total.fgm) / total.fga).toFixed(1)}%` : '—',
    three: total.threePA ? `${((100 * total.threePM) / total.threePA).toFixed(1)}%` : '—',
    efg: total.fga ? `${((100 * (total.fgm + 0.5 * total.threePM)) / total.fga).toFixed(1)}%` : '—',
    freeThrow: total.fta ? `${((100 * total.ftm) / total.fta).toFixed(1)}%` : '—',
    ratio: total.turnovers
      ? (total.assists / total.turnovers).toFixed(2)
      : total.assists
        ? '无失误'
        : '—',
  };
}
const splits = computed(() => [
  { label: '常规赛', ...aggregate(regular.value) },
  { label: '附加赛', ...aggregate(playIn.value) },
  { label: '季后赛', ...aggregate(playoffs.value) },
]);
const all = computed(() => aggregate(games.value));
const best = computed(() =>
  [...games.value]
    .sort((a, b) => {
      const score = (m: MatchResult) => {
        const b = row(m);
        return b
          ? b.points +
              b.rebounds * 1.2 +
              b.assists * 1.5 +
              b.steals * 2 +
              b.blocks * 2 -
              b.turnovers * 2
          : 0;
      };
      return score(b) - score(a);
    })
    .slice(0, 3),
);
const seasons = computed(() =>
  [...new Set(props.state.matches.map((m) => m.input.season))].sort((a, b) => a - b),
);
const peaks = computed(() =>
  [
    ['单场得分', 'points'],
    ['单场篮板', 'rebounds'],
    ['单场助攻', 'assists'],
    ['单场盖帽', 'blocks'],
  ].map(([label, key]) => ({
    label,
    value: games.value.length
      ? Math.max(...games.value.map((m) => row(m)?.[key as 'points'] ?? 0))
      : '—',
  })),
);
const player = computed(() => props.state.player);
const ranked = computed(() =>
  player.value
    ? [...ATTRIBUTE_KEYS].sort((a, b) => player.value!.attributes[b] - player.value!.attributes[a])
    : [],
);
const notes = computed(() => {
  if (!player.value || !games.value.length)
    return ['完成首场比赛后，这里会根据真实比赛记录生成分析。'];
  const s = aggregate(games.value);
  const n = [
    `${player.value.displayName}以${STYLE_LABELS[player.value.playStyle]}的方式进入${teamName(props.state.selectedTeamId)}。在当前选定范围内出场${s.n}次，球队取得${s.wins}胜${s.n - s.wins}负。`,
    `场均${s.avg('points')}分、${s.avg('rebounds')}篮板、${s.avg('assists')}助攻；投篮命中率${s.fg}，三分命中率${s.three}。`,
  ];
  if (ranked.value.length)
    n.push(
      `${ATTRIBUTE_LABELS[ranked.value[0]]}是当前最突出的能力，${ATTRIBUTE_LABELS[ranked.value.at(-1)!]}是相对短板。球队定位之外，也应结合队友分工决定下一次改造。`,
    );
  if (Number(s.avg('turnovers')) > 3)
    n.push('持球失误偏多，下一阶段可以优先观察运球与组织，或尝试降低持球负担。');
  else n.push('当前失误控制相对稳定，可以结合投篮效率与对手类型，比较不同打法的收益。');
  if (s.three !== '—' && parseFloat(s.three) < 30)
    n.push('三分效率偏低：先检查外线能力与出手定位，再决定继续投射还是转向内线/组织。');
  return n;
});
const roundLabels: Record<string, string> = {
  playIn: '附加赛',
  firstRound: '季后赛首轮',
  conferenceSemifinal: '分区半决赛',
  conferenceFinal: '分区决赛',
  final: 'NBA总决赛',
};
const journey = computed(() => {
  const groups = new Map<
    string,
    { season: number; stage: string; opponent: string; wins: number; losses: number }
  >();
  for (const game of games.value.filter((m) => stage(m) !== 'regular')) {
    const key = `${game.input.season}:${stage(game)}:${game.input.opponent.id}`;
    if (!groups.has(key))
      groups.set(key, {
        season: game.input.season,
        stage: stage(game),
        opponent: game.input.opponent.id,
        wins: 0,
        losses: 0,
      });
    const entry = groups.get(key)!;
    if (game.won) entry.wins++;
    else entry.losses++;
  }
  return [...groups.values()];
});
const nameFor = (id: string) => {
  const p = props.catalog.players.find((p) => p.playerId === id);
  return p?.nameZh || p?.nameEn || '能力来源';
};
const growthEntries = computed(() =>
  props.state.growthLog
    .filter((entry) => !/^升级至重点比赛版本|^存档迁移|^数据版本/.test(entry))
    .map((entry) => entry.replace('（游戏成长模型）', '')),
);
</script>
<template>
  <section class="panel career-report">
    <div class="section-heading">
      <div>
        <p class="eyebrow">CAREER JOURNAL · 我的生涯报告</p>
        <h2>我的职业生涯报告</h2>
      </div>
      <label class="field report-filter"
        >阅读范围<select v-model="selectedSeason">
          <option value="all">完整生涯</option>
          <option v-for="season in seasons" :key="season" :value="season">
            第 {{ season }} 赛季
          </option>
        </select></label
      >
    </div>
    <p v-if="player" class="muted">
      {{ player.age ?? 19 }}岁 · 身体状态{{ Math.round(player.condition ?? 100) }}% ·
      {{ state.phase === 'finished' ? '职业生涯已封存' : `职业生涯第${state.season}年` }}
    </p>
    <AiCareerReport :state="state" :season="selectedSeason" />
    <p class="report-source">生涯统计分析 · 根据比赛与成长记录计算。</p>
    <div class="report-prose">
      <p v-for="note in notes" :key="note">{{ note }}</p>
    </div>
    <div class="metric-grid">
      <article v-for="peak in peaks" :key="peak.label" class="metric">
        <span>{{ peak.label }}</span
        ><strong>{{ peak.value }}</strong>
      </article>
    </div>
    <h3>常规赛、附加赛与季后赛，分别看表现</h3>
    <div class="table-scroll">
      <table class="stats-table">
        <thead>
          <tr>
            <th>阶段</th>
            <th>场次</th>
            <th>分钟</th>
            <th>得分</th>
            <th>篮板</th>
            <th>助攻</th>
            <th>抢断</th>
            <th>盖帽</th>
            <th>失误</th>
            <th>投篮</th>
            <th>三分</th>
            <th>有效命中率</th>
            <th>罚球</th>
            <th>场均犯规</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="split in splits" :key="split.label">
            <td>{{ split.label }}</td>
            <td>{{ split.n }}</td>
            <td>{{ split.avg('minutes') }}</td>
            <td>{{ split.avg('points') }}</td>
            <td>{{ split.avg('rebounds') }}</td>
            <td>{{ split.avg('assists') }}</td>
            <td>{{ split.avg('steals') }}</td>
            <td>{{ split.avg('blocks') }}</td>
            <td>{{ split.avg('turnovers') }}</td>
            <td>{{ split.fg }}</td>
            <td>{{ split.three }}</td>
            <td>{{ split.efg }}</td>
            <td>{{ split.freeThrow }}</td>
            <td>{{ split.avg('fouls') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h3>值得记住的比赛</h3>
    <div v-if="best.length" class="report-best-grid">
      <article v-for="m in best" :key="m.matchId" class="report-game">
        <span class="pill">第{{ m.input.season }}季 · {{ m.won ? '胜利' : '失利' }}</span>
        <h4>对阵 {{ m.input.opponent.name }}</h4>
        <strong
          >{{ row(m)?.points }}分 · {{ row(m)?.rebounds }}篮板 · {{ row(m)?.assists }}助攻</strong
        >
        <p class="muted">
          {{ m.homeScore }} : {{ m.awayScore }} · 投篮 {{ row(m)?.fgm }}/{{ row(m)?.fga }}
        </p>
      </article>
    </div>
    <p v-else class="muted">故事还未开始，先完成你的首秀。</p>
    <h3>逐季足迹</h3>
    <div class="table-scroll">
      <table class="stats-table">
        <thead>
          <tr>
            <th>赛季</th>
            <th>球队</th>
            <th>常规赛</th>
            <th>分区名次</th>
            <th>总冠军</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="archive in state.seasonArchives" :key="archive.season">
            <td>第{{ archive.season }}季</td>
            <td>{{ teamName(archive.teamId) }}</td>
            <td>{{ archive.wins }}胜{{ archive.losses }}负</td>
            <td>{{ archive.rank || '—' }}</td>
            <td>{{ teamName(archive.championId) }}</td>
          </tr>
          <tr v-if="!state.seasonArchives.length">
            <td colspan="5">每个赛季结束，你的战绩都会收入这里。</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h3>你的季后赛征程</h3>
    <div v-if="journey.length" class="table-scroll">
      <table class="stats-table">
        <thead>
          <tr>
            <th>赛季</th>
            <th>阶段</th>
            <th>对手</th>
            <th>本方胜负</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in journey" :key="`${r.season}-${r.stage}-${r.opponent}`">
            <td>第{{ r.season }}季</td>
            <td>{{ roundLabels[r.stage] }}</td>
            <td>{{ teamName(r.opponent) }}</td>
            <td>{{ r.wins }}–{{ r.losses }}</td>
            <td>
              {{
                r.stage === 'playIn'
                  ? '附加赛记录'
                  : r.wins === 4
                    ? r.stage === 'final'
                      ? '总冠军'
                      : '晋级下一轮'
                    : r.losses === 4
                      ? '系列赛止步'
                      : '系列赛进行中'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">争取一张季后赛门票，把你的名字留在这条征程里。</p>
    <h3>你从谁身上继承了天赋</h3>
    <div v-if="player" class="report-lineage">
      <article v-for="key in ATTRIBUTE_KEYS" :key="key">
        <span>{{ ATTRIBUTE_LABELS[key] }}</span
        ><strong>{{ player.attributes[key] }}</strong>
        <p>
          初始：{{ nameFor(player.lineage[key].initialPlayerId) }}<br />当前来源：{{
            nameFor(player.lineage[key].inheritedFromPlayerId)
          }}<br />最近继承后训练：+{{ player.lineage[key].trainedPoints }}
        </p>
      </article>
    </div>
    <h3>成长与关键里程碑</h3>
    <ol v-if="growthEntries.length" class="growth-log">
      <li v-for="(entry, i) in growthEntries" :key="i">{{ entry }}</li>
    </ol>
    <p v-else class="muted">下一次能力继承或训练，会在这里留下你的成长足迹。</p>
    <p class="muted">
      生涯累计 {{ all.n }} 场（当前阅读范围），{{ state.championships }} 座冠军。{{
        state.phase === 'finished' ? '这段故事，已收入你的篮球档案。' : '下一段故事，由你继续。'
      }}
    </p>
  </section>
</template>
