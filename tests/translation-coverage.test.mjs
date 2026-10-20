import test from 'node:test';
import assert from 'node:assert/strict';
import directory from '../pages-demo/src/housing-resources.json' with { type: 'json' };
import { en } from '../src/lib/i18n/en.ts';
import { es } from '../src/lib/i18n/es.ts';
import { buildCrisisPlan, CRISIS_NOTICE_STAGES, CRISIS_SITUATIONS } from '../src/lib/housing/crisis.mjs';

const deliberatelyShared = new Set(['brand', 'language.label']);

test('classic Spanish UI has authored copy for every English UI key', () => {
  function inspect(english, spanish, path = '') {
    assert.deepEqual(Object.keys(spanish).sort(), Object.keys(english).sort(), `UI keys at ${path}`);
    for (const [key, original] of Object.entries(english)) {
      const name = path ? `${path}.${key}` : key;
      const translated = spanish[key];
      assert.equal(typeof translated, typeof original, name);
      if (original && typeof original === 'object') inspect(original, translated, name);
      else if (typeof original === 'string' && !deliberatelyShared.has(name))
        assert.notEqual(translated, original, `Spanish copy fell back to English: ${name}`);
      else if (typeof original === 'function') {
        assert.equal(typeof translated(1, 2, 3), 'string', name);
        assert.notEqual(translated(1, 2, 3), original(1, 2, 3), `Spanish copy fell back to English: ${name}`);
      }
    }
  }
  inspect(en, es);
});

test('switching the deterministic crisis plan language preserves every route and source', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const inputs = [
    ...CRISIS_SITUATIONS.map(situation => ({ situation, location: 'tampa' })),
    ...CRISIS_NOTICE_STAGES.map(noticeStage => ({ situation: 'eviction', location: 'tampa', noticeStage })),
    { situation: 'domestic_violence', location: 'pinellas', physicalDanger: true },
    { situation: 'homelessness', location: 'pasco', timeframe: 'tonight', safe: 'no' },
  ];
  for (const input of inputs) {
    const english = buildCrisisPlan(input, directory.resources, { now, locale: 'en' });
    const spanish = buildCrisisPlan(input, directory.resources, { now, locale: 'es' });
    assert.equal(english.language, 'en');
    assert.equal(spanish.language, 'es');
    assert.deepEqual(spanish.input, english.input, JSON.stringify(input));
    for (const field of ['urgency', 'dangerKind', 'referralPath'])
      assert.equal(spanish[field], english[field], `${field}: ${JSON.stringify(input)}`);
    assert.deepEqual(spanish.resources.map(item => item.id), english.resources.map(item => item.id));
    assert.deepEqual(spanish.sources.map(item => item.url), english.sources.map(item => item.url));
    for (const field of ['title', 'immediatePriority', 'deadline', 'humanAssistance'])
      assert.notEqual(spanish[field], english[field], `Missing Spanish ${field}: ${JSON.stringify(input)}`);
    for (const field of ['steps', 'documents', 'notes']) {
      assert.equal(spanish[field].length, english[field].length, `${field}: ${JSON.stringify(input)}`);
      spanish[field].forEach((value, index) =>
        assert.notEqual(value, english[field][index], `Missing Spanish ${field}[${index}]: ${JSON.stringify(input)}`));
    }
  }
});
