import { readFile, writeFile } from 'node:fs/promises';
import { SYSTEM_PROMPT, compactFacts } from './release/ai-prompts.mjs';
import { usageMetrics, validateNarrative } from './release/ai.mjs';
const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw Error('DEEPSEEK_API_KEY is required');
const cases = JSON.parse(await readFile('docs/qa/ai-evaluation-cases.json', 'utf8'));
const baseline = await readFile('docs/qa/ai-v031-prompt.txt', 'utf8');
const onlyOptimized = process.env.AI_EVAL_MODE === 'optimized';
const records = onlyOptimized
  ? JSON.parse(await readFile('docs/qa/ai-v032-evaluation.json', 'utf8')).records.filter(
      (r) => r.mode === 'baseline',
    )
  : [];
for (const item of cases) {
  for (const mode of onlyOptimized ? ['optimized'] : ['baseline', 'optimized']) {
    const prompt = mode === 'baseline' ? baseline : SYSTEM_PROMPT;
    const wire =
      mode === 'baseline'
        ? item.facts
        : { scope: item.facts.scope, facts: compactFacts(item.facts) };
    const started = performance.now();
    let usage = null;
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-flash',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify(wire) },
          ],
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          temperature: 0.6,
          max_tokens: mode === 'baseline' ? 4000 : 2500,
          stream: false,
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (!r.ok) throw Error('HTTP_' + r.status);
      const data = await r.json();
      usage = usageMetrics(data, performance.now() - started);
      if (data.choices?.[0]?.finish_reason !== 'stop') throw Error('TRUNCATED');
      const narrative = validateNarrative(JSON.parse(data.choices[0].message.content), item.facts);
      const bodyChars = [...narrative.sections, ...narrative.nextSteps].reduce(
        (s, p) => s + p.body.length,
        0,
      );
      records.push({ case: item.id, mode, ok: true, usage, bodyChars, narrative });
    } catch (error) {
      records.push({ case: item.id, mode, ok: false, usage, error: error.code ?? error.message });
    }
    console.log(
      JSON.stringify(records.at(-1), [
        'case',
        'mode',
        'ok',
        'usage',
        'inputTokens',
        'outputTokens',
        'totalTokens',
        'cachedInputTokens',
        'durationMs',
        'bodyChars',
        'error',
      ]),
    );
    await writeFile(
      'docs/qa/ai-v032-evaluation.json',
      JSON.stringify(
        {
          method:
            'Two fixed game snapshots, same official model and non-thinking settings. Baseline uses v0.3.1 prompt/full facts; optimized uses shorter prompt/compact facts. Four paid calls, no automatic retries. Small sample; schema/reference validation is not semantic accuracy proof. Provider cache affects billing and timing.',
          records,
        },
        null,
        2,
      ) + '\n',
    );
  }
}
