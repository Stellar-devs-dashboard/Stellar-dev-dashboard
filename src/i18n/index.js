import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./en.json";
import es from "./es.json";
import zh from "./zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English",  nativeLabel: "English",  dir: "ltr" },
  { code: "es", label: "Spanish",  nativeLabel: "Español",  dir: "ltr" },
  { code: "zh", label: "Chinese",  nativeLabel: "中文",      dir: "ltr" },
];

/** Languages that flow right-to-left (#107). */
export const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "stellar-dashboard-lang";

const resources = {
  en: { translation: en },
  es: { translation: es },
  zh: { translation: zh },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "translation",

    detection: {
      // Order of sources to detect language from
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },

    interpolation: {
      // React already handles XSS escaping
      escapeValue: false,
    },

    // Enable pluralization support (#107).
    // Keys with _one / _other suffixes are selected automatically.
    // Example: t('transactions.count', { count: 3 }) → "3 笔交易"
    pluralSeparator: "_",

    react: {
      // Wait for all translations to load before rendering
      useSuspense: false,
    },
  });

export default i18n;
