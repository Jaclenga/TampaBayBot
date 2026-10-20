export type FactType = 'application_status' | 'income_limit' | 'effective_year' | 'benefit_amount' | 'eligibility' | 'assistance_restriction' | 'contact';
export interface EvidenceFact {
  programId: string; sourceId: string; evidenceChunkId: string;
  factType: FactType; value: string | number; confidence: 'explicit';
  quote: string; effectiveYear?: number;
}
export interface SourceAnswerPolicy {
  sections?: { id: string; pattern: string }[];
  preferredSections?: { when?: string; sections: string[] }[];
  supplementalSections?: { when?: string; section: string; selectedOnly?: boolean; subject?: string }[];
}
export interface Source {
  source_id: string; title: string; agency: string; canonical_url: string;
  authoritative_status: string; source_type?: string; categories?: string[];
  jurisdiction_ids?: string[];
  keywords?: string[]; retrieval_date?: string | null; source_updated_date?: string | null;
  refresh_days?: number; topic_id?: string; availability?: string; last_fetch_status?: string;
  last_content_reviewed_at?: string | null; review_status?: string | null;
  next_review_at?: string | null; last_link_checked_at?: string | null;
  link_status?: string | null; known_issues?: string[];
  /** Explicit excerpt display policy; missing means no extra preview. */
  preview_policy?: 'short_excerpt' | 'none';
  program_id?: string; entity_aliases?: string[]; answer_policy?: SourceAnswerPolicy;
  next_step?: { label: string; url: string }; [key: string]: unknown;
}
export interface Chunk {
  facts?: EvidenceFact[]; answer_sections?: string[];
  id: string; source_id: string; text: string; title?: string; section?: string | null;
  page?: number | null; record_id?: string | null; layer?: string | null;
  retrieved_at?: string; content_hash?: string; url?: string; [key: string]: unknown;
  locator?: { unit_index?: number; text_start: number; text_end: number; starts_at_sentence_boundary?: boolean };
}
