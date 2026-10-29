import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { ChessCanvas } from "../../src/app/games/ocl-chess/workspace";
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <style>{`body{margin:0;font-family:system-ui} .site-shell{display:flex;flex-direction:column} .site-shell>main{flex:1;min-height:0}`}</style>
    <div
      className="site-shell"
      style={{ background: "#090c17", color: "#f4f3fc" }}
    >
      <header
        style={{
          height: 64,
          flexShrink: 0,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
        }}
      >
        OCLR
      </header>
      <main>
        <ChessCanvas />
      </main>
      <footer className="site-footer">Footer</footer>
    </div>
  </NextIntlClientProvider>,
);
