import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createAiService, createAiHandler } from './ai.mjs';
import { loadSharedConfig, loadDeviceId, createSharedAiService } from './shared-ai.mjs';
try {
  process.loadEnvFile(new URL('./.env.local', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const root = process.env.HOOP_FORGE_DIST
  ? resolve(process.env.HOOP_FORGE_DIST)
  : fileURLToPath(new URL('./dist/', import.meta.url));
const shared = await loadSharedConfig(new URL('./review.config.json', import.meta.url));
const aiService =
  shared && process.env.HOOP_FORGE_AI_MODE !== 'local'
    ? createSharedAiService({
        config: shared,
        deviceId: await loadDeviceId(new URL('./.hoop-forge-device.json', import.meta.url)),
      })
    : createAiService();
const handleAi = createAiHandler(aiService);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (await handleAi(req, res, pathname)) return;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!(await stat(target)).isFile()) throw Error();
    res.writeHead(200, {
      'Content-Type': mime[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(target));
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('Not found');
  }
});
server.requestTimeout = 70000;
server.on('error', (err) => {
  console.error('启动失败：端口4178可能已被占用。', err.message);
  process.exitCode = 1;
});
server.listen(4178, '127.0.0.1', () =>
  console.log('篮球融合生涯：http://127.0.0.1:4178\n保持此窗口开启。按 Ctrl+C 退出。'),
);
