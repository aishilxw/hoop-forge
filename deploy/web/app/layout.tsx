import type { Metadata } from 'next';
export const metadata: Metadata = { title: '篮球融合生涯 · Hoop Forge', description: '创造自己的NBA球员，经历完整赛季，战术观战与AI生涯故事。' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
