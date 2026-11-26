"use client";
import {
  ensureAppearanceStylesheet,
  activateAppearanceStylesheet,
} from "@/lib/appearance-styles";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  inheritedAppearance,
  type AppearanceScope,
} from "@/lib/appearance-scope";
import {
  appearanceCookie,
  isPublicAppearance,
  readVisitorAppearance,
  type Appearance,
} from "@/lib/preferences";
const Context = createContext<{
  appearance: Appearance;
  inheritedDefault: Appearance;
  edition: boolean;
  preference: Appearance | undefined;
  choose: (value: Appearance | undefined) => void;
} | null>(null);
export function AppearanceProvider({
  siteDefault,
  scopes,
  initialPreference,
  children,
}: {
  siteDefault: Appearance;
  scopes: AppearanceScope[];
  initialPreference?: Appearance;
  children: ReactNode;
}) {
  const path = usePathname() ?? "",
    query = useSearchParams() ?? new URLSearchParams();
  const inherited = inheritedAppearance(path, query, scopes, siteDefault);
  const [choice, setChoice] = useState<{
    value: Appearance | undefined;
    serverValue: Appearance | undefined;
  } | null>(null);
  const candidate =
    choice && choice.serverValue === initialPreference
      ? choice.value
      : initialPreference;
  const preference = isPublicAppearance(candidate) ? candidate : undefined;
  const desiredAppearance = readVisitorAppearance(
    preference,
    inherited.appearance,
  );
  const [appearance, setAppearance] = useState(desiredAppearance);
  useLayoutEffect(() => {
    let cancelled = false;
    void ensureAppearanceStylesheet(desiredAppearance)
      .then(() => {
        if (cancelled) return;
        activateAppearanceStylesheet(desiredAppearance);
        setAppearance(desiredAppearance);
      })
      .catch(() => {
        /* Retain the loaded appearance; the next navigation retries. */
      });
    return () => {
      cancelled = true;
    };
  }, [desiredAppearance]);
  // SSR sets the same attribute. Client navigation updates it before paint,
  // without turning an inherited tournament default into a personal cookie.
  useLayoutEffect(() => {
    // Stylesheet loading applies the selector only after the CSS is ready.
    // Discard legacy season cookies without persisting an inherited edition theme.
    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${appearanceCookie}=`));
    if (
      cookie &&
      !isPublicAppearance(cookie.slice(appearanceCookie.length + 1))
    )
      document.cookie = `${appearanceCookie}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [appearance, path]);
  return (
    <Context.Provider
      value={{
        appearance,
        inheritedDefault: inherited.appearance,
        edition: inherited.edition,
        preference,
        choose: (value) =>
          setChoice({
            value: isPublicAppearance(value) ? value : undefined,
            serverValue: initialPreference,
          }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAppearanceScope = () => useContext(Context);
