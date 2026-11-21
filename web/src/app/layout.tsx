import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rule pact 赛约 | AI 自动裁判与 Monad 公证",
  description:
    "Rule pact 赛约：由 AI 拟定可审计规则，由自动裁判执行，由 Monad 为比赛结果做不可篡改公证。"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

