<script setup lang="ts">
import { computed } from 'vue';
import { ATTRIBUTE_LABELS, type AttributeKey, type PlayerDefinition } from '../contracts';
const props = defineProps<{
  player: PlayerDefinition;
  star?: boolean;
  attribute?: AttributeKey;
  selected?: boolean;
  used?: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{ select: [] }>();
const isEstimated = computed(() =>
  Object.values(props.player.evidence).some((e) => e.kind === 'estimated'),
);
const position = { guard: '后卫', wing: '锋线', big: '内线' };
</script>
<template>
  <button
    type="button"
    :class="[
      'player-card',
      {
        'player-card--star': star,
        'is-selected': selected,
        'is-used': used,
        'player-card--compact': compact,
      },
    ]"
    :aria-pressed="selected"
    @click="emit('select')"
  >
    <div class="player-card__top">
      <span>{{ star ? '★ 明星球员' : position[player.drawPosition] }}</span
      ><span class="player-card__rating" aria-label="能力待揭晓">?</span>
    </div>
    <div class="jersey" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <path d="M28 8 40 5Q50 22 60 5L72 8 93 31 77 45 70 34 70 95 30 95 30 34 23 45 7 31Z" />
        <path d="M40 5Q50 37 60 5M30 86H70" class="jersey__line" /></svg
      ><span>{{
        player.nameEn
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
      }}</span>
    </div>
    <strong class="player-card__name">{{ player.nameZh || player.nameEn }}</strong
    ><span class="player-card__english"
      >{{ position[player.drawPosition] }} · {{ player.teamLabel }}</span
    ><span
      class="small muted"
      :title="
        isEstimated ? '部分能力采用估计值，详见关于游戏。' : '依据2K26第三方归档映射到游戏能力。'
      "
      >{{ isEstimated ? '估计评分' : '2K26 参考' }}</span
    >
    <div class="player-card__bottom">
      <span>{{ attribute ? ATTRIBUTE_LABELS[attribute] + ' · 凭判断选择' : '能力隐藏' }}</span
      ><span>{{ used ? '已分配' : player.teamLabel }}</span>
    </div>
  </button>
</template>
