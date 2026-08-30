import { useMemo } from 'react';
import { createLocaleFormatter } from '../lib/i18n/formatters';
import { useI18nContext } from '../components/I18nProvider';

export function useLocaleFormatter() {
  const { currentLanguage } = useI18nContext();
  return useMemo(() => createLocaleFormatter(currentLanguage), [currentLanguage]);
}
