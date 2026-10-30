import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { AiError } from './ai.mjs';
export async function loadSharedConfig(configUrl) {
  try {
    const c = JSON.parse(await readFile(configUrl, 'utf8'));
    const url = new URL(c.url);
    if (
      c.version !== 1 ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      typeof c.buildId !== 'string' ||
      c.buildId.length < 16 ||
      c.buildId.length > 160
    )
      throw Error('Invalid shared AI configuration');
    return { url: url.origin, buildId: c.buildId };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function loadDeviceId(file) {
  try {
    const c = JSON.parse(await readFile(file, 'utf8'));
    if (/^[a-zA-Z0-9-]{16,100}$/.test(c.deviceId)) return c.deviceId;
  } catch {
    /* A fresh installation gets its own non-secret identifier. */
  }
  const deviceId = randomUUID();
  try {
    await writeFile(file, JSON.stringify({ deviceId }), { mode: 0o600 });
  } catch {
    /* Read-only directories still allow this launch; global cloud limits remain enforced. */
  }
  return deviceId;
}
const allowed = new Set([
  'INVALID_REQUEST',
  'INVALID_AI_RESPONSE',
  'TIMEOUT',
  'BUSY',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'SHARED_UNAVAILABLE',
  'DEMO_DISABLED',
  'DEMO_EXPIRED',
  'DEMO_ACCESS_DENIED',
  'DEMO_LIMIT_REACHED',
  'DEMO_DEVICE_LIMIT',
]);
export function createSharedAiService({ config, deviceId, fetchImpl = fetch }) {
  const pending = new Map();
  let relayRequests = 0;
  let lastStatus = null;
  async function send(path, body, timeout) {
    try {
      const r = await fetchImpl(config.url + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-hoop-forge-build': config.buildId,
          'x-hoop-forge-device': deviceId,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
      const data = await r.json();
      if (!r.ok)
        throw new AiError(allowed.has(data.error) ? data.error : 'SHARED_UNAVAILABLE', r.status);
      return data;
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(
        error.name === 'AbortError' || error.name === 'TimeoutError'
          ? 'TIMEOUT'
          : 'SHARED_UNAVAILABLE',
        503,
      );
    }
  }
  async function run(path, body) {
    const key = createHash('sha256')
      .update(path + JSON.stringify(body))
      .digest('hex');
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      relayRequests++;
      return send(path, body, 65000);
    })();
    pending.set(key, request);
    try {
      return await request;
    } finally {
      pending.delete(key);
    }
  }
  return {
    async status() {
      if (lastStatus && Date.now() - lastStatus.at < 15000) return lastStatus.value;
      let value;
      try {
        const status = await send('/api/ai/status', null, 5000);
        value = { ...status, configured: true, mode: 'shared', available: true };
      } catch (error) {
        value = {
          configured: true,
          model: 'deepseek-flash',
          mode: 'shared',
          available: false,
          serviceState: error.code ?? 'SHARED_UNAVAILABLE',
        };
      }
      lastStatus = { at: Date.now(), value };
      return value;
    },
    generate: (facts) => run('/api/ai/career-report', { facts }),
    coach: (context) => run('/api/ai/coach', { context }),
    metrics: () => ({ mode: 'shared', relayRequests, providerCalls: null, events: [] }),
  };
}
