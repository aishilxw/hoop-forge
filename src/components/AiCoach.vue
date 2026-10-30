<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { TacticalPlan } from '../contracts';
import type { CoachContext, CoachRecord } from '../ai/coach-context';
import { aiStatus, AI_ERRORS, cachedCoach, coachKey, generateCoach, saveCoach } from '../ai/client';
import { tacticalLabel } from '../config/tactics';
import BaseButton from './BaseButton.vue';
import AiUsage from './AiUsage.vue';
const props = defineProps<{ context: CoachContext; disabled: boolean }>();
const emit = defineEmits<{
  adopt: [payload: { matchId: string; completedQuarters: number; plan: TacticalPlan }];
}>();
const record = ref<CoachRecord | null>(null),
  loading = ref(false),
  checking = ref(true),
  configured = ref(false),
  serviceReady = ref(false),
  error = ref(''),
  cacheNote = ref(''),
  applied = ref(false);
let turn = 0,
  mounted = true;
onBeforeUnmount(() => {
  mounted = false;
  turn++;
});
const serialized = computed(() => JSON.stringify(props.context));
watch(
  serialized,
  async () => {
    const request = ++turn;
    record.value = null;
    error.value = '';
    cacheNote.value = '';
    checking.value = true;
    applied.value = false;
    try {
      const [status, cached] = await Promise.all([
        aiStatus().catch(() => null),
        coachKey(props.context)
          .then(cachedCoach)
          .catch(() => null),
      ]);
      if (!mounted || request !== turn) return;
      serviceReady.value = Boolean(status);
      configured.value = status?.configured ?? false;
      if (cached && cached.model === (status?.model ?? 'deepseek-flash')) {
        record.value = cached;
        cacheNote.value = '本节建议已保存，可直接采用。';
      }
    } finally {
      if (mounted && request === turn) checking.value = false;
    }
  },
  { immediate: true },
);
async function ask() {
  if (loading.value || props.disabled) return;
  const request = turn,
    input = props.context;
  loading.value = true;
  error.value = '';
  cacheNote.value = '';
  try {
    const key = await coachKey(input),
      result = await generateCoach(input);
    let saved = true;
    try {
      await saveCoach(key, result);
    } catch {
      saved = false;
    }
    if (!mounted || request !== turn) return;
    record.value = result;
    cacheNote.value = result.servedFromCache
      ? '本节建议已就绪，无需重新生成。'
      : saved
        ? '已记下本节计划，随时回来参考。'
        : '建议已生成，但未能保存。请在本页查看与采用。';
  } catch (cause) {
    if (!mounted || request !== turn) return;
    const code = cause instanceof Error ? cause.message : '';
    error.value =
      AI_ERRORS[code] ??
      (cause instanceof Error && cause.name === 'TimeoutError'
        ? AI_ERRORS.TIMEOUT
        : AI_ERRORS.UPSTREAM_ERROR);
  } finally {
    if (mounted) loading.value = false;
  }
}
function adopt() {
  if (
    props.disabled ||
    !record.value ||
    record.value.context.matchId !== props.context.matchId ||
    record.value.context.completedQuarters !== props.context.completedQuarters
  )
    return;
  emit('adopt', {
    matchId: props.context.matchId,
    completedQuarters: props.context.completedQuarters,
    plan: { ...record.value.advice.plan },
  });
  applied.value = true;
}
const focusName = computed(
  () =>
    props.context.focusCandidates.find((c) => c.id === record.value?.advice.plan.focusPlayerId)
      ?.name ?? '按阵容自动分配',
);
const fact = (id: string) => record.value?.context.facts.find((f) => f.id === id);
</script>
<template>
  <section class="ai-coach" aria-labelledby="ai-coach-title">
    <p class="eyebrow">DEEPSEEK · 场边助理教练</p>
    <h3 id="ai-coach-title">第 {{ context.completedQuarters + 1 }} 节，听听另一种判断。</h3>
    <p class="small muted">
      根据本场局势与阵容，给你一份下一节计划。点击询问会将对应的比赛摘要发送给
      DeepSeek，是否采用由你决定。
    </p>
    <template v-if="!record">
      <p v-if="!checking && !configured" class="ai-status">
        {{ serviceReady ? AI_ERRORS.KEY_MISSING : AI_ERRORS.UNAVAILABLE }} 你仍可自行布置战术。
      </p>
      <BaseButton :disabled="disabled || checking || !configured" :loading="loading" @click="ask">{{
        loading ? '教练正在分析…' : '询问 AI 教练 →'
      }}</BaseButton>
    </template>
    <p v-if="error" class="ai-status" role="alert">{{ error }}</p>
    <p v-if="cacheNote" class="small muted" role="status">{{ cacheNote }}</p>
    <article v-if="record" class="coach-advice">
      <h4>{{ record.advice.headline }}</h4>
      <div v-for="(observation, index) in record.advice.analysis" :key="index">
        <p>{{ observation.text }}</p>
        <details class="coach-evidence">
          <summary>查看判断依据</summary>
          <p v-for="id in observation.evidenceIds" :key="id">
            <strong>{{ fact(id)?.label }}：</strong>{{ fact(id)?.text }}
          </p>
        </details>
      </div>
      <dl class="coach-plan">
        <div>
          <dt>进攻</dt>
          <dd>{{ tacticalLabel('offense', record.advice.plan.offense) }}</dd>
        </div>
        <div>
          <dt>防守</dt>
          <dd>{{ tacticalLabel('defense', record.advice.plan.defense) }}</dd>
        </div>
        <div>
          <dt>节奏</dt>
          <dd>{{ tacticalLabel('pace', record.advice.plan.pace) }}</dd>
        </div>
        <div>
          <dt>轮换</dt>
          <dd>{{ tacticalLabel('rotation', record.advice.plan.rotation) }}</dd>
        </div>
        <div>
          <dt>上场预算</dt>
          <dd>{{ record.advice.plan.originalMinutes }} 分钟</dd>
        </div>
        <div>
          <dt>重点使用</dt>
          <dd>{{ focusName }}</dd>
        </div>
      </dl>
      <p><strong>采用理由：</strong>{{ record.advice.reason }}</p>
      <p><strong>需要承担：</strong>{{ record.advice.tradeoff }}</p>
      <BaseButton variant="primary" :disabled="disabled" @click="adopt"
        >采用建议，填入战术板</BaseButton
      >
      <p v-if="applied" class="coach-applied" role="status">
        已填入下方战术板。你可以继续修改，点击“{{
          context.completedQuarters
            ? `执行第 ${context.completedQuarters + 1} 节计划`
            : '开始第一节'
        }}”后才会生效。
      </p>
      <p class="small muted">建议供参考，采用前请结合场上情况判断。每一节，都有新的机会。</p>
      <AiUsage :metrics="record.metrics" />
    </article>
  </section>
</template>
