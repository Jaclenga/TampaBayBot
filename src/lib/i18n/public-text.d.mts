export function publicText<T extends string | null | undefined>(value: T, locale?: 'en' | 'es'): T;
export function jurisdictionLabel(label: string, locale?: 'en' | 'es'): string;
export function quotedSegments(text: string, evidence: { quote: string; language?: string }[]): { text: string; language?: 'en' | 'es' | 'und' }[];
