import { isAuthoritative } from '../../retrieval/eligibility.mjs';
import { safeSourceUrl } from '../../citations/evidence.mjs';

export function nextSteps(sources) {
  const result = [];
  for (const source of sources) {
    if (!isAuthoritative(source)) continue;
    const target = source.next_step ?? { label: `Visit ${source.title}`, url: source.canonical_url };
    const url = safeSourceUrl(target.url, source.canonical_url);
    if (!url || result.some(item => item.url === url)) continue;
    result.push({ label: target.label, url, agency: source.agency });
  }
  return result.slice(0, 3);
}

