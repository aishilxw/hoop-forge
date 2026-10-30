<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CareerState, Catalog } from '../contracts';
import { NBA_TEAMS } from '../data/teams';
const props = defineProps<{ state: CareerState; catalog: Catalog }>();
const conference = ref<'east' | 'west'>('east');
const teamName = (id: string) => NBA_TEAMS.find((t) => t.id === id)?.nameZh ?? id;
const standings = computed(
  () =>
    props.state.league?.standings
      .filter((s) => NBA_TEAMS.find((t) => t.id === s.teamId)?.conference === conference.value)
      .sort((a, b) => a.seed - b.seed) || [],
);
const upcoming = computed(() =>
  props.state.schedule.slice(props.state.scheduleIndex, props.state.scheduleIndex + 8),
);
const team = computed(() => NBA_TEAMS.find((t) => t.id === props.state.selectedTeamId));
const roster = computed(
  () =>
    team.value?.playerIds
      .map((id) => props.catalog.players.find((p) => p.playerId === id))
      .filter((p) => !!p) ?? [],
);
const labels = {
  regular: '常规赛',
  playIn: '附加赛',
  firstRound: '季后赛首轮',
  conferenceSemifinal: '分区半决赛',
  conferenceFinal: '分区决赛',
  final: 'NBA总决赛',
};
</script>
<template>
  <section class="panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">THE ASSOCIATION</p>
        <h2>联盟动态</h2>
      </div>
      <span class="pill">30队 · 每队82场</span>
    </div>
    <p class="small muted">东西部的每一个名次，都由比赛决定。排名随赛季进程更新。</p>
    <div class="standings-tabs">
      <button
        :class="['pill', { 'pill--accent': conference === 'east' }]"
        @click="conference = 'east'"
      >
        东部联盟</button
      ><button
        :class="['pill', { 'pill--accent': conference === 'west' }]"
        @click="conference = 'west'"
      >
        西部联盟
      </button>
    </div>
    <div class="table-scroll">
      <table class="stats-table">
        <thead>
          <tr>
            <th>种子</th>
            <th>球队</th>
            <th>胜</th>
            <th>负</th>
            <th>胜率</th>
            <th>晋级区间</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="standing in standings"
            :key="standing.teamId"
            :class="{ 'own-team-row': standing.teamId === state.selectedTeamId }"
          >
            <td>{{ standing.wins + standing.losses ? standing.seed : '—' }}</td>
            <td>
              {{ teamName(standing.teamId) }}
              {{ standing.teamId === state.selectedTeamId ? '· 我的球队' : '' }}
            </td>
            <td>{{ standing.wins }}</td>
            <td>{{ standing.losses }}</td>
            <td>
              {{
                standing.wins + standing.losses
                  ? ((100 * standing.wins) / (standing.wins + standing.losses)).toFixed(1) + '%'
                  : '—'
              }}
            </td>
            <td>
              {{
                !standing.wins && !standing.losses
                  ? '尚未开赛'
                  : standing.seed <= 6
                    ? '直接晋级'
                    : standing.seed <= 10
                      ? '附加赛区'
                      : '分区后段'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="panel">
    <div class="section-heading">
      <h2>接下来与你有关的比赛</h2>
      <span class="small muted">主客场与阶段</span>
    </div>
    <div class="match-history">
      <div v-for="game in upcoming" :key="game.matchId">
        <span class="pill">{{ game.isHome ? '主场' : '客场' }}</span
        ><span>{{ game.opponent.name }}</span
        ><span class="muted">{{ labels[game.stage] }}</span>
      </div>
    </div>
    <p v-if="!upcoming.length" class="muted">当前阶段的赛程已结束，等待晋级或赛季结算。</p>
  </section>
  <section v-if="state.league?.series.length" class="panel">
    <div class="section-heading">
      <h2>季后赛对阵</h2>
      <span class="small muted">固定对阵 · 七局四胜</span>
    </div>
    <div class="report-best-grid">
      <article v-for="series in state.league.series" :key="series.id" class="report-game">
        <span class="pill">{{ labels[series.round] }}</span>
        <h4>{{ teamName(series.homeTeamId) }} — {{ teamName(series.awayTeamId) }}</h4>
        <strong>{{ series.homeWins }} : {{ series.awayWins }}</strong>
        <p class="muted">
          {{
            series.winnerId
              ? teamName(series.winnerId) + (series.round === 'final' ? '夺得总冠军' : '晋级下一轮')
              : '系列赛进行中'
          }}
        </p>
      </article>
    </div>
  </section>
  <section class="panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">MY LOCKER ROOM</p>
        <h2>{{ team?.nameZh }}的更衣室</h2>
      </div>
      <span class="pill">{{ roster.length }}名队友 + 你</span>
    </div>
    <p class="muted">{{ state.player?.displayName }}，穿上这支球队的球衣，和队友一起追逐冠军。</p>
    <div class="team-roster-chips">
      <span v-for="mate in roster" :key="mate!.playerId">{{ mate!.nameZh || mate!.nameEn }}</span>
    </div>
  </section>
</template>
