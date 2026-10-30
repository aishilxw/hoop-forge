<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CareerState } from '../contracts';
import { buildCareerFacts, type AiReportRecord } from '../ai/career-facts';
import {
  aiStatus,
  AI_ERRORS,
  cachedReport,
  factsKey,
  generateReport,
  saveReport,
} from '../ai/client';
import BaseButton from './BaseButton.vue';
import AiUsage from './AiUsage.vue';
const props = defineProps<{ state: CareerState; season: number | 'all' }>();
const facts = computed(() => buildCareerFacts(props.state, props.season));
const serialized = computed(() => JSON.stringify(facts.value));
const report = ref<AiReportRecord | null>(null);
const configured = ref(false);
const serviceReady = ref(false);
const model = ref('deepseek-flash');
const loading = ref(false);
const checking = ref(true);
const error = ref('');
const cacheNote = ref('');
let generation = 0;
let mounted = true;
onBeforeUnmount(() => {
  mounted = false;
  generation++;
});
watch(
  serialized,
  async () => {
    const turn = ++generation;
    report.value = null;
    error.value = '';
    cacheNote.value = '';
    checking.value = true;
    try {
      const [status, record] = await Promise.all([
        aiStatus().catch(() => null),
        factsKey(facts.value)
          .then(cachedReport)
          .catch(() => null),
      ]);
      if (!mounted || turn !== generation) return;
      serviceReady.value = Boolean(status);
      configured.value = status?.configured ?? false;
      model.value = status?.model ?? 'deepseek-flash';
      if (record && record.model === model.value) {
        report.value = record;
        cacheNote.value = '你的生涯故事已保存，可直接阅读。';
      }
    } finally {
      if (mounted && turn === generation) checking.value = false;
    }
  },
  { immediate: true },
);
async function generate() {
  if (loading.value || !facts.value.facts.length) return;
  const turn = generation;
  const input = facts.value;
  error.value = '';
  cacheNote.value = '';
  loading.value = true;
  try {
    const key = await factsKey(input);
    const result = await generateReport(input);
    let saved = true;
    try {
      await saveReport(key, result);
    } catch {
      saved = false;
    }
    if (!mounted || turn !== generation) return;
    report.value = result;
    cacheNote.value = result.servedFromCache
      ? '生涯故事已就绪，无需重新生成。'
      : saved
        ? '已保存到此浏览器，随时回来重温这段生涯。'
        : '报告已生成，但未能保存到浏览器。请保留此页面，稍后再试。';
  } catch (cause) {
    if (!mounted || turn !== generation) return;
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
const factById = (id: string) => report.value?.facts.facts.find((f) => f.id === id);
</script>
<template>
  <section class="ai-journal" aria-labelledby="ai-journal-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">DEEPSEEK · 你的篮球纪录片</p>
        <h3 id="ai-journal-title">让这一段生涯，有自己的故事。</h3>
      </div>
      <span class="tag">DeepSeek · 生涯作者</span>
    </div>
    <p class="muted">{{ facts.scope }} · 根据比赛与成长记录，为你讲述这段篮球人生。</p>
    <p v-if="!facts.facts.length" class="muted">完成首场比赛后，就能生成你的第一篇生涯故事。</p>
    <template v-else>
      <template v-if="!report">
        <p class="muted">
          由 DeepSeek 根据你的球员信息、比赛汇总和代表比赛撰写。点击生成后，会将这些资料发送给
          DeepSeek。
        </p>
        <p v-if="!checking && !configured" class="ai-status">
          {{ serviceReady ? AI_ERRORS.KEY_MISSING : AI_ERRORS.UNAVAILABLE }}
          未接入时仍可阅读下方统计分析。
        </p>
        <BaseButton
          variant="primary"
          :loading="loading"
          :disabled="checking || !configured"
          @click="generate"
          >{{ loading ? '正在撰写你的篮球故事…' : '生成我的 AI 生涯故事 →' }}</BaseButton
        >
        <p v-if="loading" class="muted" role="status">
          正在整理这段经历，通常需要等待片刻。不会影响比赛进度。
        </p>
      </template>
      <p v-if="error" class="ai-status" role="alert">{{ error }}</p>
      <p v-if="cacheNote" class="muted" role="status">{{ cacheNote }}</p>
      <article v-if="report" class="ai-story">
        <p class="eyebrow">AI 生成 · {{ new Date(report.generatedAt).toLocaleString('zh-CN') }}</p>
        <h3>{{ report.narrative.title }}</h3>
        <section
          v-for="(section, index) in [...report.narrative.sections, ...report.narrative.nextSteps]"
          :key="index"
          class="ai-chapter"
        >
          <h4>{{ section.title }}</h4>
          <p>{{ section.body }}</p>
          <details>
            <summary>查看分析依据 · {{ section.evidenceIds.length }} 项</summary>
            <div v-for="id in section.evidenceIds" :key="id" class="ai-evidence">
              <strong>{{ factById(id)?.label }}</strong>
              <p>{{ factById(id)?.text }}</p>
            </div>
          </details>
        </section>
        <AiUsage :metrics="report.metrics" />
        <p class="muted">
          AI 观点供参考，精确数据以比赛统计为准。你可以展开每段下方的依据，回看属于自己的比赛。
        </p>
      </article>
    </template>
  </section>
</template>
