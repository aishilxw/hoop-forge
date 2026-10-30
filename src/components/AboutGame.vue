<script setup lang="ts">
import { computed } from 'vue';
import type { Catalog } from '../contracts';
import BaseDialog from './BaseDialog.vue';
import BaseButton from './BaseButton.vue';
const props = defineProps<{ catalog: Catalog }>();
const emit = defineEmits<{ close: [] }>();
const sourceNotes = computed(() =>
  props.catalog.notes.map((note) =>
    note
      .replace('仍为明确标记估计', '采用估计评分')
      .replace(
        /NBA官方球员总表显示(\d+)人，与当前逐队来源差(\d+)人，仍待官方全量对账；不称已完成官方验收。/,
        'NBA官方汇总为$1人，与当前逐队名册存在$2人差异。',
      ),
  ),
);
</script>
<template>
  <BaseDialog title="关于 HOOP FORGE" @close="emit('close')">
    <div class="about-game">
      <p class="eyebrow">FOR THE LOVE OF THE GAME</p>
      <p class="about-intro">融合天赋，书写你的篮球人生。</p>
      <div class="about-facts">
        <span>30 支球队</span><span>82 场常规赛</span><span>9 项天赋</span>
      </div>
      <section>
        <h3>阵容与能力资料</h3>
        <p>
          当前收录 {{ catalog.players.length }} 名球员，阵容资料截至 {{ catalog.asOfDate }}。能力以
          NBA 2K26 第三方归档为参考，部分能力采用估计评分，卡面会标明资料类型。
        </p>
        <details>
          <summary>查看数据来源与核验范围</summary>
          <p v-if="catalog.status === 'fixture'">当前为演示资料，不能视作真实完整名册。</p>
          <p v-else-if="catalog.status !== 'verified'">
            资料类型：公开名册整理、第三方评分参考与游戏估值，非官方认证资料。
          </p>
          <ul>
            <li v-for="note in sourceNotes" :key="note">{{ note }}</li>
          </ul>
        </details>
      </section>
      <section>
        <h3>属于这段生涯的联盟</h3>
        <p>
          每段生涯采用固定阵容，后续赛季不自动同步现实交易。赛程按 NBA
          对阵频次编排，与官方逐日赛程不同。
        </p>
        <p>
          比赛采用包含轮换、体能、罚球与犯规的回合模拟；交易和伤病不参与模拟，比赛结果不代表现实预测。
        </p>
      </section>
      <section>
        <h3>AI 助手与生涯存档</h3>
        <p>
          AI 作者与场边教练使用 DeepSeek，由你主动生成或询问。生成时会发送对应的比赛与阵容摘要；AI
          观点供参考，精确数据以比赛统计为准。
        </p>
        <p>
          生涯进度自动保存在此浏览器，可通过备份存档迁移。AI
          正文与教练建议另行缓存在此浏览器，不包含在生涯 JSON 备份中。基础游戏可离线游玩，AI
          功能需要联网并配置自己的接口。
        </p>
      </section>
      <p class="small muted">HOOP FORGE · v0.3.4 · 本地游玩</p>
    </div>
    <BaseButton variant="primary" class="full-width" @click="emit('close')"
      >回到我的生涯</BaseButton
    >
  </BaseDialog>
</template>
