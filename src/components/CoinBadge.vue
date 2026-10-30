<script setup lang="ts">
defineProps<{ value: number }>();
</script>
<template>
  <span class="coin-badge"
    ><span aria-hidden="true">●</span> {{ value.toLocaleString() }} <small>金币</small></span
  >
</template>
