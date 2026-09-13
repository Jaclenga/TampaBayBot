"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { en as english } from "@/lib/i18n/en";
import { useLocale, usePageTitle } from "@/lib/i18n/locale";
export default function AboutContent({ modelNotice }: { modelNotice: string }) {
  const { locale, copy: en } = useLocale();
  usePageTitle(en.about.title);
  const privacyNotice = modelNotice === english.modelPrivacy.enabled ? en.modelPrivacy.enabled : en.modelPrivacy.disabled;
  return (
    <main id="main" lang={locale} className="document-page about-page content-width">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {en.sourcePage.back}
      </Link>
      <div className="page-intro">
        <h1>{en.about.title}</h1>
        <p>{en.about.intro}</p>
      </div>
      <div className="about-sections">
        {[
          {
            title: en.about.approachTitle,
            text: en.about.approach,
            id: "approach",
          },
          {
            title: en.about.privacyTitle,
            text: `${en.about.privacy} ${privacyNotice}`,
            id: "privacy",
          },
          {
            title: en.about.accessTitle,
            text: en.about.access,
            id: "accessibility",
          },
          {
            title: en.about.languageTitle,
            text: en.about.language,
            id: "language",
          },
          {
            title: en.about.limitsTitle,
            text: en.about.limits,
            id: "limitations",
          },
        ].map((section) => (
          <section id={section.id} key={section.id}>
            <div>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="about-action">
        <Link href="/" className="primary-button">
          {en.nav.ask}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
