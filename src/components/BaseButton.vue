<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    loading?: boolean;
    disabled?: boolean;
  }>(),
  { variant: 'secondary', loading: false, disabled: false },
);
</script>
<template>
  <button
    :class="['button', `button--${variant}`]"
    :disabled="disabled || loading"
    :aria-busy="loading"
    type="button"
  >
    <span v-if="loading" class="spinner" aria-hidden="true"></span><slot />
  </button>
</template>
