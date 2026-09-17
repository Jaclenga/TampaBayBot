import type { JurisdictionContext } from '../../coverage.mjs';

export type ServiceCategory = 'housing' | 'zoning' | 'permitting' | 'development' | 'navigation';
export interface QuestionRoute extends JurisdictionContext {
  category: ServiceCategory;
  subjectCategory: ServiceCategory;
  needsAddress: boolean;
  hasAddress: boolean;
  outOfScope: boolean;
  outsideCoverage: boolean;
  officialJudgment: boolean;
  normalized: string;
}
