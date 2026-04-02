import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Locale, MessageKey, MessageVars, messages } from './messages';

const STORAGE_KEY = 'routine-battle-locale';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);

  if (storedLocale === 'ko' || storedLocale === 'en') {
    return storedLocale;
  }

  return window.navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

function resolveMessage(locale: Locale, key: MessageKey) {
  return key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }

    return undefined;
  }, messages[locale]);
}

function applyVars(template: string, vars?: MessageVars) {
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) {
      return '';
    }

    return String(vars[name]);
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback((key: MessageKey, vars?: MessageVars) => {
    const resolved = resolveMessage(locale, key) ?? resolveMessage('en', key);
    const template = typeof resolved === 'string' ? resolved : key;
    return applyVars(template, vars);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }

  return context;
}
