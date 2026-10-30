<script setup lang="ts">
import type { AiMetrics } from '../ai/career-facts';
defineProps<{ metrics?: AiMetrics }>();
</script>
<template>
  <details v-if="metrics" class="ai-usage">
    <summary>查看生成用量</summary>
    <p>
      原生成：输入 {{ metrics.inputTokens ?? '未返回' }}、输出
      {{ metrics.outputTokens ?? '未返回' }}，合计
      {{ metrics.totalTokens ?? '未返回' }} tokens；耗时
      {{ (metrics.durationMs / 1000).toFixed(1) }} 秒。
    </p>
    <p class="muted">
      模型侧缓存命中
      {{ metrics.cachedInputTokens ?? '未返回' }}
      tokens，计入输入用量。本机缓存再次阅读不会新增模型请求；具体费用以服务商账单为准。
    </p>
  </details>
</template>
