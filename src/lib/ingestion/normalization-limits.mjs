/** Limits apply to the serialized evidence, including repeated locator metadata. */
export const DEFAULT_NORMALIZATION_LIMITS = Object.freeze({
  maxInputBytes: 30 * 1024 * 1024,
  maxNormalizedBytes: 16 * 1024 * 1024,
  maxUnits: 10_000,
  maxLinks: 5_000,
  maxChunks: 20_000,
  maxChunkBytes: 32 * 1024 * 1024,
  maxDepth: 64,
  maxNodes: 1_000_000,
});

export class NormalizationLimitError extends Error {
  constructor(limit) {
    super(`Source normalization exceeds ${limit}`);
    this.name = 'NormalizationLimitError';
    this.code = 'normalization_limit_exceeded';
    this.limit = limit;
  }
}

export function normalizationLimits(overrides = {}) {
  const limits = { ...DEFAULT_NORMALIZATION_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Object.hasOwn(DEFAULT_NORMALIZATION_LIMITS, name) || !Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid normalization limit: ${name}`);
  }
  return limits;
}

/** Count JSON bytes before allocating the serialized form. Traversal itself is bounded. */
export function jsonBytes(value, maximum, limits = DEFAULT_NORMALIZATION_LIMITS) {
  let bytes = 0, nodes = 0;
  const ancestors = new Set();
  const add = amount => { bytes += amount; if (bytes > maximum) throw new NormalizationLimitError('serialized byte limit'); };
  const string = value => {
    add(2);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) add(2);
      else if (code < 32) add(6);
      else if (code < 128) add(1);
      else if (code < 2048) add(2);
      else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { add(4); i++; }
      else if (code >= 0xd800 && code <= 0xdfff) add(6);
      else add(3);
    }
  };
  const visit = (item, depth) => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw new NormalizationLimitError('object traversal limit');
    if (typeof item === 'string') return string(item);
    if (item === null || item === undefined) return add(4);
    if (typeof item === 'boolean') return add(item ? 4 : 5);
    if (typeof item === 'number') return add(Number.isFinite(item) ? String(item).length : 4);
    if (typeof item !== 'object' || ancestors.has(item)) throw new TypeError('Normalized evidence must be acyclic JSON data');
    ancestors.add(item);
    add(2);
    let count = 0;
    if (Array.isArray(item)) {
      for (const child of item) { if (count++) add(1); visit(child, depth + 1); }
    } else {
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new TypeError('Normalized evidence must contain plain JSON objects');
      for (const key of Object.keys(item)) {
        if (item[key] === undefined) continue;
        if (count++) add(1);
        string(key); add(1); visit(item[key], depth + 1);
      }
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  return bytes;
}

export function validateInput(bytes, limits) {
  if (Buffer.byteLength(bytes) > limits.maxInputBytes) throw new NormalizationLimitError('input byte limit');
}

/** Incremental collection accounting prevents repeated text/metadata expansion. */
export class NormalizationBudget {
  constructor(limits = {}) {
    this.limits = normalizationLimits(limits);
    this.bytes = 24; // {"units":[],"links":[]}, plus optional separators.
    this.units = 0;
    this.links = 0;
  }
  reserve(value) {
    this.bytes += jsonBytes(value, this.limits.maxNormalizedBytes - this.bytes, this.limits) + 1;
    if (this.bytes > this.limits.maxNormalizedBytes) throw new NormalizationLimitError('normalized byte limit');
  }
  unit(value) {
    if (++this.units > this.limits.maxUnits) throw new NormalizationLimitError('unit count limit');
    this.reserve(value);
    return value;
  }
  link(value) {
    if (++this.links > this.limits.maxLinks) throw new NormalizationLimitError('link count limit');
    this.reserve(value);
    return value;
  }
}

/** Also use at injection boundaries before hashing, JSON serialization or chunking. */
export function validateNormalized(normalized, { limits: overrides } = {}) {
  const limits = normalizationLimits(overrides);
  if (!normalized || !Array.isArray(normalized.units) || (normalized.links !== undefined && !Array.isArray(normalized.links))) throw new TypeError('Invalid normalized evidence');
  if (normalized.units.length > limits.maxUnits) throw new NormalizationLimitError('unit count limit');
  if ((normalized.links?.length ?? 0) > limits.maxLinks) throw new NormalizationLimitError('link count limit');
  if (normalized.units.some(unit => !unit || typeof unit.text !== 'string')) throw new TypeError('Invalid normalized evidence unit');
  jsonBytes(normalized, limits.maxNormalizedBytes, limits);
  return normalized;
}
