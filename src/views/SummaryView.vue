<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameAPI } from '../contracts';
import BaseButton from '../components/BaseButton.vue';
import CareerReport from '../components/CareerReport.vue';
import BaseDialog from '../components/BaseDialog.vue';
const props = defineProps<{ api: GameAPI }>();
defineEmits<{ newCareer: [] }>();
const retireConfirmation = ref(false);
const state = computed(() => props.api.state!);
const outcome = computed(
  () =>
    state.value.seasonArchives.find((a) => a.season === state.value.season)?.summary?.outcome ??
    '赛季回顾',
);
const ended = computed(() => state.value.phase === 'finished');
async function nextSeason() {
  if (state.value.phase === 'seasonSummary') await props.api.execute({ type: 'ACK_MATCH_RESULT' });
  else if (props.api.state?.phase === 'offseason')
    await props.api.execute({ type: 'START_NEXT_SEASON' });
}
</script>
<template>
  <section class="panel summary-hero">
    <p class="eyebrow">
      {{
        ended
          ? 'CAREER ARCHIVE · 生涯封存'
          : state.phase === 'offseason'
            ? 'OFFSEASON · 休赛期'
            : 'SEASON REVIEW · 赛季回顾'
      }}
    </p>
    <span class="trophy" aria-hidden="true">♜</span>
    <h1>
      {{
        ended
          ? `${state.player?.displayName}的完整职业生涯`
          : `${state.player?.displayName}的第${state.season}个赛季`
      }}
    </h1>
    <h2>{{ outcome }}</h2>
    <p class="muted">
      常规赛 {{ state.regularWins }} 胜 · 生涯冠军
      {{ state.championships }} 座。每一场比赛，都是这段生涯的注脚。
    </p>
    <div class="summary-actions">
      <BaseButton
        v-if="!ended"
        variant="primary"
        :loading="api.busy"
        :disabled="api.readOnly"
        @click="nextSeason"
        >{{
          state.phase === 'seasonSummary' ? '进入休赛期，规划下一年' : '开始下一赛季'
        }}
        →</BaseButton
      ><BaseButton v-else variant="primary" @click="$emit('newCareer')"
        >开启另一段篮球人生</BaseButton
      >
      <BaseButton
        v-if="!ended && state.phase === 'offseason'"
        variant="ghost"
        :disabled="api.readOnly || api.busy"
        @click="retireConfirmation = true"
        >选择退役，封存生涯</BaseButton
      >
    </div>
  </section>
  <BaseDialog
    v-if="retireConfirmation"
    title="把这段生涯留在档案里？"
    @close="retireConfirmation = false"
    ><p>
      退役后不能继续当前生涯的比赛与成长。完整报告、历年成绩和冠军记录都会保留，你仍可阅读和备份。
    </p>
    <div class="dialog-actions">
      <BaseButton @click="retireConfirmation = false">继续征战</BaseButton
      ><BaseButton
        variant="danger"
        :disabled="api.busy"
        @click="
          retireConfirmation = false;
          api.execute({ type: 'RETIRE_PLAYER' });
        "
        >确认退役</BaseButton
      >
    </div></BaseDialog
  >
  <CareerReport :state="state" :catalog="api.catalog" />
</template>
