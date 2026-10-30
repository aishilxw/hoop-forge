import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createAiService,
  createAiHandler,
  validateFacts,
  validateNarrative,
} from '../../scripts/release/ai.mjs';
const facts = () => ({
  version: 1,
  scope: '第1赛季截至当前',
  facts: [
    { id: 'identity', label: '球员', text: '测试球员' },
    { id: 'boundary', label: '边界', text: '游戏模拟' },
    { id: 'overall', label: '表现', text: '已完成一场' },
  ],
});
const narrative = () => ({
  title: '测试报告',
  sections: ['主线', '转折', '分析'].map((title) => ({
    title,
    body: '依据游戏事实展开分析。',
    evidenceIds: ['overall'],
  })),
  nextSteps: [{ title: '建议', body: '建议结合自身能力调整打法。', evidenceIds: ['identity'] }],
});
const response = (content = narrative(), finish = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }],
    }),
  );
describe('DeepSeek local service', () => {
  it('accepts seven real references in one paragraph while rejecting nonexistent facts', () => {
    const input = facts();
    input.facts.push(
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `round:${i}`,
        label: '逐轮记录',
        text: '已结算比赛',
      })),
    );
    const value = narrative();
    value.sections[0].evidenceIds = input.facts.slice(0, 7).map((f) => f.id);
    expect(validateNarrative(value, input).sections[0].evidenceIds).toHaveLength(7);
    value.sections[0].evidenceIds.push('not-real');
    expect(() => validateNarrative(value, input)).toThrow('INVALID_AI_RESPONSE');
  });
  it('uses the official model and endpoint, deduplicates in-flight work, caches validated output', async () => {
    const remote = vi.fn(async (url, init) => {
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('deepseek-flash');
      expect(body.thinking.type).toBe('disabled');
      expect(body.response_format.type).toBe('json_object');
      return response();
    });
    const service = createAiService({
      env: { DEEPSEEK_API_KEY: 'unit-test-only' },
      fetchImpl: remote,
      now: () => '2026-10-30T00:00:00.000Z',
    });
    const [a, b] = await Promise.all([service.generate(facts()), service.generate(facts())]);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.servedFromCache).toBe(true);
    expect((await service.generate(facts())).servedFromCache).toBe(true);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(a)).not.toContain('unit-test-only');
    expect(service.status()).toEqual({ configured: true, model: 'deepseek-flash' });
  });
  it('leaves offline play possible without calling a provider when no key exists', async () => {
    const remote = vi.fn();
    const service = createAiService({ env: {}, fetchImpl: remote });
    await expect(service.generate(facts())).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(remote).not.toHaveBeenCalled();
  });
  it('rejects invalid facts, duplicate ids and fabricated evidence references', () => {
    expect(() =>
      validateFacts({ ...facts(), facts: [...facts().facts, facts().facts[0]] }),
    ).toThrow('INVALID_REQUEST');
    const n = narrative();
    n.sections[0].evidenceIds = ['fabricated'];
    expect(() => validateNarrative(n, facts())).toThrow('INVALID_AI_RESPONSE');
  });
  it('does not display truncated or invalid provider output', async () => {
    const service = createAiService({
      env: { DEEPSEEK_API_KEY: 'unit-test-only' },
      fetchImpl: async () => response(narrative(), 'length'),
    });
    await expect(service.generate(facts())).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' });
  });
  it('maps billing and authentication failures without echoing upstream content', async () => {
    for (const [status, code] of [
      [401, 'AUTH_FAILED'],
      [402, 'PAYMENT_REQUIRED'],
      [429, 'RATE_LIMITED'],
    ]) {
      const s = createAiService({
        env: { DEEPSEEK_API_KEY: 'unit-test-only' },
        fetchImpl: async () => new Response('private upstream detail', { status }),
      });
      await expect(s.generate(facts())).rejects.toMatchObject({ code });
    }
  });
  it('rejects cross-origin and non-JSON requests and preserves UTF-8 split across chunks', async () => {
    const service = {
      status: () => ({ configured: true, model: 'deepseek-flash' }),
      generate: vi.fn(async (f) => ({ facts: f })),
    };
    const handler = createAiHandler(service);
    async function request(headers, body = '', method = 'POST', path = '/api/ai/career-report') {
      const bytes = Buffer.from(body);
      const req = Readable.from([bytes.subarray(0, 51), bytes.subarray(51)]);
      req.headers = { host: '127.0.0.1:4178', ...headers };
      req.method = method;
      let status;
      let result;
      const res = {
        writeHead: (c) => {
          status = c;
        },
        end: (x) => {
          result = JSON.parse(x);
        },
      };
      await handler(req, res, path);
      return { status, result };
    }
    expect(
      (
        await request(
          { 'content-type': 'application/json', origin: 'https://example.invalid' },
          JSON.stringify({ facts: facts() }),
        )
      ).status,
    ).toBe(403);
    expect((await request({ 'content-type': 'text/plain' }, '{}')).status).toBe(415);
    expect((await request({ 'content-type': 'application/json' }, '{}', 'GET')).status).toBe(405);
    const ok = await request(
      { 'content-type': 'application/json', origin: 'http://127.0.0.1:4178' },
      JSON.stringify({ facts: facts() }),
    );
    expect(ok.status).toBe(200);
    expect(ok.result.facts).toEqual(facts());
    expect(service.generate).toHaveBeenCalledTimes(1);
  });
});
