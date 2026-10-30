import type { AiReportRecord, CareerFacts } from './career-facts';
import type { CoachContext, CoachRecord } from './coach-context';

const DB_NAME = 'hoop-forge-ai-reports-v1';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('reports');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function factsKey(facts: CareerFacts): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ promptVersion: 'career-story-6', facts })),
  );
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
async function readRecord<T>(key: string): Promise<T | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('reports').objectStore('reports').get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function writeRecord(key: string, report: unknown): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('reports', 'readwrite');
      t.objectStore('reports').put(report, key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
export const AI_ERRORS: Record<string, string> = {
  SHARED_UNAVAILABLE: '共享 AI 服务暂时无法连接，请联网后稍后重试。已有档案和基础游戏可继续使用。',
  DEMO_DISABLED: '本次共享 AI 试玩已关闭，已有报告仍可阅读，基础游戏可继续。',
  DEMO_EXPIRED: '共享 AI 试玩已到期，已有报告仍可阅读，基础游戏可继续。',
  DEMO_ACCESS_DENIED: '此试玩版本的 AI 通行标识已更新，请使用最新试玩包。',
  DEMO_LIMIT_REACHED: '共享 AI 本期或今日额度已用完，已有报告和基础游戏仍可使用。',
  DEMO_DEVICE_LIMIT: '你今天的 AI 试玩额度已用完，明天可继续；基础游戏仍可使用。',
  KEY_MISSING: '连接 DeepSeek 后即可启用 AI 助手，请按随附《AI 接入说明》完成配置。',
  AUTH_FAILED: 'DeepSeek 密钥未通过验证，请检查本机配置。',
  PAYMENT_REQUIRED: 'DeepSeek 账户余额不足，请到官方控制台检查。',
  RATE_LIMITED: 'DeepSeek 请求过于频繁，请稍后再试。',
  TIMEOUT: '生成超时，统计报告已保留，可以稍后重试。',
  BUSY: '另一份报告正在生成，请稍后再试。',
  INVALID_AI_RESPONSE: 'AI 返回的格式或引用依据不完整，本次未展示，请重试。',
  INVALID_REQUEST: '报告材料不完整，请刷新后重试。',
  UPSTREAM_ERROR: 'DeepSeek 暂时无法完成生成，请稍后重试。',
  UNAVAILABLE: '请通过游戏启动器打开页面，以连接 AI 助手。',
};
export async function aiStatus(): Promise<{ configured: boolean; model: string }> {
  const r = await fetch('/api/ai/status', { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw Error('UNAVAILABLE');
  return r.json();
}
export async function generateReport(facts: CareerFacts): Promise<AiReportRecord> {
  const r = await fetch('/api/ai/career-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facts }),
    signal: AbortSignal.timeout(65000),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? 'UPSTREAM_ERROR');
  return result;
}

export const cachedReport = (key: string) => readRecord<AiReportRecord>(key);
export const saveReport = (key: string, record: AiReportRecord) => writeRecord(key, record);
export async function coachKey(context: CoachContext): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ promptVersion: 'quarter-coach-1', context })),
  );
  return 'coach:' + [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export const cachedCoach = (key: string) => readRecord<CoachRecord>(key);
export const saveCoach = (key: string, record: CoachRecord) => writeRecord(key, record);
export async function generateCoach(context: CoachContext): Promise<CoachRecord> {
  const response = await fetch('/api/ai/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
    signal: AbortSignal.timeout(65000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'UPSTREAM_ERROR');
  return result;
}
