export function requestedDetails(question: string, text?: string, requestedFacts?: string[]): string[];
export function requestedDetailScore(question: string, text: string, requestedFacts?: string[]): number;
export function requestedDetailScorer(question: string, requestedFacts?: string[]): (text: string) => number;
