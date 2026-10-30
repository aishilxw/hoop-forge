<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>
<template>
  <div class="empty-state">
    <span class="empty-state__icon" aria-hidden="true">◇</span>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
