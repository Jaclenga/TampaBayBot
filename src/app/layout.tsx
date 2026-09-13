import type { Metadata } from "next";
import { Header, Footer } from "@/components/site-shell";
import { LocaleProvider } from "@/lib/i18n/locale";
import "./globals.css";
// Every document receives a new CSP nonce from the Worker.
export const dynamic = "force-dynamic";
const title = "TampaBayBot | Tampa Bay housing information";
const description =
  "Housing resources, zoning, permits, and public development records for Tampa Bay residents, including Tampa, St. Petersburg, and Clearwater, with links to official sources.";
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "TampaBayBot", title, description },
  twitter: { card: "summary", title, description },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <Header />
          {children}
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
