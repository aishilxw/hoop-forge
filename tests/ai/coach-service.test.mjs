import { describe, expect, it, vi } from 'vitest';
import {
  createAiService,
  validateCoachAdvice,
  validateCoachContext,
  usageMetrics,
} from '../../scripts/release/ai.mjs';
const context = () => ({
  version: 1,
  matchId: 'test-match',
  completedQuarters: 1,
  facts: ['situation', 'player', 'own', 'opponent', 'previous', 'rotation', 'scouting'].map(
    (id) => ({ id, label: id, text: '游戏已发生事实' }),
  ),
  focusCandidates: [
    { id: 'original-player', name: '自己' },
    { id: 'teammate', name: '队友' },
  ],
});
const advice = () => ({
  headline: '稳住局面',
  analysis: [{ text: '先观察已完成一节的失误', evidenceIds: ['own'] }],
  plan: {
    offense: 'pickAndRoll',
    defense: 'protectPaint',
    pace: 'normal',
    rotation: 'balanced',
    originalMinutes: 32,
    focusIndex: 1,
  },
  reason: '依靠组织创造机会',
  tradeoff: '护筐会让出外线',
});
const response = (value) =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
        prompt_cache_hit_tokens: 40,
      },
    }),
  );
describe('coach provider validation and metering', () => {
  it('maps a bounded focus slot to an actual teammate and rejects illegal plans', () => {
    expect(validateCoachAdvice(advice(), context()).plan.focusPlayerId).toBe('teammate');
    for (const patch of [
      { originalMinutes: 48 },
      { focusIndex: 2 },
      { focusIndex: -1 },
      { offense: 'winAutomatically' },
    ]) {
      const x = advice();
      Object.assign(x.plan, patch);
      expect(() => validateCoachAdvice(x, context())).toThrow('INVALID_AI_RESPONSE');
    }
  });
  it('rejects completed games and invented references', () => {
    expect(() => validateCoachContext({ ...context(), completedQuarters: 4 })).toThrow(
      'INVALID_REQUEST',
    );
    const a = advice();
    a.analysis[0].evidenceIds = ['future'];
    expect(() => validateCoachAdvice(a, context())).toThrow('INVALID_AI_RESPONSE');
  });
  it('compacts material, uses its own prompt, meters one call and reuses the result', async () => {
    const remote = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBe(1300);
      expect(body.thinking.type).toBe('disabled');
      const wire = JSON.parse(body.messages[1].content);
      expect(wire.nextQuarter).toBe(2);
      expect(wire.focusCandidates).toEqual(['自己', '队友']);
      expect(wire.matchId).toBeUndefined();
      expect(wire.facts.own).toBe('游戏已发生事实');
      return response(advice());
    });
    const s = createAiService({ env: { DEEPSEEK_API_KEY: 'unit-test-only' }, fetchImpl: remote });
    const a = await s.coach(context());
    expect(a.metrics.totalTokens).toBe(300);
    expect(a.metrics.cachedInputTokens).toBe(40);
    expect(a.advice.plan.focusPlayerId).toBe('teammate');
    expect((await s.coach(context())).servedFromCache).toBe(true);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(s.metrics().providerCalls).toBe(1);
    expect(s.metrics().serverCacheHits).toBe(1);
    expect(JSON.stringify(s.metrics())).not.toContain('unit-test-only');
  });
  it('preserves billed usage on rejected output and releases the busy slot after failure', async () => {
    const remote = vi
      .fn()
      .mockResolvedValueOnce(response({ bad: true }))
      .mockImplementation(async () => response(advice()));
    const s = createAiService({ env: { DEEPSEEK_API_KEY: 'unit-test-only' }, fetchImpl: remote });
    await expect(s.coach(context())).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' });
    expect(s.metrics().events[0].metrics.totalTokens).toBe(300);
    expect((await s.coach(context())).advice.headline).toBe('稳住局面');
  });
  it('does not label missing usage as zero tokens', () => {
    expect(usageMetrics({}, 24)).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedInputTokens: null,
      durationMs: 24,
    });
  });
});
