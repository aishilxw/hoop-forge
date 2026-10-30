<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type AttributeKey, type GameAPI } from '../contracts';
import { BALANCE, trainingCards } from '../config/balance';
import BaseButton from '../components/BaseButton.vue';
import BaseDialog from '../components/BaseDialog.vue';
import PlayerCard from '../components/PlayerCard.vue';
import AttributeGrid from '../components/AttributeGrid.vue';
import EmptyState from '../components/EmptyState.vue';
const props = defineProps<{ api: GameAPI; canEdit: boolean }>();
const mode = ref<'inherit' | 'train'>('inherit');
const attribute = ref<AttributeKey>('outsideScoring');
const selected = ref<string[]>([]);
const confirm = ref(false);
const reveal = ref<{ name: string; attribute: string; before: number; after: number } | null>(null);
const search = ref('');
const catalog = computed(() => new Map(props.api.catalog.players.map((p) => [p.playerId, p])));
const inventory = computed(() => props.api.state?.inventory ?? []);
const cards = computed(() =>
  inventory.value.filter((c) => {
    const p = catalog.value.get(c.playerId);
    return p && `${p.nameEn} ${p.nameZh ?? ''}`.toLowerCase().includes(search.value.toLowerCase());
  }),
);
const player = computed(() => props.api.state?.player);
const current = computed(() => player.value?.attributes[attribute.value] ?? 40);
const required = computed(() => trainingCards(current.value));
const chosen = computed(() =>
  catalog.value.get(
    inventory.value.find((c) => c.instanceId === selected.value[0])?.playerId ?? '',
  ),
);
const target = computed(() =>
  mode.value === 'train'
    ? Math.min(99, current.value + 1)
    : (chosen.value?.attributes[attribute.value] ?? current.value),
);
const allowed = computed(
  () =>
    props.canEdit &&
    !props.api.readOnly &&
    !props.api.busy &&
    (mode.value === 'inherit'
      ? selected.value.length === 1
      : selected.value.length === required.value &&
        current.value < 99 &&
        (props.api.state?.coins ?? 0) >= BALANCE.trainingCoins),
);
watch([mode, attribute], () => {
  selected.value = [];
});
function select(id: string) {
  if (mode.value === 'inherit') selected.value = selected.value[0] === id ? [] : [id];
  else if (selected.value.includes(id)) selected.value = selected.value.filter((c) => c !== id);
  else if (selected.value.length < required.value) selected.value = [...selected.value, id];
}
async function apply() {
  confirm.value = false;
  const before = current.value;
  const sourceName = chosen.value?.nameZh || '来源球员';
  const sourceInstance = selected.value[0];
  if (mode.value === 'inherit')
    await props.api.execute({
      type: 'INHERIT_ATTRIBUTE',
      instanceId: selected.value[0],
      attribute: attribute.value,
    });
  else
    await props.api.execute({
      type: 'TRAIN_ATTRIBUTE',
      instanceIds: [...selected.value],
      attribute: attribute.value,
    });
  if (
    mode.value === 'inherit' &&
    sourceInstance &&
    !props.api.state?.inventory.some((c) => c.instanceId === sourceInstance)
  )
    reveal.value = {
      name: sourceName,
      attribute: ATTRIBUTE_LABELS[attribute.value],
      before,
      after: props.api.state?.player?.attributes[attribute.value] ?? before,
    };
  selected.value = [];
}
</script>
<template>
  <section class="page-title">
    <div>
      <p class="eyebrow">PLAYER DEVELOPMENT</p>
      <h1>让天赋<span>继续进化</span></h1>
      <p class="muted">每一次选择，都在塑造这位球员的比赛方式。</p>
    </div>
    <span class="pill">库存 {{ inventory.length }} 张</span>
  </section>
  <div class="workshop-layout">
    <section class="panel">
      <div class="segmented">
        <button :class="{ active: mode === 'inherit' }" @click="mode = 'inherit'">能力继承</button
        ><button :class="{ active: mode === 'train' }" @click="mode = 'train'">球员训练</button>
      </div>
      <p class="muted">
        {{
          mode === 'inherit'
            ? '根据你对球员的了解选择继承来源。来源能力隐藏，确认后揭晓结果。'
            : '消耗选中的卡片和金币，目标能力稳定提升 1 点。越接近顶级，训练需要越多材料。'
        }}
      </p>
      <div class="attribute-picker">
        <button
          v-for="key in ATTRIBUTE_KEYS"
          :key="key"
          :class="{ active: attribute === key }"
          @click="attribute = key"
        >
          {{ ATTRIBUTE_LABELS[key] }}
        </button>
      </div>
      <input
        v-model="search"
        class="search-input"
        aria-label="搜索库存球员"
        placeholder="搜索库存球员…"
      />
      <div v-if="cards.length" class="player-grid player-grid--locker">
        <template v-for="card in cards" :key="card.instanceId"
          ><PlayerCard
            v-if="catalog.get(card.playerId)"
            :player="catalog.get(card.playerId)!"
            :attribute="attribute"
            :star="api.catalog.starIds.includes(card.playerId)"
            :selected="selected.includes(card.instanceId)"
            compact
            @select="select(card.instanceId)"
          />
        </template>
      </div>
      <EmptyState
        v-else
        title="暂时没有可用球员卡"
        description="前往球员市场抽取卡片，或清除搜索条件。"
      />
    </section>
    <aside class="panel workshop-preview">
      <p class="eyebrow">UPGRADE PREVIEW</p>
      <h2>{{ ATTRIBUTE_LABELS[attribute] }}</h2>
      <div class="upgrade-numbers">
        <span>{{ current }}</span
        ><span class="muted">→</span><strong>{{ mode === 'inherit' ? '?' : target }}</strong>
      </div>
      <p v-if="mode === 'inherit'" class="muted">
        {{
          chosen
            ? `来源：${chosen.nameZh || chosen.nameEn}`
            : '凭你的判断选择来源，能力将在确认后揭晓。'
        }}
      </p>
      <p v-else class="muted">
        已选 {{ selected.length }} / {{ required }} 张 · 需要 {{ BALANCE.trainingCoins }} 金币
      </p>
      <p v-if="current >= 99" class="inline-alert">该属性已达上限。</p>
      <BaseButton
        variant="primary"
        class="full-width"
        :disabled="!allowed"
        :loading="api.busy"
        @click="confirm = true"
        >{{ mode === 'inherit' ? '确认能力继承' : '训练 +1' }}</BaseButton
      >
      <div v-if="player" class="divider-top">
        <h3>当前球员能力</h3>
        <AttributeGrid :attributes="player.attributes" />
      </div>
    </aside>
  </div>
  <BaseDialog
    v-if="confirm"
    :title="mode === 'inherit' ? '确认继承这项能力' : '确认本次训练'"
    @close="confirm = false"
    ><p>
      {{
        mode === 'inherit'
          ? '确认后消耗整张来源卡，再揭晓结果；没有提升也会消耗，但不会降低当前能力。请凭球员特点判断。'
          : `${ATTRIBUTE_LABELS[attribute]}将从 ${current} 提升为 ${target}。`
      }}
    </p>
    <p class="muted">
      {{
        mode === 'inherit'
          ? '即使没有提升，整张来源卡也会被消耗；不会降低能力，其他八项保持不变。'
          : `将消耗 ${required} 张选中的卡片及 ${BALANCE.trainingCoins} 金币。`
      }}
    </p>
    <div class="dialog-actions">
      <BaseButton @click="confirm = false">取消</BaseButton
      ><BaseButton variant="primary" :disabled="!allowed" @click="apply">确认提升</BaseButton>
    </div></BaseDialog
  >
  <BaseDialog v-if="reveal" title="继承结果已揭晓" @close="reveal = null"
    ><p>{{ reveal.name }}的{{ reveal.attribute }}继承结果：</p>
    <div class="upgrade-numbers">
      <span>{{ reveal.before }}</span
      ><span class="muted">→</span><strong>{{ reveal.after }}</strong>
    </div>
    <p class="muted">
      {{
        reveal.after > reveal.before
          ? '这次篮球判断带来了成长。'
          : '这张卡没有超过当前能力，能力保持不变。'
      }}来源卡已消耗。
    </p>
    <BaseButton variant="primary" @click="reveal = null">继续我的生涯</BaseButton></BaseDialog
  >
</template>
