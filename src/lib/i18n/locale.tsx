"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { en } from './en';
import { es } from './es';

type Locale = 'en' | 'es';
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  return { ...context, copy: context.locale === 'es' ? es : en };
}

export function usePageTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}
