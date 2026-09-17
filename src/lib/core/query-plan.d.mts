import type { JurisdictionContext, JurisdictionId } from '../coverage.mjs';
import type { ServiceCategory, QuestionRoute } from './routing/types.mjs';

export type RequestedFact = 'amount' | 'fee' | 'duration' | 'deadline' | 'application_status' | 'income_limit' | 'eligibility' | 'contact';
export interface QueryEntity {
  type: 'program' | 'address' | 'zoning_designation';
  value: string;
  programId?: string;
  sourceId?: string;
}
export interface QueryPlan {
  originalQuery: string;
  query: string;
  normalizedQuery: string;
  intent: ServiceCategory;
  subjectCategory: ServiceCategory;
  jurisdiction: JurisdictionContext;
  geography: { hasAddress: boolean; needsAddress: boolean; addresses: string[]; outsideCoverage: boolean };
  entities: QueryEntity[];
  requestedFacts: RequestedFact[];
  consequentialDecision: boolean;
  route: QuestionRoute;
}
export interface QueryPlanSource {
  source_id: string;
  title: string;
  program_id?: string;
  topic_id?: string;
  entity_aliases?: string[];
  categories?: string[];
  jurisdiction_ids?: string[];
}
export function createQueryPlan(question: string, options?: {
  jurisdictionId?: JurisdictionId;
  sources?: QueryPlanSource[];
  originalQuery?: string;
}): QueryPlan;
