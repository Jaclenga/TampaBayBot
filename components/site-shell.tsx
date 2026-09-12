import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { en } from "@/lib/i18n/en";

export function Header() {
  return (
    <>
      <a className="skip-link" href="#main">
        {en.common.skip}
      </a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label={en.labels.home}>
          {en.brand}
        </Link>
        <nav aria-label={en.labels.navigation}>
          <Link href="/">{en.nav.ask}</Link>
          <Link href="/sources">{en.nav.sources}</Link>
          <Link href="/about">{en.nav.about}</Link>
        </nav>
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
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
