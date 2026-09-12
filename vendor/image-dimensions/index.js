// An original, deliberately narrow replacement for Vinext's image-size calls.
// Inspect fixed PNG/GIF headers only; never decode or walk image containers.
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_DIMENSION = 100_000;
const MAX_PIXELS = 100_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function matches(input, offset, values) {
  return values.every((value, index) => input[offset + index] === value);
}

function dimensions(width, height, type) {
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new RangeError("Image dimensions exceed the supported limits");
  }
  return { width, height, type };
}

export function imageSize(input) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("Image input must be a Uint8Array");
  }
  if (input.byteLength > MAX_BYTES) {
    throw new RangeError("Image input exceeds the 32 MiB limit");
  }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

  if (matches(input, 0, PNG_SIGNATURE)) {
    // The 13-byte IHDR must immediately follow the signature, including CRC.
    if (input.byteLength < 33 || view.getUint32(8) !== 13 || !matches(input, 12, [73, 72, 68, 82])) {
      throw new TypeError("Invalid PNG header");
    }
    return dimensions(view.getUint32(16), view.getUint32(20), "png");
  }

  if (matches(input, 0, [71, 73, 70, 56]) && (input[4] === 55 || input[4] === 57) && input[5] === 97) {
    // GIF87a/GIF89a share a seven-byte logical screen descriptor.
    if (input.byteLength < 13) throw new TypeError("Invalid GIF header");
    return dimensions(view.getUint16(6, true), view.getUint16(8, true), "gif");
  }

  throw new TypeError("Unsupported image format: only PNG and GIF headers are supported");
}

export default imageSize;
