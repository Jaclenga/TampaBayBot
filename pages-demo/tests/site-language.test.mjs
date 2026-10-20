import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCrisisPlan } from '../../src/lib/housing/crisis.mjs';
import { siteText, siteTextKeysComplete } from '../src/site-language.ts';

const resources = JSON.parse(readFileSync(new URL('../src/housing-resources.json', import.meta.url), 'utf8')).resources;

test('Pages shell translations have matching keys and no English placeholder copy', () => {
  assert.equal(siteTextKeysComplete, true);
  assert.deepEqual(Object.keys(siteText.es).sort(), Object.keys(siteText.en).sort());
  for (const key of Object.keys(siteText.en)) {
    assert.ok(siteText.en[key].trim(), `English ${key} is empty`);
    assert.ok(siteText.es[key].trim(), `Spanish ${key} is empty`);
    assert.notEqual(siteText.es[key], siteText.en[key], `${key} silently falls back to English`);
  }
  assert.match(siteText.es.previewDisclaimer, /No ofrece asesoría legal/);
  assert.match(siteText.es.unavailableTitle, /Servicio no disponible/);
  assert.match(siteText.es.privacy, /en inglés/);
});

test('all deterministic housing situations have explicit Spanish guidance', () => {
  for (const situation of [
    'eviction', 'rent', 'imminent_homelessness', 'homelessness', 'unsafe_housing',
    'utilities', 'domestic_violence', 'disaster', 'affordable_housing',
  ]) {
    const input = { situation, location: 'tampa' };
    const english = buildCrisisPlan(input, resources, { locale: 'en' });
    const spanish = buildCrisisPlan(input, resources, { locale: 'es' });
    assert.equal(spanish.language, 'es', situation);
    assert.ok(spanish.title && spanish.immediatePriority && spanish.deadline && spanish.humanAssistance, situation);
    assert.ok(spanish.steps.length >= 1, situation);
    assert.notEqual(spanish.title, english.title, `${situation} title silently falls back`);
    assert.notEqual(spanish.immediatePriority, english.immediatePriority, `${situation} priority silently falls back`);
    assert.notEqual(spanish.deadline, english.deadline, `${situation} deadline silently falls back`);
    assert.notEqual(spanish.humanAssistance, english.humanAssistance, `${situation} human help silently falls back`);
    assert.ok(spanish.steps.every((step, index) => step !== english.steps[index]), `${situation} steps silently fall back`);
  }
});
