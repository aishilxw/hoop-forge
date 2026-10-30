<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BoxScore, GameAPI, MatchEvent, TacticalPlan } from '../contracts';
import { NBA_TEAMS } from '../data/teams';
import BaseButton from '../components/BaseButton.vue';
import AiCoach from '../components/AiCoach.vue';
import { buildCoachContext, canApplyCoach } from '../ai/coach-context';
import { TACTIC_OPTIONS } from '../config/tactics';
const props = defineProps<{ api: GameAPI }>();
const state = computed(() => props.api.state!);
const active = computed(() => state.value.activeMatch);
const finalMatch = computed(() =>
  state.value.matches.find((m) => m.matchId === state.value.currentMatchId),
);
const match = computed(
  () => active.value?.preview ?? (state.value.phase === 'result' ? finalMatch.value : null),
);
const nextEntry = computed(() => state.value.schedule[state.value.scheduleIndex]);
const matchId = computed(() => active.value?.matchId ?? match.value?.matchId ?? '');
const completed = computed(
  () => active.value?.completedQuarters ?? (state.value.phase === 'result' ? 4 : 0),
);
const finished = computed(() => state.value.phase === 'result');
const ownName = computed(
  () => NBA_TEAMS.find((t) => t.id === state.value.selectedTeamId)?.nameZh ?? '我的球队',
);
const opponentName = computed(
  () => match.value?.input.opponent.name ?? nextEntry.value?.opponent.name ?? '对手',
);
const events = computed(() => match.value?.events ?? []);
const cursor = ref(0);
const playing = ref(false);
const speed = ref(2);
const reduced = ref(
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);
const statsSide = ref<'own' | 'opponent'>('own');
const plan = ref<TacticalPlan>({
  offense: 'balanced',
  defense: 'balanced',
  pace: 'normal',
  rotation: 'balanced',
  originalMinutes: 32,
});
const savedPlan = active.value?.plans.at(-1);
if (savedPlan) plan.value = { ...savedPlan };
let timer: ReturnType<typeof setInterval> | undefined;
const atEnd = computed(() => cursor.value >= events.value.length);
const visible = computed(() => events.value.slice(0, cursor.value));
const current = computed(() => visible.value.at(-1));
const shownScore = computed(() => ({
  own: current.value?.homeScore ?? 0,
  opponent: current.value?.awayScore ?? 0,
}));
const periodLabel = (quarter: number) =>
  quarter <= 4 ? `第 ${quarter} 节` : `加时 ${quarter - 4}`;
