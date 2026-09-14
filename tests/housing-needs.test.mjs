import test from 'node:test';
import assert from 'node:assert/strict';
import { housingNeeds, housingSituation } from '../src/lib/housing/navigation.mjs';

test('housing needs retain simultaneous requests and optional alternatives', () => {
  assert.deepEqual(housingNeeds('I need help repairing the roof, paying overdue rent, and paying utility bills.'), ['repair', 'rent', 'utilities']);
  assert.deepEqual(housingNeeds('What assistance is there for buying a home or finding an affordable apartment?'), ['buy', 'rental']);
  assert.deepEqual(housingNeeds('Could I get a ramp installed and help with a deposit to move?'), ['accessibility', 'move']);
});

test('affordable rental searches and existing rent payments stay distinct', () => {
  assert.deepEqual(housingNeeds('Where can I find an affordable rental?'), ['rental']);
  assert.deepEqual(housingNeeds('I need help paying back rent at my existing lease.'), ['rent']);
  assert.deepEqual(housingNeeds('I am behind on rent and need a cheaper place.'), ['rent', 'rental']);
  assert.deepEqual(housingNeeds('Can I apply for a housing choice voucher?'), ['rent']);
  assert.deepEqual(housingNeeds('Where can I get a rental subsidy?'), ['rent']);
});

test('generic affordable housing does not assume rental tenure', () => {
  assert.deepEqual(housingNeeds('Where can I find affordable housing resources?'), []);
  const situation = housingSituation('Where can I find affordable housing resources?', { jurisdictionId: 'clearwater' });
  assert.equal(situation.kind, 'general');
  assert.deepEqual(situation.preferredSourceIds, ['clearwater-housing', 'pinellas-housing-directory', 'florida-housing']);
});

test('explicit negative circumstances do not select the declined need', () => {
  assert.deepEqual(housingNeeds('I am not homeless. I need rent assistance.'), ['rent']);
  assert.deepEqual(housingNeeds('I am not moving, but I need help with overdue rent.'), ['rent']);
  assert.deepEqual(housingNeeds('I am not buying or moving. Can someone help repair my roof?'), ['repair']);
  assert.deepEqual(housingNeeds('I do not need home repairs, but I need a security deposit.'), ['move']);
  assert.deepEqual(housingNeeds('I do not need financial assistance.'), []);
  assert.deepEqual(housingNeeds('I rent in Tampa. I do not need financial assistance.'), []);
  assert.deepEqual(housingNeeds("I don't need rental aid but do need help paying utility bills."), ['utilities']);
  assert.deepEqual(housingNeeds('I rent and need help.'), ['rent']);
  assert.deepEqual(housingNeeds('I need rent assistance, not home repairs.'), ['rent']);
  assert.deepEqual(housingNeeds('I need housing assistance paying utility bills and electric service arrears, not help buying a home.'), ['utilities']);
});

test('inability to pay and uncertainty do not negate a request', () => {
  assert.deepEqual(housingNeeds('I cannot pay rent and I need help with utility bills.'), ['rent', 'utilities']);
  assert.deepEqual(housingNeeds('I am not sure whether to buy a home or find an affordable rental.'), ['buy', 'rental']);
  assert.deepEqual(housingNeeds('I need help not only with rent but with moving costs.'), ['rent', 'move']);
  assert.deepEqual(housingNeeds('I am sleeping in my car.'), ['shelter']);
  assert.deepEqual(housingNeeds('I need help repairing water damage.'), ['repair']);
  assert.deepEqual(housingNeeds('Can you help with overdue electricity bills?'), ['utilities']);
});

test('Spanish needs preserve compound requests and explicit negation', () => {
  assert.deepEqual(housingNeeds('Necesito reparar mi techo y ayuda para pagar la renta atrasada.'), ['repair', 'rent']);
  assert.deepEqual(housingNeeds('No estoy sin hogar. Necesito ayuda con el alquiler atrasado.'), ['rent']);
  assert.deepEqual(housingNeeds('No quiero comprar una casa, pero necesito un depósito de seguridad.'), ['move']);
  assert.deepEqual(housingNeeds('Necesito ayuda con los servicios públicos y una rampa para mi casa.'), ['accessibility', 'utilities']);
  assert.deepEqual(housingNeeds('No estoy segura si comprar una casa o buscar un apartamento.'), ['buy', 'rental']);
});

test('source priorities cover every request while keeping the primary single-need order', () => {
  const single = housingSituation('I need help repairing my roof.', { jurisdictionId: 'tampa' });
  const compound = housingSituation('I need help repairing my roof and paying rent.', { jurisdictionId: 'tampa' });
  assert.equal(single.kind, 'repair');
  assert.equal(compound.situation, single.situation);
  assert.deepEqual(single.preferredSourceIds, ['tampa-hrrp', 'hillsborough-help']);
  assert.deepEqual(compound.preferredSourceIds, ['tampa-hrrp', 'hillsborough-help', 'tampa-rmap']);
  assert.deepEqual(housingSituation('I am not homeless, but need back rent assistance.', { jurisdictionId: 'tampa' }).preferredSourceIds, ['hillsborough-help', 'tampa-rmap']);
});

test('combining needs respects city, county, and unspecified source scopes', () => {
  const question = 'I need help repairing my roof or buying a different home, and paying rent.';
  assert.deepEqual(housingSituation(question, { jurisdictionId: 'pasco-county' }).preferredSourceIds, ['pasco-rehab', 'pasco-housing', 'florida-housing', 'pasco-help']);
  assert.deepEqual(housingSituation(question, { jurisdictionId: 'hillsborough-county' }).preferredSourceIds, ['hillsborough-help', 'florida-housing']);
  assert.deepEqual(housingSituation(question).preferredSourceIds, ['florida-housing']);
  assert.deepEqual(housingSituation(question, { jurisdictionId: 'unknown' }).preferredSourceIds, []);
});
