import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoop Forge · 共享 AI 服务",
  description: "篮球融合生涯面试试玩 AI 服务",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
