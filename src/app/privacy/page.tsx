import type { Metadata } from "next";
import Link from "next/link";
import { privacyIntroduction, privacySections } from "../../../pages-demo/src/privacy-content";

export const metadata: Metadata = {
  title: "Privacy information | TampaBayBot",
  description: "How the TampaBayBot public preview handles housing-guide choices, questions, address searches, and outside services.",
};

export default function PrivacyPage() {
  return (
    <main id="main" lang="en" className="document-page about-page privacy-page content-width" tabIndex={-1}>
      <div className="page-intro">
        <h1>Privacy information</h1>
        <p>{privacyIntroduction}</p>
      </div>
      <div className="about-sections">
        {privacySections.map((section) => (
          <section id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
            <div>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            </div>
          </section>
        ))}
      </div>
      <p className="about-action"><Link href="/">Return to TampaBayBot</Link></p>
    </main>
  );
}
