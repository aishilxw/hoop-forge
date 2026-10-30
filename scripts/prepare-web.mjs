import { cp, mkdir, rm, stat } from 'node:fs/promises';
const source = new URL('../dist/', import.meta.url);
await stat(new URL('index.html', source));
const target = new URL('../deploy/web/public/play/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log('网页版资源已更新至 deploy/web/public/play/');
