import { test, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSharedAiService,
  loadDeviceId,
  loadSharedConfig,
} from '../../scripts/release/shared-ai.mjs';
test('a downloaded client forwards only game payload and a revocable review identifier', async () => {
  let calls = 0;
  const service = createSharedAiService({
    config: { url: 'https://review.example', buildId: 'public-review-build' },
    deviceId: 'device-1234567890123456',
    fetchImpl: async (url, init) => {
      calls++;
      expect(url).toBe('https://review.example/api/ai/coach');
      expect(init.headers['x-hoop-forge-build']).toBe('public-review-build');
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.body).toBe(JSON.stringify({ context: { version: 1 } }));
      expect(init.redirect).toBe('error');
      return Response.json({ advice: { headline: '测试' }, servedFromCache: false });
    },
  });
  const a = service.coach({ version: 1 }),
    b = service.coach({ version: 1 });
  expect(await a).toEqual(await b);
  expect(calls).toBe(1);
  expect(service.metrics().providerCalls).toBe(null);
});
test('shared service failures explain shared access instead of asking reviewers for a model key', async () => {
  for (const code of ['DEMO_EXPIRED', 'DEMO_LIMIT_REACHED', 'DEMO_ACCESS_DENIED']) {
    const s = createSharedAiService({
      config: { url: 'https://review.example', buildId: 'public-review-build' },
      deviceId: 'device-1234567890123456',
      fetchImpl: async () => Response.json({ error: code }, { status: 403 }),
    });
    await expect(s.generate({})).rejects.toMatchObject({ code });
  }
});
test('HTML sign-in and network failures cannot masquerade as model output', async () => {
  const s = createSharedAiService({
    config: { url: 'https://review.example', buildId: 'public-review-build' },
    deviceId: 'device-1234567890123456',
    fetchImpl: async () => new Response('<html>sign in</html>'),
  });
  await expect(s.generate({})).rejects.toMatchObject({ code: 'SHARED_UNAVAILABLE' });
  expect((await s.status()).available).toBe(false);
});
test('installation identifiers persist without any API credential in their file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hf-review-test-'));
  try {
    const file = join(dir, '.device.json'),
      a = await loadDeviceId(file);
    expect(await loadDeviceId(file)).toBe(a);
    expect(Object.keys(JSON.parse(await readFile(file, 'utf8')))).toEqual(['deviceId']);
    const config = join(dir, 'review.config.json');
    await writeFile(
      config,
      JSON.stringify({
        version: 1,
        url: 'https://review.example/',
        buildId: 'public-review-build',
      }),
    );
    expect((await loadSharedConfig(config)).url).toBe('https://review.example');
    await writeFile(
      config,
      JSON.stringify({ version: 1, url: 'http://127.0.0.1/', buildId: 'public-review-build' }),
    );
    await expect(loadSharedConfig(config)).rejects.toThrow('Invalid shared AI configuration');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
