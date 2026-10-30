<script setup lang="ts">
import { onMounted } from 'vue';
import { useGameStore } from './stores/game';
import GameView from './views/GameView.vue';
const game = useGameStore();
onMounted(() => game.initialize());
</script>
<template><GameView :api="game" /></template>
