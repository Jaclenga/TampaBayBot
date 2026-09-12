import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { sanitizeReportValue } from "../scripts/sanitize-report.mjs";
import { createSourceRelease, emptySourceRegistry, omitUnavailableMarkdownLinks } from "../scripts/package-release.mjs";
import { verifySourceRelease } from "../scripts/verify-source-release.mjs";

test("report sanitization removes machine prefixes without changing results or public URLs", () => {
  const root = path.resolve("work", "synthetic-owner", "project");
  const result = sanitizeReportValue({ configFile: path.join(root, "playwright.config.ts"), nested: ["C:\\Users\\fixture-owner\\cache\\file", "/home/fixture-owner/report", "https://www.tampa.gov/housing"], passed: 13, failed: 1, ratio: null }, root);
  assert.equal(result.configFile, `<workspace>${path.sep}playwright.config.ts`);
  assert.deepEqual(result.nested, ["<home>\\cache\\file", "<home>/report", "https://www.tampa.gov/housing"]);
  assert.equal(result.passed, 13);
  assert.equal(result.failed, 1);
  assert.equal(result.ratio, null);
});

test("source-only registry cannot claim downloaded evidence or retained snapshot provenance", () => {
  const source = { source_id: "fixture", canonical_url: "https://example.gov/source", fetch_url: "https://example.gov/feed", retrieval_date: "2026-09-12", content_hash: "oldhash", raw_path: "data/raw/fixture/old.html", status: "available", next_step: { url: "https://example.gov/next" } };
  const [empty] = emptySourceRegistry([source]);
  assert.equal(empty.status, "unavailable");
  assert.equal(empty.retrieval_date, null);
  assert.equal(empty.content_hash, undefined);
  assert.equal(empty.raw_path, undefined);
  assert.equal(empty.fetch_url, source.fetch_url);
  assert.deepEqual(empty.next_step, source.next_step);
  assert.equal(source.status, "available");
});

test("packaged Markdown keeps working and external links while labeling omitted historical artifacts", () => {
  const markdown = "[guide](LLM.md#setup) [report](../evaluation/results/responses-old.json) [City](https://www.tampa.gov/) [top](#top) ![old UI](screenshots/old.png)";
  const result = omitUnavailableMarkdownLinks(markdown, "docs/EXAMPLE.md", new Set(["docs/LLM.md"]));
  assert.match(result, /\[guide\]\(LLM.md#setup\)/);
  assert.match(result, /report \(development artifact omitted from source-only release\)/);
  assert.match(result, /\[City\]\(https:\/\/www.tampa.gov\/\)/);
  assert.match(result, /\[top\]\(#top\)/);
  assert.doesNotMatch(result, /screenshots\/old.png|responses-old.json/);
});

test("source packaging excludes snapshots, history and secrets, and refuses replacement or escaped output", async () => {
  const work = path.resolve("work");
  await mkdir(work, { recursive: true });
  const root = await mkdtemp(path.join(work, "release-fixture-"));
  try {
    for (const directory of ["app", "components", "lib", "scripts", "tests", "vendor", "build", "evaluation/suite/results", "evaluation/results", "data/raw", ".openai", ".git"]) await mkdir(path.join(root, directory), { recursive: true });
    await writeFile(path.join(root, "data/sources.json"), JSON.stringify([{ source_id: "fixture", status: "available", raw_path: "data/raw/example.html" }]));
    await writeFile(path.join(root, "data/raw/example.html"), "external snapshot sentinel");
    await writeFile(path.join(root, "data/chunks.json"), JSON.stringify([{ text: "external excerpt sentinel" }]));
    await writeFile(path.join(root, "evaluation/results/latest.json"), JSON.stringify({ metrics: { proxy: { passed: 1, total: 1 }, human: { score: null } } }));
    await writeFile(path.join(root, "evaluation/results/responses.json"), "external response sentinel");
    await writeFile(path.join(root, ".env"), "private fixture sentinel");
    await writeFile(path.join(root, ".openai/hosting.json"), "owner fixture sentinel");
    await writeFile(path.join(root, "scripts/example.mjs"), "export const originalSoftware = true;\r\n");
    const result = await createSourceRelease({ root, output: "work/releases/alpha" });
    const output = path.join(root, result.output);
    const manifest = JSON.parse(await readFile(path.join(output, "SOURCE_RELEASE_MANIFEST.json"), "utf8"));
    assert.equal(manifest.external_snapshots_included, false);
    assert.equal(manifest.git_history_included, false);
    assert.equal(await readFile(path.join(output, "scripts/example.mjs"), "utf8"), "export const originalSoftware = true;\n");
    assert.equal(await readFile(path.join(output, ".gitattributes"), "utf8"), "* text=auto eol=lf\n");
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "data/chunks.json"), "utf8")), []);
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "evaluation/results/responses.json"), "utf8")), []);
    for (const excluded of [".env", ".openai/hosting.json", ".git/config", "data/raw/example.html"]) await assert.rejects(readFile(path.join(output, excluded)), { code: "ENOENT" });
    for (const file of manifest.files) assert.doesNotMatch(await readFile(path.join(output, file.path), "utf8"), /external (?:snapshot|excerpt|response) sentinel|private fixture sentinel|owner fixture sentinel/);
    assert.equal((await verifySourceRelease(output)).status, "passed");
    await writeFile(path.join(output, "scripts/example.mjs"), "export const originalSoftware = null;\n");
    await assert.rejects(verifySourceRelease(output), /Release (?:content|size) changed/);
    await writeFile(path.join(output, "scripts/example.mjs"), "export const originalSoftware = true;\n");
    await writeFile(path.join(output, ".env"), "new private fixture sentinel");
    await assert.rejects(verifySourceRelease(output), /Unreviewed file/);
    await rm(path.join(output, ".env"));
    assert.equal((await verifySourceRelease(output)).status, "passed");
    await assert.rejects(createSourceRelease({ root, output: "work/releases/alpha" }), /already exists/);
    await assert.rejects(createSourceRelease({ root, output: "../escaped-release" }), /beneath work\/releases/);
  } finally {
    assert.ok(root.startsWith(work + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
