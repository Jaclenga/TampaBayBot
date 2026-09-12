import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, lstat, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
export const GITLEAKS_VERSION = "8.30.1";
const release = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}`;
const checksumsSha256 = "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae";
const archives = {
  "win32-x64": ["windows_x64.zip", "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e"],
  "win32-arm64": ["windows_arm64.zip", "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f"],
  "linux-x64": ["linux_x64.tar.gz", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"],
  "linux-arm64": ["linux_arm64.tar.gz", "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"],
  "darwin-x64": ["darwin_x64.tar.gz", "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"],
  "darwin-arm64": ["darwin_arm64.tar.gz", "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"],
};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// Validate every existing ancestor before mkdir/write/extraction. Junctions,
// symlinks and existing hard-linked output files cannot redirect tool writes.
export async function assertWorkspaceOutput(target, kind = "file") {
  const absolute = resolve(target);
  assert.ok(absolute.startsWith(`${project}${sep}`), "Scanner output must stay inside this workspace");
  let cursor = project;
  const segments = relative(project, absolute).split(sep);
  for (const [index, segment] of segments.entries()) {
    cursor = resolve(cursor, segment);
    try {
      const stat = await lstat(cursor);
      assert.ok(!stat.isSymbolicLink(), "Scanner output ancestors must not be links or junctions");
      assert.equal(await realpath(cursor), cursor, "Scanner output ancestors must not redirect writes");
      if (index < segments.length - 1 || kind === "directory") assert.ok(stat.isDirectory(), "Scanner output ancestors must be directories");
      else assert.ok(stat.isFile() && stat.nlink === 1, "Scanner output must be an ordinary, unlinked file");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return absolute;
}

async function verifiedDownload(path, url, expectedHash) {
  await assertWorkspaceOutput(path);
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (bytes) assert.equal(sha256(bytes), expectedHash, "Cached Gitleaks artifact checksum mismatch");
  else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    assert.ok(response.ok, "Official Gitleaks download failed");
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      assert.ok(length <= 64 * 1024 * 1024, "Gitleaks download exceeds the allowed size");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    assert.equal(sha256(bytes), expectedHash, "Official Gitleaks artifact checksum mismatch");
    await writeFile(path, bytes);
  }
  return bytes;
}

export async function setupGitleaks() {
  const selected = archives[`${process.platform}-${process.arch}`];
  assert.ok(selected, "No pinned Gitleaks release is configured for this platform");
  const [suffix, archiveHash] = selected;
  const archiveName = `gitleaks_${GITLEAKS_VERSION}_${suffix}`;
  const directory = resolve(project, "work", "tooling", `gitleaks-${GITLEAKS_VERSION}-${process.platform}-${process.arch}`);
  await assertWorkspaceOutput(directory, "directory");
  await mkdir(directory, { recursive: true });
  const checksums = await verifiedDownload(resolve(directory, "checksums.txt"), `${release}/gitleaks_${GITLEAKS_VERSION}_checksums.txt`, checksumsSha256);
  assert.ok(checksums.toString("utf8").split(/\r?\n/).some(line => line.trim().split(/\s+/).join(" ") === `${archiveHash} ${archiveName}`), "Archive hash must also match the official checksum file");
  const archive = resolve(directory, archiveName);
  await verifiedDownload(archive, `${release}/${archiveName}`, archiveHash);
  const executableName = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";
  const executable = resolve(directory, executableName);
  await assertWorkspaceOutput(executable);
  // Extract only the named executable from a verified archive into a fixed,
  // project-local directory. Never execute an unverified scanner from PATH.
  const extract = spawnSync("tar", ["-xf", archive, "-C", directory, executableName], { encoding: "utf8", windowsHide: true });
  assert.equal(extract.status, 0, "Could not extract the verified Gitleaks executable");
  if (process.platform !== "win32") await chmod(executable, 0o755);
  const version = spawnSync(executable, ["version"], { encoding: "utf8", windowsHide: true });
  assert.equal(version.status, 0, "Could not run the verified Gitleaks executable");
  assert.equal(version.stdout.trim(), GITLEAKS_VERSION, "Unexpected Gitleaks version");
  return { executable, version: GITLEAKS_VERSION, archive: archiveName, archiveSha256: archiveHash, binarySha256: sha256(await readFile(executable)), release: `${release}/${archiveName}`, checksumSource: `${release}/gitleaks_${GITLEAKS_VERSION}_checksums.txt`, checksumsSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { executable, ...receipt } = await setupGitleaks();
  console.log(JSON.stringify({ ...receipt, executable: executable.slice(project.length + 1).replaceAll("\\", "/") }, null, 2));
}
