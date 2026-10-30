import { mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const out = 'release/hoop-forge-v0.3.4';
await rm(out, { recursive: true, force: true });
await rm('release/hoop-forge-v0.3.4.zip', { force: true });
await mkdir(out, { recursive: true });
await cp('dist', `${out}/dist`, { recursive: true });
await cp('scripts/release/start.mjs', `${out}/start.mjs`);
await cp('scripts/release/ai.mjs', `${out}/ai.mjs`);
await cp('scripts/release/ai-prompts.mjs', `${out}/ai-prompts.mjs`);
await cp('scripts/release/shared-ai.mjs', `${out}/shared-ai.mjs`);
await cp('scripts/release/review.config.json', `${out}/review.config.json`);
await cp('docs/qa/shared-ai-v034.md', `${out}/共享AI验收.md`);
await cp('docs/qa/shared-ai-v034-results.json', `${out}/shared-ai-v034-results.json`);
await cp('docs/ai-setup.md', `${out}/AI接入说明.md`);
await cp('docs/qa/ai-v031.md', `${out}/ai-v031.md`);
await cp('docs/qa/ai-v032.md', `${out}/ai-v032.md`);
await cp('docs/qa/presentation-v033.md', `${out}/presentation-v033.md`);
for (const name of [
  'ai-v032-evaluation.json',
  'ai-evaluation-cases.json',
  'ai-v031-prompt.txt',
  'ai-v032-coach-usage.json',
  'ai-v032-report-usage.json',
  'v2-independent.md',
  'simulation-v03-metrics.json',
])
  await cp('docs/qa/' + name, out + '/' + name);
await writeFile(`${out}/start.command`, '#!/bin/sh\ncd "$(dirname "$0")"\nnode start.mjs\n', {
  mode: 0o755,
});
await writeFile(`${out}/start.bat`, '@echo off\r\ncd /d "%~dp0"\r\nnode start.mjs\r\npause\r\n');
await writeFile(
  `${out}/README-开始游玩.md`,
  '# 篮球融合生涯\n\n需要 Node.js 24 LTS。解压后执行 node start.mjs，在浏览器打开 http://127.0.0.1:4178。无需 npm install。基础游戏无需联网；面试试玩版已连接共享AI，联网后即可使用生涯作者和AI教练，无需配置模型密钥。共享额度和有效期详见AI接入说明.md。\nmacOS 可运行 start.command，Windows 可运行 start.bat。\n存档保存在浏览器，请使用固定地址和端口，并定期导出备份。此包是简化篮球模拟，不是真实比赛预测。30支NBA球队，521人当前逐队名单，中文盲选与82场赛制。446名球员评分映射自2K26第三方归档，75名仍为标记估计。名单尚未完成NBA官方全量对账，当前仅供试玩审核。生涯报告在游戏内阅读，JSON只用于备份。每季8场自动重点场，支持四节战术、轮换、回合可视化、罚球犯规与体能。v0.2存档迁移保留历史；更早的短赛季存档保留可备份。\n',
);
await cp('docs/2k26-mapping.md', `${out}/数据来源与限制.md`);
await cp('docs/qa/current-status.md', `${out}/试玩验收记录.md`);
await writeFile(
  `${out}/VERSION.json`,
  JSON.stringify({ version: '0.3.4', node: '24', builtAt: new Date().toISOString() }, null, 2),
);
execFileSync('zip', ['-qr', 'hoop-forge-v0.3.4.zip', 'hoop-forge-v0.3.4'], { cwd: 'release' });
const zip = await readFile('release/hoop-forge-v0.3.4.zip');
await writeFile(
  'release/SHA256SUMS.txt',
  `${createHash('sha256').update(zip).digest('hex')}  hoop-forge-v0.3.4.zip\n`,
);
console.log('Packaged release/hoop-forge-v0.3.4.zip');
