<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'warning' | 'error' | 'info' }>(), { tone: 'info' });
</script>
<template>
  <div
    :class="['inline-alert', `inline-alert--${tone}`]"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <slot />
  </div>
</template>
