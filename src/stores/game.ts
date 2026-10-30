import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import { catalog } from '../data/catalog';
import { createCareer, applyCommand } from '../domain';
import type { CareerState, CommandPayload } from '../contracts';
import { validateSave } from '../application/save';
import { loadStoredCareer, storeCareer } from '../application/repository';
export const useGameStore = defineStore('game', () => {
  const state = ref<CareerState | null>(null),
    busy = ref(false),
    error = ref(''),
    readOnly = ref(true);
  const labels: Record<string, string> = {
    INVALID_PHASE: '当前阶段不能执行该操作。',
    INVALID_ASSIGNMENT: '请使用九张不同的卡填满九项能力。',
    CARD_NOT_FOUND: '所选卡片不存在或已消耗。',
    INSUFFICIENT_COINS: '金币不足。',
    INSUFFICIENT_CARDS: '训练材料不足。',
    NO_IMPROVEMENT: '这项能力没有提升。',
    ATTRIBUTE_MAXED: '能力已达到上限。',
    CAREER_LIMIT_REACHED: '达到当前生涯模式支持上限，可选择退役并保留档案。',
    SIMULATION_PREFIX_CHANGED:
      '当前未完成比赛与本版本模拟规则不一致，请使用原版本继续；已完成的历史赛果不受影响。',
    INVALID_PLAN: '战术配置无效，请核对上场时间与重点球员。',
    STALE_REVISION: '存档已更新，请刷新后再试。',
  };
  let initialized = false;
  const syncChannel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('hoop-forge-sync-v2');
  if (syncChannel)
    syncChannel.onmessage = async () => {
      if (!busy.value) {
        try {
          state.value = await loadStoredCareer(catalog);
        } catch {
          error.value = '存档更新读取失败，请刷新。';
        }
      }
    };
  async function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      state.value = await loadStoredCareer(catalog);
    } catch (e) {
      error.value = String(e instanceof Error ? e.message : e);
    }
    if (!navigator.locks) {
      error.value = '此浏览器不支持安全存档写入，请使用新版 Chrome、Edge 或 Safari。';
      return;
    }
    readOnly.value = false;
  }
  async function run(action: () => CareerState, replace = false) {
    if (readOnly.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      await navigator.locks.request('hoop-forge:transaction:v2', async () => {
        let latest: CareerState | null = null;
        try {
          latest = await loadStoredCareer(catalog);
        } catch (e) {
          if (!replace) throw e;
        }
        if (
          !replace &&
          state.value &&
          latest &&
          (latest.careerId !== state.value.careerId || latest.revision !== state.value.revision)
        ) {
          state.value = latest;
          throw new Error('另一窗口已更新进度，请核对后重试。');
        }
        const next = action();
        await storeCareer(next);
        syncChannel?.postMessage(next.revision);
        state.value = next;
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }
  async function newCareer() {
    await run(() => {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const result = createCareer(seed, catalog);
      if (!result.ok) throw new Error(labels[result.error.code] ?? result.error.code);
      return result.value;
    }, true);
  }
  async function execute(payload: CommandPayload) {
    await run(() => {
      if (!state.value) throw new Error('请先创建生涯。');
      const result = applyCommand(
        toRaw(state.value),
        { ...payload, commandId: crypto.randomUUID(), expectedRevision: state.value.revision },
        catalog,
      );
      if (!result.ok)
        throw new Error(labels[result.error.code] ?? `操作未完成：${result.error.code}`);
      return result.value;
    });
  }
  function exportSave() {
    const exported = state.value
      ? JSON.stringify(state.value, null, 2)
      : localStorage.getItem('hoop-forge:career:v1');
    if (!exported) {
      error.value = '没有可备份的存档。';
      return;
    }
    const url = URL.createObjectURL(new Blob([exported], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = '篮球融合生涯-存档.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSave(file: File) {
    if (file.size > 64 * 1024 * 1024) {
      error.value = '存档超过64MiB限制。';
      return;
    }
    try {
      const parsed = validateSave(JSON.parse(await file.text()), catalog);
      await run(() => parsed, true);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    state,
    catalog,
    busy,
    error,
    readOnly,
    initialize,
    newCareer,
    execute,
    exportSave,
    importSave,
    clearError: () => {
      error.value = '';
    },
  };
});