const clock = computed(() => {
  const remaining = current.value?.secondsRemaining;
  if (remaining === undefined) return atEnd.value && completed.value ? '节间休息' : '12:00';
  return `${Math.floor(Math.max(0, remaining) / 60)}:${String(Math.floor(Math.max(0, remaining) % 60)).padStart(2, '0')}`;
});
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
function startTimer() {
  stopTimer();
  if (!playing.value || atEnd.value || reduced.value) return;
  timer = setInterval(
    () => {
      cursor.value = Math.min(cursor.value + 1, events.value.length);
      if (atEnd.value) playing.value = false;
    },
    Math.round(560 / speed.value),
  );
}
watch([playing, speed, reduced], () => {
  if (reduced.value) {
    cursor.value = events.value.length;
    playing.value = false;
  }
  startTimer();
});
watch(
  [matchId, () => events.value.length],
  ([id, length], old) => {
    if (!old || id !== old[0]) {
      cursor.value = length;
      playing.value = false;
    } else if (length > (old[1] ?? 0)) {
      cursor.value = old[1] ?? 0;
      playing.value = !reduced.value;
      if (reduced.value) cursor.value = length;
    } else cursor.value = Math.min(cursor.value, length);
    startTimer();
  },
  { immediate: true },
);
onBeforeUnmount(stopTimer);
function skip() {
  cursor.value = events.value.length;
  playing.value = false;
}
function replay() {
  cursor.value = events.value.findIndex((e) => e.quarter >= completed.value);
  if (cursor.value < 0) cursor.value = 0;
  playing.value = true;
}
async function playQuarter() {
  if (!atEnd.value) return;
  await props.api.execute({
    type: 'PLAY_FEATURED_QUARTER',
    plan: { ...plan.value, focusPlayerId: plan.value.focusPlayerId || undefined },
  });
}
const tactics = TACTIC_OPTIONS;
const coachContext = computed(() => buildCoachContext(state.value, props.api.catalog));
function adoptCoach(payload: { matchId: string; completedQuarters: number; plan: TacticalPlan }) {
  const context = coachContext.value;
  if (
    !context ||
    !atEnd.value ||
    props.api.busy ||
    props.api.readOnly ||
    !canApplyCoach(context, state.value) ||
    context.matchId !== payload.matchId ||
    context.completedQuarters !== payload.completedQuarters
  )
    return;
  plan.value = { ...payload.plan };
}
const explanations = computed(() => [
  plan.value.offense === 'attackPaint'
    ? '更多近筐进攻，考验身体对抗；禁区拥挤时需留意失误。'
    : plan.value.offense === 'perimeter'
      ? '提高三分出手倾向，空间更开阔，也会承受更大的命中波动。'
      : plan.value.offense === 'pickAndRoll'
        ? '通过组织与掩护创造机会，传球质量不足时可能增加失误。'
        : '在内外线间分配机会，不额外偏向某一种出手。',
  plan.value.defense === 'protectPaint'
    ? '协防向篮下集中，外线可能留下更多空位。'
    : plan.value.defense === 'pressurePerimeter'
      ? '压缩外线持球空间，内线保护与犯规控制会承受压力。'
      : '保持内外线平衡，避免为保护一侧过度让出另一侧。',
  plan.value.pace === 'fast'
    ? '增加回合与转换机会，同时加快体能消耗。'
    : plan.value.pace === 'slow'
      ? '减少回合，给主力更多恢复时间，也减少追分机会。'
      : '以正常节奏推进，根据比分再调整。',
  plan.value.rotation === 'starters'
    ? '优先使用主力，短期火力更强，但需要关注后半场体能。'
    : plan.value.rotation === 'bench'
      ? '增加替补轮换，让主力恢复，可能牺牲即时进攻效率。'
      : '让主力与替补分担负荷，按位置维持阵容结构。',
]);
const ownRoster = computed(() =>
  props.api.catalog.players.filter((p) => p.teamLabel === state.value.selectedTeamId),
);
const focusChoices = computed(() => [
  { id: 'original-player', name: state.value.player?.displayName ?? '我' },
  ...ownRoster.value.map((p) => ({ id: p.playerId, name: p.nameZh || p.nameEn })),
]);
const lookup = computed(
  () =>
    new Map([
      ...props.api.catalog.players.map((p) => [p.playerId, p.nameZh || p.nameEn] as const),
      ['original-player', state.value.player?.displayName ?? '我'],
    ]),
);
const actorName = (id: string) => lookup.value.get(id) ?? '场上球员';
const smallName = (id: string) => {
  const name = actorName(id).split('·').at(-1)!;
  return name.length > 7 ? name.slice(-7) : name;
};
const teamMarkers = computed(() => {
  const own = current.value?.ownLineup ??
    match.value?.homeBox.slice(0, 5).map((b) => b.playerId) ?? [
      'original-player',
      ...ownRoster.value.slice(0, 4).map((p) => p.playerId),
    ];
  const opponent =
    current.value?.opponentLineup ??
    match.value?.awayBox.slice(0, 5).map((b) => b.playerId) ??
    props.api.catalog.players
      .filter((p) => p.teamLabel === nextEntry.value?.opponent.id)
      .slice(0, 5)
      .map((p) => p.playerId);
  const spots = [
    [26, 50],
    [43, 19],
    [43, 81],
    [72, 32],
    [72, 68],
  ];
  return [
    ...own.map((id, i) => ({ id, side: 'own', x: spots[i % 5][0], y: spots[i % 5][1] })),
    ...opponent.map((id, i) => ({
      id,
      side: 'opponent',
      x: 100 - spots[i % 5][0],
      y: spots[i % 5][1] + (i ? 5 : 10),
    })),
  ].map((marker) =>
    marker.id === current.value?.actorId
      ? { ...marker, x: current.value.x ?? marker.x, y: current.value.y ?? marker.y }
      : marker,
  );
});
const ball = computed(() => ({ x: current.value?.x ?? 50, y: current.value?.y ?? 50 }));
const isShot = computed(() =>
  ['two', 'three', 'freeThrow', 'miss'].includes(current.value?.kind ?? ''),
);
const shotTarget = computed(() => (current.value?.side === 'opponent' ? 6 : 94));
const elapsed = (e: MatchEvent) =>
  e.quarter <= 4
    ? (e.quarter - 1) * 12 + (720 - (e.secondsRemaining ?? 0)) / 60
    : 48 + (e.quarter - 5) * 5 + (300 - (e.secondsRemaining ?? 0)) / 60;
