<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MatchResult } from '../contracts';
import BaseButton from '../components/BaseButton.vue';
import { NBA_TEAMS } from '../data/teams';
const props = defineProps<{ match: MatchResult; busy: boolean; readOnly: boolean }>();
defineEmits<{ continue: [] }>();
const showAll = ref(false);
const showOpponent = ref(false);
const ownTeamName = computed(
  () => NBA_TEAMS.find((t) => t.id === props.match.input.ownTeamId)?.nameZh ?? '我的球队',
);
const boxRows = computed(() => (showOpponent.value ? props.match.awayBox : props.match.homeBox));
const events = computed(() => (showAll.value ? props.match.events : props.match.events.slice(-8)));
</script>
<template>
  <section class="panel result-hero">
    <p class="eyebrow">FINAL BUZZER · 比赛结束</p>
    <span :class="['result-label', match.won ? 'win' : 'loss']">{{
      match.won ? '拿下胜利' : '下一场，再来'
    }}</span>
    <div class="scoreboard">
      <div>
        <span>{{ ownTeamName }} · {{ match.input.isHome ? '主场' : '客场' }}</span
        ><strong>{{ match.homeScore }}</strong>
      </div>
      <span class="scoreboard__separator">:</span>
      <div>
        <span>{{ match.input.opponent.name }}</span
        ><strong>{{ match.awayScore }}</strong>
      </div>
    </div>
    <p v-if="match.overtimes" class="muted">{{ match.overtimes }} 次加时</p>
    <div class="result-reward">
      本场获得 <strong>+ {{ match.reward }}</strong> 金币
      <span class="small muted">已自动入账</span>
    </div>
    <BaseButton variant="primary" :loading="busy" :disabled="readOnly" @click="$emit('continue')"
      >继续生涯 →</BaseButton
    >
  </section>
  <section class="panel">
    <div class="section-heading">
      <h2>球场成绩单</h2>
      <span class="muted small">来自实际回合事件</span>
    </div>
    <div class="standings-tabs">
      <button :class="['pill', { 'pill--accent': !showOpponent }]" @click="showOpponent = false">
        {{ ownTeamName }}</button
      ><button :class="['pill', { 'pill--accent': showOpponent }]" @click="showOpponent = true">
        {{ match.input.opponent.name }}
      </button>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>球员</th>
            <th>分钟</th>
            <th>得分</th>
            <th>篮板</th>
            <th>助攻</th>
            <th>抢断</th>
            <th>盖帽</th>
            <th>失误</th>
            <th>投篮</th>
            <th>三分</th>
            <th>罚球</th>
            <th>犯规</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in boxRows"
            :key="row.playerId"
            :class="{
              'highlight-row': !showOpponent && row.name === match.input.player.displayName,
            }"
          >
            <td>{{ row.name }}</td>
            <td>{{ Number(row.minutes.toFixed(1)) }}</td>
            <td>{{ row.points }}</td>
            <td>{{ row.rebounds }}</td>
            <td>{{ row.assists }}</td>
            <td>{{ row.steals }}</td>
            <td>{{ row.blocks }}</td>
            <td>{{ row.turnovers }}</td>
            <td>{{ row.fgm }}/{{ row.fga }}</td>
            <td>{{ row.threePM }}/{{ row.threePA }}</td>
            <td>{{ row.ftm ?? 0 }}/{{ row.fta ?? 0 }}</td>
            <td>{{ row.fouls ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="panel">
    <div class="section-heading">
      <h2>比赛时刻</h2>
      <BaseButton variant="ghost" @click="showAll = !showAll">{{
        showAll ? '收起' : '展开全部'
      }}</BaseButton>
    </div>
    <ol class="event-feed">
      <li v-for="(event, i) in events" :key="i">
        <span class="event-quarter">{{ event.quarter > 4 ? '加时' : `第${event.quarter}节` }}</span
        ><span>{{ event.text }}</span
        ><b>{{ event.homeScore }}–{{ event.awayScore }}</b>
      </li>
    </ol>
  </section>
</template>
