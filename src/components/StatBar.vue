<script setup lang="ts">
defineProps<{ label: string; value: number; preview?: number }>();
</script>
<template>
  <div class="stat-row">
    <div class="stat-row__label">
      <span>{{ label }}</span
      ><span class="numeric"
        >{{ value
        }}<span v-if="preview !== undefined && preview !== value" class="improvement">
          → {{ preview }}（+{{ preview - value }}）</span
        ></span
      >
    </div>
    <div class="stat-track"><div :style="{ width: `${value}%` }"></div></div>
  </div>
</template>
