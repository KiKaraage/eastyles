import { useCallback } from "react";
import { i18nService } from "../services/i18n/service";

/**
 * React hook for internationalization
 */
export function useI18n() {
  const t = useCallback((key: string, substitutions?: string | string[]) => {
    return i18nService.t(key, substitutions);
  }, []);

  const hasMessage = useCallback((key: string) => {
    return i18nService.hasMessage(key);
  }, []);

  const getCurrentLocale = useCallback(() => {
    return i18nService.getCurrentLocale();
  }, []);

  const getAvailableLocales = useCallback(() => {
    return i18nService.getAvailableLocales();
  }, []);

  return {
    t,
    hasMessage,
    getCurrentLocale,
    getAvailableLocales,
  };
}
