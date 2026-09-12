import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import test from "node:test";
import imageSize, { imageSize as namedImageSize } from "image-size";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

test("Vinext resolves the local adapter and both used export forms work", () => {
  const vinextRequire = createRequire(import.meta.resolve("vinext"));
  const resolved = vinextRequire.resolve("image-size");
  assert.equal(resolved, fileURLToPath(new URL("../vendor/image-dimensions/index.js", import.meta.url)));
  assert.equal(imageSize, namedImageSize);
  assert.deepEqual(imageSize(png), { width: 1, height: 1, type: "png" });
  assert.deepEqual(imageSize(gif), { width: 1, height: 1, type: "gif" });
});

test("the lockfile installs the original local package without an upstream parser tarball", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/image-size"].resolved, "vendor/image-dimensions");
  assert.equal(lock.packages["vendor/image-dimensions"].name, "@parcelprivateer/image-dimensions");
  assert.equal(lock.packages["node_modules/vinext/node_modules/image-size"], undefined);
  for (const metadata of Object.values(lock.packages)) {
    assert.doesNotMatch(metadata.resolved ?? "", /registry\.npmjs\.org\/image-size\//);
  }
});

test("PNG/GIF reads respect a Uint8Array view's offset and bounds", () => {
  for (const fixture of [png, gif]) {
    const wrapped = new Uint8Array(fixture.length + 32).fill(255);
    wrapped.set(fixture, 11);
    assert.deepEqual(imageSize(wrapped.subarray(11, 11 + fixture.length)), imageSize(fixture));
    const headerLength = fixture === png ? 33 : 13;
    assert.throws(() => imageSize(wrapped.subarray(11, 11 + headerLength - 1)), /Invalid (PNG|GIF) header/);
  }
});

test("both GIF versions use the logical screen dimensions", () => {
  const legacy = Buffer.from(gif);
  legacy[4] = 55;
  legacy.writeUInt16LE(320, 6);
  legacy.writeUInt16LE(240, 8);
  assert.deepEqual(imageSize(legacy), { width: 320, height: 240, type: "gif" });
});

test("all truncated fixed headers fail instead of reading backing-buffer bytes", () => {
  for (const [fixture, headerLength] of [[png, 33], [gif, 13]]) {
    for (let length = 0; length < headerLength; length += 1) {
      assert.throws(() => imageSize(fixture.subarray(0, length)), TypeError);
    }
  }
});

test("PNG requires an immediate, correctly sized IHDR", () => {
  const wrongLength = Buffer.from(png);
  wrongLength.writeUInt32BE(0, 8);
  assert.throws(() => imageSize(wrongLength), /Invalid PNG header/);
  const wrongType = Buffer.from(png);
  wrongType.write("IDAT", 12);
  assert.throws(() => imageSize(wrongType), /Invalid PNG header/);
});

test("zero, excessive axis sizes, and excessive pixel counts are rejected", () => {
  for (const [width, height] of [[0, 1], [1, 0], [100_001, 1], [1, 100_001], [10_001, 10_000], [0xffffffff, 0xffffffff]]) {
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(width, 16);
    oversized.writeUInt32BE(height, 20);
    assert.throws(() => imageSize(oversized), /dimensions exceed/);
  }
  const zeroGif = Buffer.from(gif);
  zeroGif.writeUInt16LE(0, 6);
  assert.throws(() => imageSize(zeroGif), /dimensions exceed/);
  const boundary = Buffer.from(png);
  boundary.writeUInt32BE(100_000, 16);
  boundary.writeUInt32BE(1000, 20);
  assert.deepEqual(imageSize(boundary), { width: 100_000, height: 1000, type: "png" });
});

test("input type and byte budgets are enforced before reading headers", () => {
  for (const input of [null, undefined, "private input", {}, [], new ArrayBuffer(33), new DataView(new ArrayBuffer(33))]) {
    assert.throws(() => imageSize(input), /must be a Uint8Array/);
  }
  const oversized = new Uint8Array(32 * 1024 * 1024 + 1);
  oversized.set(png);
  assert.throws(() => imageSize(oversized), /32 MiB limit/);
});

test("unsupported JPEG, WebP, SVG, and arbitrary inputs return generic errors", () => {
  const fixtures = [Buffer.from([255, 216, 255]), Buffer.from("RIFFxxxxWEBP"), Buffer.from('<svg width="1" height="1">private-input</svg>')];
  for (const fixture of fixtures) {
    assert.throws(() => imageSize(fixture), { message: "Unsupported image format: only PNG and GIF headers are supported" });
  }
});

test("zero-length ICNS/JXL/HEIF advisory inputs terminate with explicit rejection", async () => {
  // Run through Vinext's installed resolution in a bounded thread so a future
  // reintroduction of the looping upstream parser fails without hanging CI.
  const moduleUrl = pathToFileURL(createRequire(import.meta.resolve("vinext")).resolve("image-size")).href;
  const workerSource = `
    import { parentPort, workerData } from "node:worker_threads";
    const { imageSize } = await import(workerData);
    const icns = Buffer.from("69636e73000000106963703000000000", "hex");
    // JXL: valid signature and ftyp followed by a zero-length jxlp box.
    const jxl = Buffer.from("0000000c4a584c200d0a870a00000014667479706a786c20000000006a786c20000000006a786c7000000000", "hex");
    // HEIF: ftyp/meta/iprp/ipco contain a zero-length ispe with dimensions.
    const heif = Buffer.from("0000001466747970686569630000000068656963000000306d6574610000000000000024697072700000001c6970636f0000000069737065000000000000000100000001", "hex");
    const errors = [icns, jxl, heif].map(input => {
      try { imageSize(input); return "accepted"; }
      catch (error) { return error.message; }
    });
    parentPort.postMessage(errors);
  `;
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), {
    workerData: moduleUrl,
    resourceLimits: { maxOldGenerationSizeMb: 16 },
  });
  try {
    const errors = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Image parser did not terminate within two seconds")), 2000);
      worker.once("message", (result) => { clearTimeout(timer); resolve(result); });
      worker.once("error", (error) => { clearTimeout(timer); reject(error); });
      worker.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Image parser worker exited ${code} without a result`)); });
    });
    assert.deepEqual(errors, Array(3).fill("Unsupported image format: only PNG and GIF headers are supported"));
  } finally {
    await worker.terminate();
  }
});
