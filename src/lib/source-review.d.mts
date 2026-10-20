export interface SourceReviewInput {
  review_status?: string | null;
  last_content_reviewed_at?: string | null;
  next_review_at?: string | null;
  refresh_days?: number | null;
  link_status?: string | null;
}
export function sourceReviewState(source: SourceReviewInput, now?: number): {
  content: 'needs_review' | 'overdue' | 'reviewed';
  reviewedDay: string | null;
  dueDay: string | null;
  link: 'error' | 'inconclusive' | 'redirect' | null;
};
