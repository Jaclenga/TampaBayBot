import test from 'node:test';
import assert from 'node:assert/strict';
import { programCandidates, recognizeHousingPrograms } from '../src/lib/housing/programs.mjs';

function hit(id, text, { sourceId = 'synthetic-office', section = 'Local resources', title = 'Community Services' } = {}) {
  return { source: { source_id: sourceId, title }, chunk: { id, source_id: sourceId, section, text }, score: 10 };
}

const rent = hit('rent', 'The Oak Rental Assistance Program helps residents with overdue rent and eviction prevention.');
const utilities = hit('utilities', 'The Willow Utility Assistance Program provides grants to help pay electric bills.');
const buy = hit('buy', 'The Juniper Homebuyer Loan Program offers down payment assistance and closing costs to homebuyers.');

test('distinct programs in a single source survive while generic navigation is excluded', () => {
  const navigation = hit('nav', 'Find housing assistance resources and program contact information on this page.');
  const result = programCandidates('I need help with rent and electric bills.', [navigation, rent, utilities, buy]);
  assert.deepEqual(result.map(item => item.chunk.id), ['rent', 'utilities']);
  assert.equal(new Set(result.flatMap(item => item.programs.map(program => program.id))).size, 2);
  assert.deepEqual(recognizeHousingPrograms(navigation), []);
});

test('explicitly declined housing needs do not add their programs', () => {
  const result = programCandidates('I need help paying my electric bill, not buying a home.', [buy, utilities, rent]);
  assert.deepEqual(result.map(item => item.chunk.id), ['utilities']);
  assert.deepEqual(programCandidates('I do not need help with housing programs.', [rent, utilities]), []);
});

test('rent arrears are not equated with a move-in-only payment of first month rent', () => {
  const move = hit('move', 'Assistance is available for new move-in costs only, including first month rent and security deposits.', { section: 'Arrival Assistance Program' });
  assert.deepEqual(programCandidates('I am behind on rent and I am not moving.', [move, rent]).map(item => item.chunk.id), ['rent']);
  assert.deepEqual(programCandidates('I need help with a security deposit to move in.', [move, rent]).map(item => item.chunk.id), ['move']);
});

test('two named programs in one passage preserve their names in one literal quote', () => {
  const combined = hit('combined', `${rent.chunk.text} ${utilities.chunk.text}`);
  const [result] = programCandidates('I need help with rent and electricity bills.', [combined]);
  assert.equal(result.programs.length, 2);
  assert.equal(combined.chunk.text.slice(result.programQuote.start, result.programQuote.end), combined.chunk.text);
});

test('a short mixed passage retains the full context and marks only the requested mechanism', () => {
  const combined = hit('combined', `${buy.chunk.text} ${utilities.chunk.text}`);
  const [result] = programCandidates('I need help with my electric bill, not buying a home.', [combined]);
  const quote = combined.chunk.text.slice(result.programQuote.start, result.programQuote.end);
  assert.equal(quote, combined.chunk.text);
  assert.ok(result.programs.every(program => program.needs.includes('utilities')));
});

test('a second mechanism gets a place before one need consumes a bounded evidence budget', () => {
  const otherRent = hit('other-rent', 'The Beech Rental Assistance Program provides payments for overdue rent.');
  const result = programCandidates('I need rent and utility bill assistance.', [rent, otherRent, utilities], { limit: 2 });
  assert.deepEqual(result.map(item => item.chunk.id), ['rent', 'utilities']);
});

test('repeated passages for one named program do not consume all program slots', () => {
  const duplicate = hit('duplicate', 'The Oak Rental Assistance Program offers rental payments to residents facing eviction.');
  assert.deepEqual(programCandidates('I need help with rent and electric bills.', [rent, duplicate, utilities]).map(item => item.chunk.id), ['rent', 'utilities']);
});

test('long passages retain the literal identifying program sentence within 720 characters', () => {
  const long = hit('long', `${'Additional background about community meetings. '.repeat(25)}${utilities.chunk.text} ${'Office updates are posted every month. '.repeat(20)}`);
  const [result] = programCandidates('I need help with my electric bill.', [long]);
  const quote = long.chunk.text.slice(result.programQuote.start, result.programQuote.end);
  assert.ok(quote.length <= 720);
  assert.ok(quote.includes('Willow Utility Assistance Program'));
  assert.ok(quote.includes('electric bills'));
});