const chart = computed(() => {
  const shown = visible.value;
  const maximum = Math.max(48, ...shown.map(elapsed));
  const maxScore = Math.max(20, ...shown.map((e) => Math.max(e.homeScore, e.awayScore)));
  const points = (side: 'homeScore' | 'awayScore') =>
    `0,112 ${shown.map((e) => `${Math.max(0, Math.min(600, (elapsed(e) / maximum) * 600)).toFixed(1)},${(112 - (e[side] / maxScore) * 100).toFixed(1)}`).join(' ')}`;
  return { own: points('homeScore'), opponent: points('awayScore') };
});
const revealedQuarters = computed(
  () => match.value?.quarters?.filter((q) => q.quarter < completed.value || atEnd.value) ?? [],
);
const statRows = computed<BoxScore[]>(() =>
  atEnd.value
    ? ((statsSide.value === 'own' ? match.value?.homeBox : match.value?.awayBox) ?? [])
    : [],
);
</script>
<template>
  <section class="page-title live-title">
    <div>
      <p class="eyebrow">COURTSIDE · 战术观战</p>
      <h1>这一节，<span>由你调整。</span></h1>
      <p class="muted">看清每一回合，抓住节间调整。你的下一次决定，可能改变比赛走势。</p>
    </div>
    <span class="pill pill--accent">{{
      finished ? '终场回放' : completed ? '节间决策' : '赛前布置'
    }}</span>
  </section>
  <section class="panel live-arena" :class="{ 'live-arena--reduced': reduced }">
    <header class="live-scoreboard">
      <div>
        <span class="small muted">{{ nextEntry?.isHome ? '主场' : '客场' }}</span>
        <h2>{{ ownName }}</h2>
      </div>
      <div class="live-score">
        <strong>{{ shownScore.own }}</strong
        ><span>:</span><strong>{{ shownScore.opponent }}</strong
        ><small>{{ current ? periodLabel(current.quarter) : '等待首节' }} · {{ clock }}</small>
      </div>
      <div>
        <span class="small muted">对手</span>
        <h2>{{ opponentName }}</h2>
      </div>
    </header>
    <div class="court-wrap">
      <svg
        class="live-court"
        viewBox="0 0 100 60"
        role="img"
        :aria-label="`篮球场示意，${ownName}${shownScore.own}比${shownScore.opponent}${opponentName}`"
      >
        <rect x="1" y="1" width="98" height="58" rx="2" class="court-floor" />
        <g class="court-lines">
          <path
            d="M50 1V59M1 18H20V42H1M99 18H80V42H99M1 8H6Q40 30 6 52H1M99 8H94Q60 30 94 52H99"
          />
          <circle cx="50" cy="30" r="8" />
          <circle cx="20" cy="30" r="6" />
          <circle cx="80" cy="30" r="6" />
          <path d="M4 26V34M96 26V34" />
        </g>
        <g class="court-hoops">
          <circle cx="6" cy="30" r="1.2" />
          <circle cx="94" cy="30" r="1.2" />
        </g>
        <path
          v-if="isShot && current"
          class="shot-trail"
          :d="`M${ball.x} ${ball.y * 0.6} Q${(ball.x + shotTarget) / 2} ${Math.max(5, ball.y * 0.6 - 12)} ${shotTarget} 30`"
        />
        <g
          v-for="marker in teamMarkers"
          :key="`${marker.side}-${marker.id}`"
          :class="[
            'court-player',
            `court-player--${marker.side}`,
            { 'court-player--active': marker.id === current?.actorId },
          ]"
          :transform="`translate(${marker.x},${Math.max(5, Math.min(55, marker.y * 0.6))})`"
        >
          <title>{{ actorName(marker.id) }}</title>
          <circle r="2.4" />
          <text text-anchor="middle" y=".8" class="court-number">
            {{ marker.id === 'original-player' ? '我' : marker.side === 'own' ? '●' : '○' }}
          </text>
          <text text-anchor="middle" y="6" class="court-name">{{ smallName(marker.id) }}</text>
        </g>
        <circle class="live-ball" :cx="ball.x" :cy="ball.y * 0.6" r="1.3" />
        <text x="50" y="57" text-anchor="middle" class="court-caption">
          橙色 · 我的球队　蓝色 · 对手
        </text>
      </svg>
    </div>
    <div class="live-event" aria-live="polite">
      <span class="pill">{{
        current?.kind === 'foul' ? '犯规' : current?.kind === 'freeThrow' ? '罚球' : '比赛时刻'
      }}</span>
      <p>{{ current?.text ?? '准备好战术，再开始第一节。' }}</p>
    </div>
    <div class="playback-controls">
      <BaseButton
        variant="secondary"
        :disabled="!events.length || atEnd || reduced"
        @click="playing = !playing"
        >{{ playing ? '暂停' : '播放' }}</BaseButton
      ><BaseButton
        variant="ghost"
        :disabled="atEnd"
        @click="cursor = Math.min(cursor + 1, events.length)"
        >下一回合</BaseButton
      ><label class="playback-speed"
        >回放速度<select v-model.number="speed" aria-label="回放速度">
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="4">4×</option>
        </select></label
      ><BaseButton variant="ghost" :disabled="atEnd" @click="skip">跳到节末</BaseButton
      ><BaseButton v-if="atEnd && events.length && !reduced" variant="ghost" @click="replay"
        >重看本节</BaseButton
      ><label class="motion-toggle"><input v-model="reduced" type="checkbox" />减少动画</label
      ><span class="small muted">{{ cursor }} / {{ events.length }} 个已发生回合</span>
    </div>
  </section>
  <div class="live-lower-grid">
    <section class="panel">
      <div class="section-heading">
        <h2>比分走势</h2>
        <span class="small muted">只展示已播放回合</span>
      </div>
      <svg class="score-chart" viewBox="0 0 600 125" role="img" aria-label="双方比分走势">
        <path d="M0 112H600M150 5V112M300 5V112M450 5V112" class="chart-grid" />
        <polyline :points="chart.own" class="chart-own" />
        <polyline :points="chart.opponent" class="chart-opponent" />
        <g class="chart-label">
          <text x="4" y="123">开场</text>
          <text x="145" y="123">首节</text>
          <text x="290" y="123">半场</text>
          <text x="440" y="123">三节</text>
          <text x="565" y="123">终场</text>
        </g>
      </svg>
      <div v-if="revealedQuarters.length" class="quarter-strip">
        <div v-for="q in revealedQuarters" :key="q.quarter">
          <span>{{ periodLabel(q.quarter) }}</span
          ><strong>{{ q.ownPoints }}–{{ q.opponentPoints }}</strong>
        </div>
      </div>
      <div class="live-log">
        <p v-for="(event, i) in visible.slice(-6).reverse()" :key="`${cursor}-${i}`">
          <span>{{ periodLabel(event.quarter) }}</span
          >{{ event.text }}
        </p>
      </div>
    </section>
    <section v-if="!finished" class="panel tactic-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">COACH'S BOARD</p>
          <h2>{{ completed ? `第 ${completed + 1} 节怎么打？` : '首节战术布置' }}</h2>
        </div>
        <span class="pill">{{ completed }} / 4 节已完成</span>
      </div>
      <p v-if="!atEnd" class="small muted">先看完当前节，或点击“跳到节末”，再决定下一节。</p>
      <AiCoach
        v-if="atEnd && coachContext"
        :context="coachContext"
        :disabled="!atEnd || api.busy || api.readOnly"
        @adopt="adoptCoach"
      />
      <div class="tactic-fields">
        <label class="field"
          >进攻方式<select v-model="plan.offense" :disabled="!atEnd || api.busy">
            <option v-for="o in tactics.offense" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
          </select></label
        ><label class="field"
          >防守重点<select v-model="plan.defense" :disabled="!atEnd || api.busy">
            <option v-for="o in tactics.defense" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
          </select></label
        ><label class="field"
          >比赛节奏<select v-model="plan.pace" :disabled="!atEnd || api.busy">
            <option v-for="o in tactics.pace" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
          </select></label
        ><label class="field"
          >轮换方式<select v-model="plan.rotation" :disabled="!atEnd || api.busy">
            <option v-for="o in tactics.rotation" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
          </select></label
        ><label class="field"
          >我的上场预算<select v-model.number="plan.originalMinutes" :disabled="!atEnd || api.busy">
            <option :value="26">26 分钟 · 留足体能</option>
            <option :value="32">32 分钟 · 均衡负荷</option>
            <option :value="38">38 分钟 · 承担更多</option>
          </select></label
        ><label class="field"
          >重点使用球员<select v-model="plan.focusPlayerId" :disabled="!atEnd || api.busy">
            <option :value="undefined">按阵容自动分配</option>
            <option v-for="p in focusChoices" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select></label
        >
      </div>
      <ul class="tactic-explanations">
        <li v-for="text in explanations" :key="text">{{ text }}</li>
      </ul>
      <p class="small muted">体能与犯规会影响实际轮换。战术的收益与风险，需要你来权衡。</p>
      <BaseButton
        variant="primary"
        class="full-width"
        :disabled="!atEnd || api.readOnly || api.busy || completed >= 4"
        :loading="api.busy"
        @click="playQuarter"
        >{{ completed ? `执行第 ${completed + 1} 节计划` : '开始第一节' }} →</BaseButton
      >
    </section>
    <section v-else class="panel live-finish">
      <p class="eyebrow">FINAL BUZZER</p>
      <h2>{{ atEnd ? (match?.won ? '拿下胜利' : '这一场，留下经验') : '终场结果等待揭晓' }}</h2>
      <p class="muted">
        {{
          atEnd
            ? `本场奖励 +${match?.reward ?? 0} 金币，已自动保存。`
            : '你可以看完关键回合，也可以跳到节末。'
        }}
      </p>
      <BaseButton
        variant="primary"
        :disabled="!atEnd || api.busy || api.readOnly"
        @click="api.execute({ type: 'ACK_MATCH_RESULT' })"
        >继续我的生涯 →</BaseButton
      >
    </section>
  </div>
  <section v-if="match" class="panel">
    <div class="section-heading">
      <h2>球场成绩单</h2>
      <div class="segmented-control">
        <button :class="{ active: statsSide === 'own' }" @click="statsSide = 'own'">
          {{ ownName }}</button
        ><button :class="{ active: statsSide === 'opponent' }" @click="statsSide = 'opponent'">
          {{ opponentName }}
        </button>
      </div>
    </div>
    <p v-if="!atEnd" class="muted">累计数据在当前节回放结束后揭晓，避免提前透露后续回合。</p>
    <div v-else class="table-scroll">
      <table class="stats-table">
        <thead>
          <tr>
            <th>球员</th>
            <th>分钟</th>
            <th>得分</th>
            <th>篮板</th>
            <th>助攻</th>
            <th>犯规</th>
            <th>投篮</th>
            <th>三分</th>
            <th>罚球</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in statRows" :key="b.playerId">
            <td>{{ b.name }}</td>
            <td>{{ Number(b.minutes.toFixed(1)) }}</td>
            <td>{{ b.points }}</td>
            <td>{{ b.rebounds }}</td>
            <td>{{ b.assists }}</td>
            <td>{{ b.fouls ?? 0 }}</td>
            <td>{{ b.fgm }}/{{ b.fga }}</td>
            <td>{{ b.threePM }}/{{ b.threePA }}</td>
            <td>{{ b.ftm ?? 0 }}/{{ b.fta ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
