<script setup lang="ts">
import { ref } from 'vue';
import type { GameAPI, DrawPosition, PlayerDefinition } from '../contracts';
import { BALANCE } from '../config/balance';
import BaseButton from '../components/BaseButton.vue';
import BaseDialog from '../components/BaseDialog.vue';
import PlayerCard from '../components/PlayerCard.vue';
const props = defineProps<{ api: GameAPI; canEdit: boolean }>();
const position = ref<DrawPosition>('guard');
const drawn = ref<PlayerDefinition | null>(null);
async function buy(targeted: boolean) {
  const previous = new Set(props.api.state?.inventory.map((c) => c.instanceId));
  await props.api.execute(
    targeted ? { type: 'BUY_PACK', position: position.value } : { type: 'BUY_PACK' },
  );
  const card = props.api.state?.inventory.find((c) => !previous.has(c.instanceId));
  if (card)
    drawn.value = props.api.catalog.players.find((p) => p.playerId === card.playerId) ?? null;
}
</script>
<template>
  <section class="page-title">
    <div>
      <p class="eyebrow">SCOUTING MARKET</p>
      <h1>寻找下一块<span>冠军拼图</span></h1>
      <p class="muted">新卡可以继承一项能力，也可以作为训练材料。</p>
    </div>
  </section>
  <div class="pack-grid">
    <article class="panel pack">
      <span class="pack__number">01</span>
      <div class="pack-art"><span>HF</span><b>OPEN COURT</b></div>
      <h2>全场球员包</h2>
      <p class="muted">从完整卡池抽取 1 张球员卡。意外的单项天赋，也可能是最佳选择。</p>
      <p class="pack-odds">明星球员 10% · 非明星球员 90%</p>
      <BaseButton
        variant="primary"
        :disabled="
          !canEdit || api.readOnly || (api.state?.coins ?? 0) < BALANCE.standardPack || !!drawn
        "
        :loading="api.busy"
        @click="buy(false)"
        >{{ BALANCE.standardPack }} 金币 · 抽取一张</BaseButton
      >
    </article>
    <article class="panel pack">
      <span class="pack__number">02</span>
      <div class="pack-art pack-art--target"><span>HF</span><b>YOUR POSITION</b></div>
      <h2>位置定向包</h2>
      <p class="muted">缩小寻找范围，为你的打法补齐短板。每包包含 1 张球员卡。</p>
      <label class="field"
        >选择位置<select v-model="position">
          <option value="guard">后卫 · 组织与持球</option>
          <option value="wing">锋线 · 攻防多面手</option>
          <option value="big">内线 · 禁区与篮板</option>
        </select></label
      >
      <p class="pack-odds">所选位置内：明星 10% · 非明星 90%</p>
      <BaseButton
        variant="primary"
        :disabled="
          !canEdit || api.readOnly || (api.state?.coins ?? 0) < BALANCE.positionPack || !!drawn
        "
        :loading="api.busy"
        @click="buy(true)"
        >{{ BALANCE.positionPack }} 金币 · 定向抽取</BaseButton
      >
    </article>
  </div>
  <p class="muted small">后续抽卡可能获得同名球员，每张卡均独立保存。金币不足时可先参加比赛。</p>
  <BaseDialog v-if="drawn" title="新的球员卡已加入卡库" @close="drawn = null"
    ><div class="drawn-card">
      <PlayerCard :player="drawn" :star="api.catalog.starIds.includes(drawn.playerId)" />
    </div>
    <p class="muted">你可以在「能力工坊」查看这张卡的九维能力并进行继承。</p>
    <BaseButton variant="primary" class="full-width" @click="drawn = null"
      >收入卡库</BaseButton
    ></BaseDialog
  >
</template>