test('explicitly named program requests do not add other programs of the same kind', () => {
  const other = hit('other', 'The Maple Rental Assistance Program provides grants to pay overdue rent.');
  assert.deepEqual(programCandidates('Tell me about only the Oak Rental Assistance Program.', [other, rent]).map(item => item.chunk.id), ['rent']);
});

test('unrelated loans, apartment contact tables and bare program headings are not descriptions', () => {
  for (const item of [
    hit('student', 'The Evergreen Education Loan Program offers loans for tuition and books.'),
    hit('table', 'Example Apartments | 100 Main Street | Example City | 555-0100', { section: 'Affordable rental housing' }),
    hit('heading', 'Homebuyer Assistance Program: down payment and closing costs'),
  ]) assert.deepEqual(recognizeHousingPrograms(item), [], item.chunk.id);
});

test('short descriptions retain neighboring eligibility and amount restrictions', () => {
  const restricted = hit('restricted', 'Voucher households may apply for deposit assistance. The program may assist with a security deposit. The agency will only approve the deposit authorized by the housing authority.');
  const [result] = programCandidates('I need help with a security deposit.', [restricted]);
  assert.equal(restricted.chunk.text.slice(result.programQuote.start, result.programQuote.end), restricted.chunk.text);
});

test('agency builders selling homes describe a homeownership mechanism without a Program suffix', () => {
  const builder = hit('builder', 'Community Home Builders builds and sells homes to households who do not qualify for a traditional mortgage.', { section: 'Homeownership Opportunities' });
  assert.deepEqual(programCandidates('I need help buying a home.', [builder]).map(item => item.chunk.id), ['builder']);
  assert.deepEqual(programCandidates('I need help paying utility bills.', [builder]), []);
});

test('procurement announcements and tenant responsibilities are not resident assistance programs', () => {
  for (const item of [
    hit('procurement', 'The county announces that the Request for Proposals (RFP) for Multifamily Rehabilitation Projects is available. Qualified contractors may submit bids by the deadline.'),
    hit('responsibility', 'You are still responsible for your rent payments as they become due. Seek help if you cannot pay rent.'),
    hit('negative', 'The program does not pay first month rent or security deposits.'),
  ]) assert.deepEqual(recognizeHousingPrograms(item), [], item.chunk.id);
});

test('explicit water-only and energy-only assistance respect the requested utility type', () => {
  const water = hit('water', 'The Brook Water Assistance Program offers grants to help pay water and sewer bills. It cannot pay electric bills.');
  const energy = hit('energy', 'The Hearth Energy Assistance Program offers grants to help pay electric bills. It cannot pay water bills.');
  assert.deepEqual(programCandidates('I need help paying my electric bill.', [water, energy]).map(item => item.chunk.id), ['energy']);
  assert.deepEqual(programCandidates('I need help paying water and electric bills.', [water, energy]).map(item => item.chunk.id), ['water', 'energy']);
});

test('an explicitly adults-only shelter is not added for a household with children', () => {
  const adults = hit('adults', 'The Harbor Shelter Program provides emergency housing for adults only.');
  const families = hit('families', 'The Meadow Shelter Program provides emergency housing for families with children.');
  assert.deepEqual(programCandidates('I am homeless with two children.', [adults, families]).map(item => item.chunk.id), ['families']);
});

test('a program description ending with an online application address retains its identity', () => {
  const online = hit('online', 'Residents may apply for the Cobalt Home Energy Assistance Program crisis assistance online at example.test. The portal accepts electronic applications.');
  const [result] = programCandidates('I need help with my electric bill.', [online]);
  assert.ok(result.programs.some(program => program.label === 'Cobalt Home Energy Assistance Program'));
  assert.equal(online.chunk.text.slice(result.programQuote.start, result.programQuote.end), online.chunk.text);
});

test('long paragraph quotes keep mandatory restrictions next to the program benefit', () => {
  const text = `${'Historical notes about office meetings are available. '.repeat(25)}${utilities.chunk.text} Applicants must reside within the service area and awards are limited to overdue bills only. ${'General office news follows. '.repeat(25)}`;
  const [result] = programCandidates('I need help paying my electric bill.', [hit('qualified-long', text)]);
  const quote = text.slice(result.programQuote.start, result.programQuote.end);
  assert.ok(quote.length <= 720);
  assert.ok(quote.includes('Willow Utility Assistance Program'));
  assert.match(quote, /Applicants must reside within the service area and awards are limited to overdue bills only/);
});
