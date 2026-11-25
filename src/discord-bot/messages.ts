import { createTranslator } from "next-intl";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
import { appTranslator } from "../i18n/translate";
import type { Locale } from "../i18n/config";

const catalogs = { en, "zh-Hans": hans, "zh-Hant": hant };
export function botTranslator(locale: Locale) {
  const t = createTranslator({ locale, messages: catalogs[locale].ui });
  return appTranslator(
    (key, values) => t(key as keyof typeof en.ui, values),
    locale,
  );
}
