import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  base: './',
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
  server: { proxy: { '/api': 'http://127.0.0.1:4178' } },
});
