import { normalizeQuestion, intentText } from '../router.mjs';
import { KNOWN_PROGRAM_ALIASES } from '../../domain/source-policies.mjs';

export function unknownSpecificClaim(question, sources, chunks) {
  const text = intentText(question);
  const corpus = normalizeQuestion(sources.map(source => `${source.title} ${(source.keywords ?? []).join(' ')} ${source.source_id}`).join(' ') + ' ' + chunks.map(chunk => chunk.text).join(' '));
  const localProgram = KNOWN_PROGRAM_ALIASES.find(alias => ` ${text} `.includes(` ${alias} `));
  if (localProgram && !` ${corpus} `.includes(` ${localProgram} `)) return 'program';
  const ordinance = text.match(/\b(?:ordinance|section|statute|code)\s+(\d[\w.-]*)/);
  if (ordinance && !corpus.includes(ordinance[1])) return 'ordinance';
  if (/\b(free house|guaranteed housing|pirate|privateer grant|unicorn|sunshine key|dolphin|moonlight|universal rent|magic|free mansion|tampa gold|free-home|no questions asked)\b/.test(text)) return 'program';
  const named = String(question).match(/["“]([^"”]{4,100})["”]/);
  if (named && /\b(program|grant|fund|ordinance)\b/i.test(text) && !corpus.includes(normalizeQuestion(named[1]))) return 'program';
  const properName = String(question).match(/\b(?:[A-Z][a-zA-Z-]+\s+){1,5}(?:Program|Grant|Fund|Award)\b/);
  if (properName && !corpus.includes(normalizeQuestion(properName[0]))) return 'program';
  const spanishName = String(question).match(/\b(?:Programa|Subvenci[oó]n|Fondo)\s+(?:[A-ZÁÉÍÓÚÑ][\p{L}-]*(?:\s+|$)){1,5}/u);
  if (spanishName && !corpus.includes(normalizeQuestion(spanishName[0]))) return 'program';
  return null;
}

