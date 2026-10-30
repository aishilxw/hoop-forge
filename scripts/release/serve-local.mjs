import { fileURLToPath } from 'node:url';
process.env.HOOP_FORGE_DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
await import('./start.mjs');
