<script setup lang="ts">
import { computed } from 'vue';
import { STYLE_LABELS, type GameAPI, type PlayStyle } from '../contracts';
import { NBA_TEAMS } from '../data/teams';
import BaseButton from '../components/BaseButton.vue';
import RadarChart from '../components/RadarChart.vue';
import AttributeGrid from '../components/AttributeGrid.vue';
import LeaguePanel from '../components/LeaguePanel.vue';
import { isFeaturedMatch } from '../domain/featured';
const props = defineProps<{ api: GameAPI; canEdit: boolean }>();
const emit = defineEmits<{ workshop: []; report: [] }>();
const state = computed(() => props.api.state!);
const featured = computed(() => isFeaturedMatch(state.value));
const player = computed(() => state.value.player!);
const next = computed(() => state.value.schedule[state.value.scheduleIndex]);
const team = computed(() => NBA_TEAMS.find((t) => t.id === state.value.selectedTeamId));
const seasonMatches = computed(() =>
  state.value.matches.filter((m) => m.input.season === state.value.season),
);
const regular = computed(() =>
  seasonMatches.value.filter(
    (m) =>
      state.value.league?.games.find((g) => g.id === m.matchId)?.stage === 'regular' ||
      state.value.schedule.find((g) => g.matchId === m.matchId)?.stage === 'regular',
  ),
);
const record = computed(() =>
  state.value.league?.standings.find((s) => s.teamId === state.value.selectedTeamId),
);
const total = computed(() =>
  Math.round(Object.values(player.value.attributes).reduce((a, b) => a + b, 0) / 9),
);
const labels = {
  regular: '常规赛',
  playIn: '附加赛',
  firstRound: '季后赛首轮 · 七局四胜',
  conferenceSemifinal: '分区半决赛 · 七局四胜',
  conferenceFinal: '分区决赛 · 七局四胜',
  final: 'NBA总决赛 · 七局四胜',
};
async function setStyle(event: Event) {
  await props.api.execute({
    type: 'SET_PLAY_STYLE',
    style: (event.target as HTMLSelectElement).value as PlayStyle,
  });
}
</script>
<template>
  <section class="page-title">
    <div>
      <p class="eyebrow">SEASON {{ state.season }} · {{ team?.nameZh }}</p>
      <h1>下一场，<span>证明自己</span></h1>
      <p class="muted">从你的NBA首秀，到下一次总冠军。</p>
    </div>
    <span class="pill pill--accent"
      >{{ team?.conference === 'east' ? '东部' : '西部' }} ·
      {{ labels[next?.stage ?? 'regular'] }}</span
    >
  </section>
  <div class="dashboard-grid">
    <section class="panel player-profile">
      <div class="section-heading">
        <div>
          <p class="eyebrow">YOUR ORIGINAL PLAYER</p>
          <h2>{{ player.displayName }}</h2>
          <p class="small muted">
            {{ player.age ?? 19 }}岁 · 第{{ state.season }}年 · 身体状态
            {{ Math.round(player.condition ?? 100) }}%
          </p>
        </div>
        <div class="overall">
          <strong>{{ total }}</strong
          ><span>综合能力</span>
        </div>
      </div>
      <RadarChart :attributes="player.attributes" /><label class="field"
        >当前打法<select
          :value="player.playStyle"
          :disabled="!canEdit || api.readOnly || api.busy"
          @change="setStyle"
        >
          <option v-for="(label, key) in STYLE_LABELS" :key="key" :value="key">{{ label }}</option>
        </select></label
      ><BaseButton class="full-width" @click="emit('workshop')">进入能力工坊 ↗</BaseButton
      ><BaseButton class="full-width report-entry" @click="emit('report')"
        >阅读我的生涯报告 ↗</BaseButton
      >
    </section>
    <div class="dashboard-main">
      <div class="metric-grid">
        <article class="metric">
          <span>常规赛战绩</span
          ><strong
            >{{ record?.wins ?? state.regularWins }}<small>胜</small
            >{{ record?.losses ?? regular.length - state.regularWins }}<small>负</small></strong
          >
        </article>
        <article class="metric">
          <span>分区排名</span
          ><strong
            >{{ record && record.wins + record.losses ? record.seed : '待首秀'
            }}<small v-if="record && record.wins + record.losses">/ 15</small></strong
          >
        </article>
        <article class="metric">
          <span>冠军奖杯</span><strong>{{ state.championships }}<small>座</small></strong>
        </article>
      </div>
      <section class="panel next-match">
        <div class="section-heading">
          <p class="eyebrow">NEXT MATCHUP</p>
          <span class="pill">{{ next?.isHome ? '主场迎战' : '客场挑战' }}</span>
        </div>
        <h2>{{ next?.opponent.name ?? '等待下一阶段' }}</h2>
        <p class="muted">
          {{ next ? labels[next.stage] : '联盟正在推进赛程'
          }}<span v-if="next && next.stage !== 'regular' && next.stage !== 'playIn'">
            · 系列赛{{ state.seriesWins }}–{{ state.seriesLosses }}</span
          >
        </p>
        <p class="small muted">
          常规赛{{ regular.length }} / 82场。前六直接晋级，7–10名进入附加赛。
        </p>
        <span v-if="featured" class="pill pill--accent featured-match-badge"
          >赛季重点场 · 战术观战</span
        >
        <div class="match-start-actions">
          <BaseButton
            :variant="featured ? 'primary' : 'secondary'"
            :disabled="!canEdit || api.readOnly || !next || api.busy"
            :loading="api.busy"
            @click="api.execute({ type: 'START_FEATURED_MATCH' })"
            >{{ featured ? '进入重点比赛' : '战术观战' }} →</BaseButton
          >
          <BaseButton
            :variant="featured ? 'ghost' : 'primary'"
            :disabled="!canEdit || api.readOnly || !next || api.busy"
            :loading="api.busy"
            @click="api.execute({ type: 'PLAY_NEXT_MATCH' })"
            >快速模拟本场</BaseButton
          >
        </div>
        <p class="muted small">
          每季8场自动重点场；每场都可主动观战。节间选战术、调整轮换，或直接快速模拟。
        </p>
      </section>
      <section class="panel">
        <div class="section-heading">
          <h2>最近比赛</h2>
          <span class="small muted">本赛季</span>
        </div>
        <div v-if="seasonMatches.length" class="match-history">
          <div v-for="match in [...seasonMatches].reverse().slice(0, 5)" :key="match.matchId">
            <span :class="['match-tag', match.won ? 'win' : 'loss']">{{
              match.won ? 'W' : 'L'
            }}</span
            ><span>{{ match.input.opponent.name }}</span
            ><b>{{ match.homeScore }} : {{ match.awayScore }}</b
            ><span class="small muted">+{{ match.reward }}金币</span>
          </div>
        </div>
        <p v-else class="muted">本赛季首战即将开始。</p>
      </section>
    </div>
  </div>
  <section class="panel">
    <div class="section-heading">
      <h2>九维能力已揭晓</h2>
      <span class="small muted">你的判断，形成了这样的球员。</span>
    </div>
    <AttributeGrid :attributes="player.attributes" />
  </section>
  <LeaguePanel :state="state" :catalog="api.catalog" />
</template>
