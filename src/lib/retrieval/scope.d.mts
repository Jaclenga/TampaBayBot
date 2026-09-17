import type { Source, Chunk } from '../core/answer.mjs';
import type { QuestionRoute } from '../core/router.mjs';
import type { RetrievalRejection } from './search.mjs';

export function scopeCorpus(sources: Source[], chunks: Chunk[], route: QuestionRoute): {
  sources: Source[]; documents: { source: Source; chunk: Chunk }[]; rejected: RetrievalRejection[];
};
export function sourceMatchesTopic(source: Source, route: QuestionRoute): boolean;
