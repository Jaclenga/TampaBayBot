import type { JurisdictionContext, JurisdictionId } from '../coverage.mjs';
import type { ServiceCategory } from './answer.mjs';
export interface QuestionRoute extends JurisdictionContext {
  category: ServiceCategory; subjectCategory: ServiceCategory;
  needsAddress: boolean; hasAddress: boolean; outOfScope: boolean;
  outsideCoverage: boolean; officialJudgment: boolean; normalized: string;
}
export function normalizeQuestion(value: unknown): string;
export function routeQuestion(question: string, options?: { jurisdictionId?: JurisdictionId }): QuestionRoute;
