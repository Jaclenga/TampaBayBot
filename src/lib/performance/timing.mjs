// Request-local measurements only. Never accepts labels derived from resident input.
const STAGES = new Set(['total', 'conversation', 'intent', 'scope', 'retrieval', 'candidates', 'ranking', 'answer', 'citations', 'model', 'external', 'usage']);
export function createTimings(clock = () => performance.now()) {
  const values = new Map();
  function start(stage) {
    if (!STAGES.has(stage)) throw new TypeError('Unknown performance stage.');
    const began = clock();
    return () => values.set(stage, (values.get(stage) ?? 0) + Math.max(0, clock() - began));
  }
  return {
    start,
    snapshot: () => Object.fromEntries(values),
    header: () => [...values].map(([stage, duration]) => `${stage};dur=${duration.toFixed(2)}`).join(', '),
  };
}
export function measure(timings, stage, operation) {
  if (!timings) return operation();
  const stop = timings.start(stage);
  try { return operation(); } finally { stop(); }
}
export async function measureAsync(timings, stage, operation) {
  if (!timings) return operation();
  const stop = timings.start(stage);
  try { return await operation(); } finally { stop(); }
}

export function createRequestTiming() {
  const timings = createTimings();
  const stop = timings.start('total');
  return { timings, respond(response) {
    stop();
    response.headers.set('Server-Timing', timings.header());
    return response;
  } };
}
