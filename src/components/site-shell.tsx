"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale";
import { useSyncExternalStore } from 'react';

const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function Header() {
  const { locale, setLocale, copy: en } = useLocale();
  const ready = useSyncExternalStore(subscribeToReady, clientReady, serverReady);
  return (
    <>
      <a className="skip-link" href="#main">
        {en.common.skip}
      </a>
      <header className="site-header" lang={locale}>
        <Link className="brand" href="/" aria-label={en.labels.home}>
          {en.brand}
        </Link>
        <nav aria-label={en.labels.navigation}>
          <Link href="/">{en.nav.ask}</Link>
          <Link href="/sources">{en.nav.sources}</Link>
          <Link href="/about">{en.nav.about}</Link>
        </nav>
        <label className="small" htmlFor="interface-language">
          {en.language.label}
          <select id="interface-language" disabled={!ready} value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'es')}>
            <option value="en" lang="en">English</option>
            <option value="es" lang="es">Español</option>
          </select>
        </label>
      </header>
    </>
  );
}
export function Footer() {
  const { locale, copy: en } = useLocale();
  return (
    <footer className="site-footer" lang={locale}>
      <p>{en.footer.statement}</p>
      <nav className="footer-bottom" aria-label={en.footer.navigation}>
        <Link href="/about#accessibility">{en.footer.access}</Link>
        <Link href="/about#privacy">{en.footer.privacy}</Link>
        <Link href="/sources">{en.nav.sources}</Link>
        <Link href="/evaluation">{en.nav.evaluation}</Link>
      </nav>
    </footer>
  );
}
export function SourceLink({
  url,
  children,
  className = "",
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { copy: en } = useLocale();
  if (!/^https:\/\//i.test(url)) return <span>{children}</span>;
  return (
    <a
      className={className}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only"> ({en.common.opens})</span>
    </a>
  );
}
