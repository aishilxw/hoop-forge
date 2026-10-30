<script setup lang="ts">
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type Attributes } from '../contracts';
import StatBar from './StatBar.vue';
defineProps<{ attributes: Attributes; preview?: Partial<Attributes> }>();
</script>
<template>
  <div class="attribute-grid">
    <StatBar
      v-for="key in ATTRIBUTE_KEYS"
      :key="key"
      :label="ATTRIBUTE_LABELS[key]"
      :value="attributes[key]"
      :preview="preview?.[key]"
    />
  </div>
</template>
