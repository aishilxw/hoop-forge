import { createHash } from 'node:crypto';
import {
  SYSTEM_PROMPT,
  COACH_PROMPT,
  REPORT_PROMPT_VERSION,
  COACH_PROMPT_VERSION,
  compactFacts,
} from './ai-prompts.mjs';
export { SYSTEM_PROMPT };
export const PROMPT_VERSION = REPORT_PROMPT_VERSION;
export class AiError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const string = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
function factList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64)
    throw new AiError('INVALID_REQUEST', 400);
  const seen = new Set();
  return value.map((f) => {
    if (
      !f ||
      !string(f.id, 80) ||
      !/^[a-z0-9:-]+$/.test(f.id) ||
      seen.has(f.id) ||
      !string(f.label, 80) ||
      !string(f.text, 1600)
    )
      throw new AiError('INVALID_REQUEST', 400);
    seen.add(f.id);
    return { id: f.id, label: f.label, text: f.text };
  });
}
export function validateFacts(value) {
  if (!value || value.version !== 1 || !string(value.scope, 80))
    throw new AiError('INVALID_REQUEST', 400);
  const facts = factList(value.facts),
    ids = new Set(facts.map((f) => f.id));
  if (!['overall', 'identity', 'boundary'].every((id) => ids.has(id)))
    throw new AiError('INVALID_REQUEST', 400);
  return { version: 1, scope: value.scope, facts };
}
function references(value, ids) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > ids.size ||
    value.some((id) => !ids.has(id))
  )
    throw new AiError('INVALID_AI_RESPONSE');
  return [...new Set(value)];
}
export function validateNarrative(value, facts) {
  const ids = new Set(facts.facts.map((f) => f.id));
  const section = (s) => {
    if (!s || !string(s.title, 80) || !string(s.body, 1600))
      throw new AiError('INVALID_AI_RESPONSE');
    return { title: s.title, body: s.body, evidenceIds: references(s.evidenceIds, ids) };
  };
  if (
    !value ||
    !string(value.title, 100) ||
    !Array.isArray(value.sections) ||
    value.sections.length < 3 ||
    value.sections.length > 6 ||
    !Array.isArray(value.nextSteps) ||
    value.nextSteps.length < 1 ||
    value.nextSteps.length > 3
  )
    throw new AiError('INVALID_AI_RESPONSE');
  return {
    title: value.title,
    sections: value.sections.map(section),
    nextSteps: value.nextSteps.map(section),
  };
}
export function validateCoachContext(value) {
  if (
    !value ||
    value.version !== 1 ||
    !string(value.matchId, 160) ||
    !Number.isInteger(value.completedQuarters) ||
    value.completedQuarters < 0 ||
    value.completedQuarters > 3 ||
    !Array.isArray(value.focusCandidates) ||
    value.focusCandidates.length > 7
  )
    throw new AiError('INVALID_REQUEST', 400);
  const facts = factList(value.facts),
    ids = new Set(facts.map((f) => f.id));
  if (
    !['situation', 'player', 'own', 'opponent', 'previous', 'rotation', 'scouting'].every((id) =>
      ids.has(id),
    )
  )
    throw new AiError('INVALID_REQUEST', 400);
  const seen = new Set();
  const focusCandidates = value.focusCandidates.map((c) => {
    if (!c || !string(c.id, 120) || !string(c.name, 80) || seen.has(c.id))
      throw new AiError('INVALID_REQUEST', 400);
    seen.add(c.id);
    return { id: c.id, name: c.name };
  });
  return {
    version: 1,
    matchId: value.matchId,
    completedQuarters: value.completedQuarters,
    facts,
    focusCandidates,
  };
}
export function validateCoachAdvice(value, context) {
  const p = value?.plan;
  const valid =
    p &&
    ['balanced', 'attackPaint', 'perimeter', 'pickAndRoll'].includes(p.offense) &&
    ['balanced', 'protectPaint', 'pressurePerimeter'].includes(p.defense) &&
    ['slow', 'normal', 'fast'].includes(p.pace) &&
    ['balanced', 'starters', 'bench'].includes(p.rotation) &&
    [26, 32, 38].includes(p.originalMinutes) &&
    (p.focusIndex === null ||
      (Number.isInteger(p.focusIndex) &&
        p.focusIndex >= 0 &&
        p.focusIndex < context.focusCandidates.length));
  if (
    !valid ||
    !string(value.headline, 80) ||
    !string(value.reason, 500) ||
    !string(value.tradeoff, 500) ||
    !Array.isArray(value.analysis) ||
    value.analysis.length < 1 ||
    value.analysis.length > 3
  )
    throw new AiError('INVALID_AI_RESPONSE');
  const ids = new Set(context.facts.map((f) => f.id));
  const analysis = value.analysis.map((a) => {
    if (!a || !string(a.text, 500)) throw new AiError('INVALID_AI_RESPONSE');
    return { text: a.text, evidenceIds: references(a.evidenceIds, ids) };
  });
  const plan = {
    offense: p.offense,
    defense: p.defense,
    pace: p.pace,
    rotation: p.rotation,
    originalMinutes: p.originalMinutes,
  };
  if (p.focusIndex !== null) plan.focusPlayerId = context.focusCandidates[p.focusIndex].id;
  return {
    headline: value.headline,
    analysis,
    plan,
    reason: value.reason,
    tradeoff: value.tradeoff,
  };
}
export function usageMetrics(data, durationMs) {
  const number = (x) => (Number.isInteger(x) && x >= 0 ? x : null);
  return {
    inputTokens: number(data?.usage?.prompt_tokens),
    outputTokens: number(data?.usage?.completion_tokens),
    totalTokens: number(data?.usage?.total_tokens),
    cachedInputTokens: number(
      data?.usage?.prompt_cache_hit_tokens ?? data?.usage?.prompt_tokens_details?.cached_tokens,
    ),
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}
export function createAiService({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  clock = () => performance.now(),
} = {}) {
  const model = env.DEEPSEEK_MODEL || 'deepseek-flash',
    key = env.DEEPSEEK_API_KEY?.trim();
  const cache = new Map(),
    events = [];
  let pending = null,
    providerCalls = 0,
    serverCacheHits = 0,
    inFlightReuse = 0;
  async function run(kind, input) {
    const coach = kind === 'coach';
    const context = coach ? validateCoachContext(input) : validateFacts(input);
    if (!key) throw new AiError('KEY_MISSING', 503);
    const promptVersion = coach ? COACH_PROMPT_VERSION : REPORT_PROMPT_VERSION;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ kind, promptVersion, model, context }))
      .digest('hex');
    if (cache.has(fingerprint)) {
      serverCacheHits++;
      return { ...cache.get(fingerprint), servedFromCache: true };
    }
    if (pending) {
      if (pending.fingerprint === fingerprint) {
        inFlightReuse++;
        return { ...(await pending.promise), servedFromCache: true };
      }
      throw new AiError('BUSY', 429);
    }
    const promise = (async () => {
      const started = clock();
      let metrics = null,
        outcome = 'UPSTREAM_ERROR';
      providerCalls++;
      try {
        const wire = coach
          ? {
              nextQuarter: context.completedQuarters + 1,
              facts: compactFacts(context),
              focusCandidates: context.focusCandidates.map((c) => c.name),
            }
          : { scope: context.scope, facts: compactFacts(context) };
        const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: coach ? COACH_PROMPT : SYSTEM_PROMPT },
              { role: 'user', content: JSON.stringify(wire) },
            ],
            response_format: { type: 'json_object' },
            thinking: { type: 'disabled' },
            max_tokens: coach ? 1300 : 2500,
            temperature: coach ? 0.3 : 0.6,
            stream: false,
          }),
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok)
          throw new AiError(
            { 401: 'AUTH_FAILED', 402: 'PAYMENT_REQUIRED', 429: 'RATE_LIMITED' }[response.status] ??
              'UPSTREAM_ERROR',
            response.status === 429 ? 429 : 502,
          );
        const data = await response.json();
        metrics = usageMetrics(data, clock() - started);
        if (data.choices?.[0]?.finish_reason !== 'stop') throw new AiError('INVALID_AI_RESPONSE');
        let parsed;
        try {
          parsed = JSON.parse(data.choices[0].message.content);
        } catch {
          throw new AiError('INVALID_AI_RESPONSE');
        }
        const record = {
          model,
          generatedAt: now(),
          fingerprint,
          promptVersion,
          metrics,
          servedFromCache: false,
          ...(coach
            ? { context, advice: validateCoachAdvice(parsed, context) }
            : { facts: context, narrative: validateNarrative(parsed, context) }),
        };
        cache.set(fingerprint, record);
        if (cache.size > 48) cache.delete(cache.keys().next().value);
        outcome = 'ok';
        return record;
      } catch (error) {
        outcome =
          error instanceof AiError
            ? error.code
            : error?.name === 'TimeoutError' || error?.name === 'AbortError'
              ? 'TIMEOUT'
              : 'UPSTREAM_ERROR';
        throw error instanceof AiError ? error : new AiError(outcome);
      } finally {
        events.push({
          kind,
          promptVersion,
          model,
          at: now(),
          outcome,
          metrics: metrics ?? usageMetrics(null, clock() - started),
        });
        if (events.length > 100) events.shift();
      }
    })();
    pending = { fingerprint, promise };
    try {
      return await promise;
    } finally {
      if (pending?.fingerprint === fingerprint) pending = null;
    }
  }
  return {
    status: () => ({ configured: Boolean(key), model }),
    generate: (input) => run('report', input),
    coach: (input) => run('coach', input),
    metrics: () => ({ providerCalls, serverCacheHits, inFlightReuse, events: [...events] }),
  };
}
export function createAiHandler(service) {
  const send = (res, code, data) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  };
  return async (req, res, pathname) => {
    if (!pathname.startsWith('/api/')) return false;
    const allowedOrigins = new Set([
      'http://127.0.0.1:4178',
      'http://localhost:4178',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
    if (
      !['127.0.0.1:4178', 'localhost:4178'].includes(req.headers.host) ||
      (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    ) {
      send(res, 403, { error: 'FORBIDDEN' });
      return true;
    }
    if (pathname === '/api/ai/status' && req.method === 'GET') {
      send(res, 200, await service.status());
      return true;
    }
    if (pathname === '/api/ai/usage' && req.method === 'GET') {
      send(res, 200, service.metrics());
      return true;
    }
    if (!['/api/ai/career-report', '/api/ai/coach'].includes(pathname)) {
      send(res, 404, { error: 'NOT_FOUND' });
      return true;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return true;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      send(res, 415, { error: 'INVALID_REQUEST' });
      return true;
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 49152) throw new AiError('INVALID_REQUEST', 413);
        chunks.push(chunk);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new AiError('INVALID_REQUEST', 400);
      }
      const result =
        pathname === '/api/ai/coach'
          ? await service.coach(input?.context)
          : await service.generate(input?.facts);
      send(res, 200, result);
    } catch (error) {
      send(res, error instanceof AiError ? error.status : 500, {
        error: error instanceof AiError ? error.code : 'UPSTREAM_ERROR',
      });
    }
    return true;
  };
}
