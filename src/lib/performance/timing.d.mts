export interface Timings {
  start(stage: string): () => void;
  snapshot(): Record<string, number>;
  header(): string;
}
export function createTimings(clock?: () => number): Timings;
export function measure<T>(timings: Timings | undefined, stage: string, operation: () => T): T;
export function measureAsync<T>(timings: Timings | undefined, stage: string, operation: () => Promise<T>): Promise<T>;

export function createRequestTiming(): {timings: Timings; respond(response: Response): Response};
