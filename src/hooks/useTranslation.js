import { useCallback } from "react";
import { useTranslation as useI18nextTranslation } from "react-i18next";
import { useI18nContext } from "../components/I18nProvider.jsx";
import { RTL_LANGUAGES } from "../i18n/index.js";

/**
 * useTranslation
 *
 * A thin wrapper around react-i18next's `useTranslation` that also exposes
 * the language-switching helpers from `I18nProvider`.
 *
 * Usage:
 * ```jsx
 * const { t, currentLanguage, changeLanguage, supportedLanguages } = useTranslation();
 *
 * // Translate a key
 * t('common.loading')                      // → "Loading..."
 *
 * // Interpolation
 * t('connect.successMessage', { address }) // → "Successfully connected to G..."
 *
 * // Namespace (defaults to 'translation')
 * t('nav.overview')                        // → "Overview"
 *
 * // Switch language
 * changeLanguage('es')
 * ```
 *
 * @param {string} [ns='translation'] - Optional i18next namespace override
 * @returns {{
 *   t: import('i18next').TFunction,
 *   i18n: import('i18next').i18n,
 *   currentLanguage: string,
 *   changeLanguage: (code: string) => Promise<void>,
 *   supportedLanguages: Array<{ code: string, label: string, nativeLabel: string }>,
 *   isRTL: boolean,
 *   ready: boolean,
 * }}
 */
export function useTranslation(ns = "translation") {
  const { t, i18n, ready } = useI18nextTranslation(ns);
  const { currentLanguage, changeLanguage, supportedLanguages, isRTL } =
    useI18nContext();

  /**
   * Safe translate — returns the key itself when a translation is missing,
   * which prevents blank UI during hot reloads or missing keys in dev.
   */
  const safeT = useCallback(
    (key, options) => {
      const result = t(key, options);
      return result ?? key;
    },
    [t],
  );

  /**
   * Pluralize helper (#107).
   * Delegates to i18next count interpolation:
   *   tPlural('transactions.count', 3) → uses key 'transactions.count_one' or 'transactions.count_other'
   *
   * @param {string} key
   * @param {number} count
   * @param {Record<string, unknown>} [extra]  Additional interpolation values
   */
  const tPlural = useCallback(
    (key, count, extra = {}) => safeT(key, { count, ...extra }),
    [safeT],
  );

  /**
   * Format a number according to the current locale (#107).
   * @param {number} value
   * @param {Intl.NumberFormatOptions} [opts]
   */
  const formatNumber = useCallback(
    (value, opts = {}) => {
      try {
        return new Intl.NumberFormat(currentLanguage, opts).format(value);
      } catch {
        return String(value);
      }
    },
    [currentLanguage],
  );

  /**
   * Format a date according to the current locale (#107).
   * @param {Date | string | number} date
   * @param {Intl.DateTimeFormatOptions} [opts]
   */
  const formatDate = useCallback(
    (date, opts = { dateStyle: "medium" }) => {
      try {
        return new Intl.DateTimeFormat(currentLanguage, opts).format(new Date(date));
      } catch {
        return String(date);
      }
    },
    [currentLanguage],
  );

  /** true if the active language is RTL (#107) */
  const isRTLActive = isRTL || RTL_LANGUAGES.has(currentLanguage);

  return {
    t: safeT,
    tPlural,
    formatNumber,
    formatDate,
    i18n,
    ready,
    currentLanguage,
    changeLanguage,
    supportedLanguages,
    isRTL: isRTLActive,
  };
}

export default useTranslation;
