# Internationalization platform

The dashboard keeps authored translations separate from review state. Bundled JSON in `src/i18n` remains the runtime source, while the review workspace uses versioned `stellar-locale-catalog` documents.

Open **Translations** in the desktop sidebar to compare a locale with English, find missing entries, run pseudo-localization, and import or export review catalogs. Imported data is validated and saved only to local browser storage; it is never machine-translated or published automatically.

Catalog documents have `format: "stellar-locale-catalog"` and `version: 1`. Import rejects other formats. Future readers must reject unknown versions or migrate them deliberately. The contract carries namespaces, key metadata, interpolation schemas, fallback locale, and update time.

Validation checks missing and unused keys, variable mismatches, unsafe HTML/event handlers, overly long translations, and plural-key shape. Dynamic key calls are reported by `extractTranslationKeys`; extensions register catalog fragments through `LocaleRegistry` so their ownership is explicit.

Use `createLocaleFormatter` or `useLocaleFormatter` for numbers, XLM/asset amounts, dates, duration, lists, relative time, and bidi-isolated text. This avoids browser-locale drift and keeps RTL mixed-script values safe.

Review data should not contain secrets. UI errors report validation categories rather than catalog contents. Export only catalogs intended for reviewers. If a bad import is saved, replace it with a clean catalog in the review UI or clear the `stellar:i18n-catalog:<locale>` local-storage key.
