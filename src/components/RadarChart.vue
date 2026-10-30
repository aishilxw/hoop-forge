<script setup lang="ts">
import { computed } from 'vue';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type Attributes } from '../contracts';
const props = defineProps<{ attributes: Attributes }>();
const point = (i: number, radius: number): string =>
  `${150 + Math.sin((i * 2 * Math.PI) / 9) * radius},${150 - Math.cos((i * 2 * Math.PI) / 9) * radius}`;
const polygon = computed(() =>
  ATTRIBUTE_KEYS.map((k, i) => point(i, props.attributes[k] * 0.95)).join(' '),
);
</script>
<template>
  <svg
    viewBox="0 0 300 300"
    class="radar-chart"
    role="img"
    aria-label="九维能力雷达图，具体数值见下方能力列表"
  >
    <polygon
      v-for="radius in [24, 48, 72, 96]"
      :key="radius"
      :points="ATTRIBUTE_KEYS.map((_, i) => point(i, radius)).join(' ')"
      class="radar-grid"
    />
    <line
      v-for="(_, i) in ATTRIBUTE_KEYS"
      :key="i"
      x1="150"
      y1="150"
      :x2="point(i, 96).split(',')[0]"
      :y2="point(i, 96).split(',')[1]"
      class="radar-axis"
    />
    <polygon :points="polygon" class="radar-area" />
    <text
      v-for="(key, i) in ATTRIBUTE_KEYS"
      :key="key"
      :x="point(i, 124).split(',')[0]"
      :y="point(i, 124).split(',')[1]"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {{ ATTRIBUTE_LABELS[key] }}
    </text>
  </svg>
</template>
