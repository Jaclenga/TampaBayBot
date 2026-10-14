/* eslint-disable @next/next/no-html-link-for-pages -- This page is built by Vite, not Next. */
import { privacyIntroduction, privacySections } from "./privacy-content";

export default function PrivacyPage() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="site-wrap privacy-page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="TampaBayBot home">TampaBayBot</a>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/privacy/" aria-current="page">Privacy information</a>
          <a href="https://github.com/Jaclenga/TampaBayBot" target="_blank" rel="noopener noreferrer">About the project</a>
        </nav>
      </header>
      <main id="main" className="privacy-main">
        <div className="privacy-heading">
          <p className="eyebrow">Public preview</p>
          <h1>Privacy information</h1>
          <p>{privacyIntroduction}</p>
        </div>
        <nav className="privacy-toc" aria-label="On this page">
          <strong>On this page</strong>
          <ul>{privacySections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
        </nav>
        <div className="privacy-sections">
          {privacySections.map((section) => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
          </section>)}
        </div>
        <p className="privacy-return"><a href="/">Return to TampaBayBot</a></p>
      </main>
      <footer className="site-footer"><span>TampaBayBot · An open source civic information project</span><nav aria-label="Footer navigation"><a href="/">Home</a><a href="/privacy/" aria-current="page">Privacy information</a><a href="https://github.com/Jaclenga/TampaBayBot/security/policy" target="_blank" rel="noopener noreferrer">Report a security concern</a></nav><span>Independent and unofficial</span></footer>
    </div>
  </>;
}
