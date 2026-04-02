import { createContext, useContext } from "react";
import type { Lang, TranslationKey } from "../lib/i18n";
import { t } from "../lib/i18n";

export const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  return {
    lang,
    setLang,
    t: (key: TranslationKey) => t(lang, key),
  };
}
