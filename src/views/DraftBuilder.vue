<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  STYLE_LABELS,
  type AttributeKey,
  type GameAPI,
  type PlayStyle,
} from '../contracts';
import BaseButton from '../components/BaseButton.vue';
import PlayerCard from '../components/PlayerCard.vue';
import BaseDialog from '../components/BaseDialog.vue';
import { NBA_TEAMS } from '../data/teams';
const props = defineProps<{ api: GameAPI }>();
const teamId = ref('LAL');
const name = ref('我的原创球星');
const style = ref<PlayStyle>('primaryCreator');
const active = ref<AttributeKey>('insideScoring');
const assignments = reactive(
  Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, ''])) as Record<AttributeKey, string>,
);
const search = ref('');
const confirmation = ref(false);
const players = computed(() => new Map(props.api.catalog.players.map((p) => [p.playerId, p])));
const selectedTeam = computed(() => NBA_TEAMS.find((t) => t.id === teamId.value));
const selectedRoster = computed(
  () => selectedTeam.value?.playerIds.map((id) => players.value.get(id)).filter((p) => !!p) ?? [],
);
const cards = computed(() => props.api.state?.initialCards ?? []);
const availableCards = computed(() =>
  cards.value.filter((c) => {
    const p = players.value.get(c.playerId);
    return p && `${p.nameEn} ${p.nameZh ?? ''}`.toLowerCase().includes(search.value.toLowerCase());
  }),
);
const chosen = (key: AttributeKey) =>
  players.value.get(cards.value.find((c) => c.instanceId === assignments[key])?.playerId ?? '');
const filled = computed(() => ATTRIBUTE_KEYS.filter((k) => assignments[k]).length);
function select(instanceId: string) {
  const oldKey = ATTRIBUTE_KEYS.find((k) => assignments[k] === instanceId);
  if (oldKey && oldKey !== active.value) assignments[oldKey] = '';
  assignments[active.value] = assignments[active.value] === instanceId ? '' : instanceId;
}
async function confirm() {
  confirmation.value = false;
  await props.api.execute({
    type: 'CONFIRM_DRAFT',
    name: name.value.trim() || '我的原创球星',
    style: style.value,
    teamId: teamId.value,
    assignments: { ...assignments },
  });
}
</script>
<template>
  <section class="page-title">
    <div>
      <p class="eyebrow">THE DRAFT LAB · 球员创造室</p>
      <h1>拼出你的<span>理想球星</span></h1>
      <p class="muted">20 位球员，9 项能力。每张卡只能贡献一项，选择你的篮球答案。</p>
    </div>
    <div class="step-badge">
      <b>{{ filled }} / 9</b><span>能力已就位</span>
    </div>
  </section>
  <div class="draft-layout">
    <section class="panel draft-panel">
      <div class="section-heading">
        <div>
          <h2>你的初始卡池</h2>
          <p class="muted small">5 张明星卡 + 15 张普通卡 · 凭你的篮球判断选择天赋</p>
        </div>
        <span class="pill">{{ cards.length }} 张</span>
      </div>
      <input
        v-model="search"
        class="search-input"
        placeholder="搜索球员姓名…"
        aria-label="搜索球员"
      />
      <div class="player-grid">
        <template v-for="card in availableCards" :key="card.instanceId"
          ><PlayerCard
            v-if="players.get(card.playerId)"
            :player="players.get(card.playerId)!"
            :star="api.catalog.starIds.includes(card.playerId)"
            :attribute="active"
            :selected="assignments[active] === card.instanceId"
            :used="Object.values(assignments).includes(card.instanceId)"
            @select="select(card.instanceId)"
        /></template>
      </div>
      <p v-if="!availableCards.length" class="muted">没有符合搜索的球员。</p>
    </section>
    <aside class="panel draft-preview">
      <div class="section-heading">
        <h2>能力蓝图</h2>
        <span class="pill pill--accent">点击属性，再选球员</span>
      </div>
      <div class="blind-draft-note">
        <strong>你的篮球判断，就是球探报告。</strong>
        <p>这里只展示球员身份，不公开评分。完成九项选择并签约后，才会揭晓原创球员能力。</p>
      </div>
      <div class="assignment-list">
        <button
          v-for="key in ATTRIBUTE_KEYS"
          :key="key"
          :class="['assignment-row', { active: active === key }]"
          @click="active = key"
        >
          <span>{{ ATTRIBUTE_LABELS[key] }}</span
          ><span class="assignment-row__source">{{
            chosen(key)?.nameZh || chosen(key)?.nameEn || '选择来源'
          }}</span
          ><strong>{{ assignments[key] ? '✓' : '—' }}</strong>
        </button>
      </div>
      <section class="team-choice">
        <h3>选择你的 NBA 起点</h3>
        <p class="small muted">选择你的主场，与熟悉的球员并肩作战。</p>
        <label class="field"
          >签约球队<select v-model="teamId">
            <option v-for="team in NBA_TEAMS" :key="team.id" :value="team.id">
              {{ team.nameZh }} · {{ team.conference === 'east' ? '东部' : '西部' }}
            </option>
          </select></label
        >
        <div class="team-roster-chips">
          <span v-for="mate in selectedRoster" :key="mate!.playerId">{{
            mate!.nameZh || mate!.nameEn
          }}</span>
        </div>
      </section>
      <label class="field"
        >球星姓名<input v-model="name" maxlength="24" placeholder="给你的球星起个名字" /></label
      ><label class="field"
        >初始打法<select v-model="style">
          <option v-for="(label, key) in STYLE_LABELS" :key="key" :value="key">{{ label }}</option>
        </select></label
      ><BaseButton
        variant="primary"
        class="full-width"
        :disabled="filled !== 9 || api.readOnly"
        :loading="api.busy"
        @click="confirmation = true"
        >开启我的生涯 <span aria-hidden="true">↗</span></BaseButton
      >
      <p class="small muted">确认后消耗 9 张卡，其余 11 张进入卡库。确认前可自由更换。</p>
    </aside>
  </div>
  <BaseDialog v-if="confirmation" title="让这位球星走上球场？" @close="confirmation = false"
    ><p>
      你将签约{{ selectedTeam?.nameZh }}，消耗九张卡并保留十一张。确认后才揭晓能力，不能返回重选。
    </p>
    <div class="dialog-actions">
      <BaseButton @click="confirmation = false">再检查一下</BaseButton
      ><BaseButton variant="primary" :disabled="api.readOnly" @click="confirm">确认创建</BaseButton>
    </div></BaseDialog
  >
</template>
