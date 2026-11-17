import { test, expect } from '@playwright/test';

test('real API timings distinguish small talk from factual retrieval without exposing input', async ({ request }) => {
  const greeting = await request.post('/api/ask', { data: { question: 'hello', jurisdictionId: 'tampa' } });
  expect(greeting.ok()).toBe(true);
  expect((await greeting.json()).answer).toBe('Hi! What would you like to know about Tampa?');
  const greetingTiming = greeting.headers()['server-timing'];
  expect(greetingTiming).toContain('total;dur=');
  expect(greetingTiming).not.toContain('retrieval;');
  expect(greetingTiming).not.toContain('hello');
  expect(greeting.headers()['cache-control']).toBe('no-store');

  const factual = await request.post('/api/ask', { data: { question: 'Hello, where can I find rental assistance in Tampa?', jurisdictionId: 'tampa' } });
  expect(factual.ok()).toBe(true);
  expect((await factual.json()).evidence.length).toBeGreaterThan(0);
  expect(factual.headers()['server-timing']).toContain('retrieval;dur=');
  expect(factual.headers()['server-timing']).not.toContain('Tampa');
});

test('invalid structured lookups expose bounded timing names and preserve private response headers', async ({ request }) => {
  for (const path of ['/api/location', '/api/property', '/api/development']) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBe(400);
    expect(response.headers()['server-timing']).toMatch(/^total;dur=\d+\.\d+$/);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
});
