import type { JurisdictionId } from '../coverage.mjs';
import type { QuestionRoute } from './routing/types.mjs';
export type { QuestionRoute, ServiceCategory } from './routing/types.mjs';
export function normalizeQuestion(value: unknown): string;
export function intentText(value: unknown): string;
export function routeQuestion(question: string, options?: { jurisdictionId?: JurisdictionId }): QuestionRoute;
