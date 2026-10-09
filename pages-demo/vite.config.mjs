import { rm } from "node:fs/promises";

const directoryOnly = process.env.VITE_DIRECTORY_ONLY === "true";
const pageTitle = directoryOnly
  ? "TampaBayBot — Housing assistance directory preview"
  : "TampaBayBot — Local answers, linked to sources";
const pageDescription = directoryOnly
  ? "Browse Tampa Bay housing assistance contacts and official source links without AI or an account."
  : "Explore Tampa Bay housing resources, zoning, permits, and public development records with source links.";

const config = {
  root: "pages-demo",
  esbuild: { jsx: "automatic" },
  plugins: [{
    name: "tampabaybot-page-metadata",
    transformIndexHtml(html) {
      return html
        .replace("__TAMPABAYBOT_PAGE_TITLE__", pageTitle)
        .replace("__TAMPABAYBOT_PAGE_DESCRIPTION__", pageDescription);
    },
    async closeBundle() {
      // The directory preview has no API Functions, so omit their routing file.
      if (directoryOnly) {
        await rm(new URL("./dist/_routes.json", import.meta.url), { force: true });
      }
    },
  }],
  build: { outDir: "dist", emptyOutDir: true },
};

export default config;
