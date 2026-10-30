const RELAY = 'https://hoop-forge-interview-ai.artfulpika132.chatgpt.site';
const paths = new Set(['/api/ai/status', '/api/ai/coach', '/api/ai/career-report']);
const cookieName = 'hf_review_device';
const json = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function forwardGameAi(request, env, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const isStatus = url.pathname === '/api/ai/status';
  if (!paths.has(url.pathname) || request.method !== (isStatus ? 'GET' : 'POST')) return json('INVALID_REQUEST', 405);
  if (!isStatus && (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json'))) return json('INVALID_REQUEST', 403);
  if (!env.REVIEW_BUILD_ID) { console.error('AI_RELAY_CONFIG_MISSING'); return json('SHARED_UNAVAILABLE', 503); }
  let device = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!device || !/^[a-zA-Z0-9-]{16,100}$/.test(device)) device = crypto.randomUUID();
  let body;
  if (!isStatus) {
    const reader = request.body?.getReader();
    if (!reader) return json('INVALID_REQUEST', 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24576) { await reader.cancel(); return json('INVALID_REQUEST', 413); }
      chunks.push(value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  }
  try {
    const upstream = await fetchImpl(RELAY + url.pathname, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', 'x-hoop-forge-build': env.REVIEW_BUILD_ID, 'x-hoop-forge-device': device },
      ...(body ? { body } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(isStatus ? 4000 : 60000),
    });
    if (upstream.status >= 300 && upstream.status < 400) return json('SHARED_UNAVAILABLE', 503);
    if (!upstream.headers.get('content-type')?.includes('application/json')) { console.error('AI_RELAY_NON_JSON', upstream.status); return json('SHARED_UNAVAILABLE', 503); }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Set-Cookie': cookieName + '=' + device + '; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
      },
    });
  } catch (error) { console.error('AI_RELAY_FETCH_FAILED', error instanceof Error ? error.message : 'unknown'); return json('SHARED_UNAVAILABLE', 503); }
}
