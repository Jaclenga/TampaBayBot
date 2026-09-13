import type { ResidentAnswer } from '../core/answer.mjs';
export function localizeAnswer<T extends ResidentAnswer>(answer: T, locale?: 'en' | 'es'): T;
