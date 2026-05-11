import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOVA AI｜指标异动分析工作台",
  description: "从模糊业务问题出发，逐步澄清指标口径、分析维度和数据需求。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
