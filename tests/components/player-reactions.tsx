import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { EventPlayers } from "../../src/components/event-players";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/tournaments/[edition]/event-pages.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "zh-Hans";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance = "default";
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
const players = [
  {
    id: 969001,
    name: "Rookie Preview",
    team: "Synthetic Team",
    captain: false,
    rank: 18200,
    pp: 5320,
    bio: "合成预览选手。点击名字下方的 ＋，查看优先表情和完整候选列表。",
    messages: [{ author: "Preview", text: "试试按按钮、跪拜和 HD 图标。" }],
  },
  {
    id: 969002,
    name: "Hidden Preview",
    team: "Synthetic Team",
    captain: false,
    rank: 21000,
    pp: 5100,
    bio: "这是第二位合成选手，可以核对表情是否独立保存。",
    messages: [],
  },
];
createRoot(document.getElementById("root")!).render(
  <AppRouterContext value={router}>
    <SearchParamsContext value={params}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "en" ? en : locale === "zh-Hant" ? hant : hans}
        timeZone="UTC"
      >
        <main
          className="themed-site"
          style={{
            minHeight: "100vh",
            padding: "24px",
            maxWidth: "1400px",
            margin: "auto",
          }}
        >
          <h1>选手贴表情预览</h1>
          <p className="muted">
            合成资料 · 使用实际选手列表与表情组件 · 选择保存在此浏览器
          </p>
          <nav
            aria-label="Preview settings"
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
            <a href="?theme=light">浅色</a>
            <a href="?theme=dark">深色</a>
            <a href="?locale=en">English</a>
            <a href="?locale=zh-Hant">繁體中文</a>
          </nav>
          <EventPlayers
            edition={params.get("edition") || "synthetic-969"}
            players={players}
            preview
          />
        </main>
      </NextIntlClientProvider>
    </SearchParamsContext>
  </AppRouterContext>,
);
