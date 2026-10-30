<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let origin: HTMLElement | null = null;
onMounted(() => {
  origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  origin?.focus();
});
</script>
<template>
  <dialog ref="dialog" class="dialog" @cancel.prevent="emit('close')">
    <header class="section-heading">
      <h2>{{ title }}</h2>
      <button class="icon-button" aria-label="关闭弹窗" @click="emit('close')">×</button>
    </header>
    <slot />
  </dialog>
</template>
