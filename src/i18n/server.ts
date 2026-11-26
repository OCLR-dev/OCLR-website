import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "./config";
import { appTranslator } from "./translate";
import { cache } from "react";
export const getAppTranslations = cache(async (locale?: Locale) => {
  if (locale)
    return appTranslator(
      await getTranslations({ locale, namespace: "ui" }),
      locale,
    );
  return appTranslator(await getTranslations("ui"), await getLocale());
});
