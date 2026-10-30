<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { GameAPI } from '../contracts';
import AppShell from '../components/AppShell.vue';
import BaseButton from '../components/BaseButton.vue';
import BaseDialog from '../components/BaseDialog.vue';
import CoinBadge from '../components/CoinBadge.vue';
import InlineAlert from '../components/InlineAlert.vue';
import ToastRegion from '../components/ToastRegion.vue';
import DraftBuilder from './DraftBuilder.vue';
import CareerDashboard from './CareerDashboard.vue';
import LockerView from './LockerView.vue';
import ShopView from './ShopView.vue';
import MatchResultView from './MatchResultView.vue';
import LiveMatchView from './LiveMatchView.vue';
import SummaryView from './SummaryView.vue';
import CareerReport from '../components/CareerReport.vue';
import AboutGame from '../components/AboutGame.vue';
const props = defineProps<{ api: GameAPI }>();
const tab = ref<'career' | 'workshop' | 'shop' | 'report'>('career');
const modal = ref<'new' | 'help' | 'about' | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const state = computed(() => props.api.state);
const canEdit = computed(
  () => state.value?.phase === 'ready' || state.value?.phase === 'offseason',
);
const currentMatch = computed(
  () =>
    state.value?.matches.find((m) => m.matchId === state.value?.currentMatchId) ??
    state.value?.matches.at(-1),
);
watch(
  () => state.value?.phase,
  () => {
    tab.value = 'career';
  },
);
watch([() => state.value?.phase, tab], async () => {
  await nextTick();
  window.scrollTo({ top: 0 });
});
async function create() {
  modal.value = null;
  tab.value = 'career';
  await props.api.newCareer();
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await props.api.importSave(file);
  input.value = '';
}
</script>
<template>
  <AppShell
    ><aside class="sidebar">
      <a class="brand" href="#" @click.prevent="tab = 'career'"
        ><span class="brand-mark" aria-hidden="true">H<span>F</span></span>
        <div><strong>HOOP FORGE</strong><small>篮球融合生涯</small></div></a
      >
      <div class="sidebar__label">你的篮球实验室</div>
      <nav class="main-nav" aria-label="主要导航">
        <button :class="{ active: tab === 'career' }" @click="tab = 'career'">
          <span aria-hidden="true">◈</span> 生涯中心</button
        ><button
          :class="{ active: tab === 'workshop' }"
          :disabled="!state?.player"
          @click="tab = 'workshop'"
        >
          <span aria-hidden="true">↗</span> 能力工坊
          <span v-if="state?.player" class="nav-count">{{ state.inventory.length }}</span></button
        ><button
          :class="{ active: tab === 'shop' }"
          :disabled="!state?.player"
          @click="tab = 'shop'"
        >
          <span aria-hidden="true">▱</span> 球员市场
        </button>
        <button
          :class="{ active: tab === 'report' }"
          :disabled="!state?.player"
          @click="tab = 'report'"
        >
          <span aria-hidden="true">▤</span> 生涯报告
        </button>
      </nav>
      <div class="sidebar__bottom">
        <div class="court-icon" aria-hidden="true"><span></span></div>
        <p>你的天赋组合。<br />你的冠军故事。</p>
        <button class="text-button" @click="modal = 'help'">玩法说明 ↗</button
        ><button class="text-button" @click="modal = 'about'">关于游戏 ↗</button
        ><span class="small muted">本地生涯 · 自动存档</span>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar__breadcrumb">
          球探工作台 <span>/</span>
          {{
            !state
              ? '开始'
              : state.phase === 'draft'
                ? '创造球员'
                : tab === 'career'
                  ? '生涯中心'
                  : tab === 'workshop'
                    ? '能力工坊'
                    : tab === 'report'
                      ? '生涯报告'
                      : '球员市场'
          }}
        </div>
        <div class="topbar__actions">
          <CoinBadge
            v-if="
              state &&
              state.phase !== 'live' &&
              !(state.phase === 'result' && currentMatch?.featured)
            "
            :value="state.coins"
          /><BaseButton variant="ghost" @click="api.exportSave()">{{
            state ? '备份存档' : '备份旧版存档'
          }}</BaseButton
          ><BaseButton variant="ghost" @click="fileInput?.click()">导入存档</BaseButton
          ><button class="icon-button help-button" aria-label="玩法说明" @click="modal = 'help'">
            ?
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          hidden
          @change="importFile"
        />
      </header>
      <main class="main-content">
        <InlineAlert v-if="api.catalog.status === 'fixture'" tone="warning"
          >当前使用演示资料，非真实完整NBA名册。</InlineAlert
        ><InlineAlert v-if="api.readOnly" tone="warning"
          >当前页面为只读。请关闭其他正在游玩的页面，并在支持本地写入锁的现代浏览器中重新打开。</InlineAlert
        ><template v-if="!state"
          ><section class="landing">
            <div class="landing__copy">
              <p class="eyebrow">BUILD A PLAYER. WRITE A LEGACY.</p>
              <h1>天赋由你融合。<br />生涯，<span>由你书写。</span></h1>
              <p class="landing__intro">
                抽取 NBA 球员卡，继承九项能力。<br />创造你的理想球星，在完整NBA赛季里书写生涯。
              </p>
              <div class="landing__actions">
                <BaseButton
                  variant="primary"
                  :loading="api.busy"
                  :disabled="api.readOnly"
                  @click="create"
                  >抽取我的 20 位球员 ↗</BaseButton
                ><BaseButton @click="modal = 'help'">了解玩法</BaseButton>
              </div>
              <div class="landing__facts">
                <div><strong>20</strong><span>初始球员卡</span></div>
                <div><strong>9</strong><span>能力维度</span></div>
                <div><strong>82</strong><span>常规赛场次</span></div>
              </div>
            </div>
            <div class="landing__art" aria-hidden="true">
              <div class="hero-card hero-card--back"><span>YOUR LEGACY</span></div>
              <div class="hero-card">
                <div class="hero-card__label"><span>ORIGINAL PLAYER</span><b>★</b></div>
                <div class="hero-jersey">HF<span>01</span></div>
                <strong>THE NEXT<br />GREAT ONE.</strong>
                <div class="hero-card__footer">你的名字，下一位球星。</div>
              </div>
              <span class="floating-label">融合天赋 / FORGE YOUR GAME</span>
            </div>
          </section>
          <div class="onboarding-grid">
            <article>
              <b>01</b>
              <h3>抽取天赋</h3>
              <p>开局 5 位明星与 15 位其他球员，寻找各自最出色的能力。</p>
            </article>
            <article>
              <b>02</b>
              <h3>创造球星</h3>
              <p>九张不同球员卡，各贡献一项数值，组成你的原创球员。</p>
            </article>
            <article>
              <b>03</b>
              <h3>征服赛季</h3>
              <p>比赛获得金币，继续抽卡和训练，让每一季都比上一季更强。</p>
            </article>
          </div></template
        ><DraftBuilder v-else-if="state.phase === 'draft'" :api="api" /><template
          v-else-if="state.player"
          ><CareerReport
            v-if="tab === 'report'"
            :state="state"
            :catalog="api.catalog" /><LiveMatchView
            v-else-if="
              state.phase === 'live' || (state.phase === 'result' && currentMatch?.featured)
            "
            :api="api" /><MatchResultView
            v-else-if="state.phase === 'result' && currentMatch"
            :match="currentMatch"
            :busy="api.busy"
            :read-only="api.readOnly"
            @continue="api.execute({ type: 'ACK_MATCH_RESULT' })" /><SummaryView
            v-else-if="['seasonSummary', 'finished'].includes(state.phase)"
            :api="api"
            @new-career="modal = 'new'" /><LockerView
            v-else-if="tab === 'workshop'"
            :api="api"
            :can-edit="canEdit" /><ShopView
            v-else-if="tab === 'shop'"
            :api="api"
            :can-edit="canEdit" /><SummaryView
            v-else-if="state.phase === 'offseason'"
            :api="api" /><CareerDashboard
            v-else
            :api="api"
            :can-edit="canEdit"
            @workshop="tab = 'workshop'"
            @report="tab = 'report'"
        /></template>
        <footer class="footer">
          <span>HOOP FORGE · 原创篮球生涯模拟</span
          ><span>30 支球队 · {{ api.catalog.players.length }} 名球员 · 你的冠军故事</span
          ><button class="text-button" @click="modal = 'about'">数据与规则</button
          ><button v-if="state" class="text-button" @click="modal = 'new'">重新开档</button>
        </footer>
      </main>
    </div>
    <ToastRegion :message="api.error" @close="api.clearError()" /><BaseDialog
      v-if="modal === 'new'"
      title="开启一段新的生涯？"
      @close="modal = null"
      ><p>新的开局将替换当前活动存档。建议先导出，保留这位球星的故事。</p>
      <div class="dialog-actions">
        <BaseButton @click="api.exportSave()">先备份存档</BaseButton
        ><BaseButton @click="modal = null">取消</BaseButton
        ><BaseButton variant="danger" :disabled="api.readOnly" @click="create"
          >确认新开档</BaseButton
        >
      </div></BaseDialog
    ><BaseDialog v-if="modal === 'help'" title="如何打造你的冠军球员" @close="modal = null"
      ><ol class="help-list">
        <li>
          <strong>挑选九项天赋</strong>
          <p>
            开局获得 20 张不重复球员卡，每个能力槽放一张不同的卡。确认后消耗 9 张，剩余 11 张保留。
          </p>
        </li>
        <li>
          <strong>选择合适的打法</strong>
          <p>持球、无球、内线或组织，发挥不同能力。每场赛前都可以调整。</p>
        </li>
        <li>
          <strong>赢球与成长</strong>
          <p>
            每队82场常规赛。分区前六直接晋级，7–10名参加附加赛；季后赛四轮均七局四胜。金币用于抽包，卡片用于继承或训练。
          </p>
        </li>
        <li>
          <strong>每节参与，改变比赛</strong>
          <p>
            每季8场重点提示，任何一场都能进入战术观战。节间调整进攻、防守、节奏、轮换与上场预算；支持逐回合播放、倍速和跳到节末。
          </p>
        </li>
        <li>
          <strong>保留你的篮球故事</strong>
          <p>
            每场比赛自动保存。赛季结束后回顾代表比赛、阅读 AI
            生涯故事，再通过能力工坊规划下一年。备份存档，可以保留并迁移这段生涯。
          </p>
        </li>
      </ol>
      <InlineAlert
        >九项能力决定你的球员轮廓，打法、战术与轮换决定你如何使用这些天赋。每一种选择，都有自己的收益与取舍。</InlineAlert
      ><BaseButton variant="primary" class="full-width" @click="modal = null">准备上场</BaseButton
      ><BaseButton variant="ghost" class="full-width" @click="modal = 'about'"
        >关于游戏与资料来源</BaseButton
      ></BaseDialog
    ><AboutGame v-if="modal === 'about'" :catalog="api.catalog" @close="modal = null"
  /></AppShell>
</template>
