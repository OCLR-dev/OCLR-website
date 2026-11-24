import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { LiruChat } from "../../src/components/liru-chat";
function Fixture() {
  const [edition, setEdition] = useState("cup-a");
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <button onClick={() => setEdition("cup-b")}>Switch season</button>
      <LiruChat key={edition} edition={edition} />
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
