import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, classifyHealth, dateLabel, getAiUsage, postJson } from '../src/api.ts';

test('frontend identifies an empty or degraded source library', () => {
  assert.equal(classifyHealth({ status: 'no_evidence', corpus: { status: 'no_evidence', chunks: 0 }, ready: false }), 'empty');
  assert.equal(classifyHealth({ status: 'degraded', corpus: { status: 'degraded', chunks: 12 }, ready: false }), 'degraded');
  assert.equal(classifyHealth({ status: 'degraded', corpus: { status: 'ready', chunks: 12 }, ready: false }), 'ready');
  assert.equal(classifyHealth({ status: 'ready' }), 'unavailable');
});

test('date-only source metadata keeps its calendar day in Eastern time', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(dateLabel('2026-10-09'), 'Oct 9, 2026');
    assert.equal(dateLabel('invalid'), 'Date not supplied');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('frontend posts JSON to its own API and reads the Worker result', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, '/api/ask');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { question: 'Where can I get help?', jurisdictionId: 'tampa' });
      return Response.json({ status: 'answered', answer: 'See [E1].', evidence: [{ id: 'E1' }] });
    };
    const answer = await postJson('/api/ask', { question: 'Where can I get help?', jurisdictionId: 'tampa' });
    assert.equal(answer.status, 'answered');
    assert.equal(answer.evidence[0].id, 'E1');
  } finally {
    globalThis.fetch = previous;
  }
});

test('frontend surfaces API errors and unreadable responses', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: 'Too many requests.' }, { status: 429 });
    await assert.rejects(postJson('/api/ask', {}), /Too many requests/);
    globalThis.fetch = async () => new Response('upstream failure', { status: 502 });
    await assert.rejects(postJson('/api/ask', {}), /unreadable response/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('frontend reads server usage and retains structured quota response', async () => {
  const previous = globalThis.fetch;
  const ai = { remaining: 0, limit: 15, used: 15, resetAt: '2026-10-10T00:00:00.000Z', available: false, reason: 'ai_visitor_limit' };
  try {
    globalThis.fetch = async (path) => {
      if (path === '/api/usage') return Response.json({ ai });
      return Response.json({ error: 'Daily AI limit reached.', code: 'ai_visitor_limit', aiUsage: ai }, { status: 429 });
    };
    assert.deepEqual(await getAiUsage(), ai);
    await assert.rejects(postJson('/api/ask', {}), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, 'ai_visitor_limit');
      assert.deepEqual(error.aiUsage, ai);
      return true;
    });
    globalThis.fetch = async () => Response.json({ ai: { ...ai, remaining: null, used: null } });
    assert.equal((await getAiUsage()).remaining, null);
  } finally {
    globalThis.fetch = previous;
  }
});
