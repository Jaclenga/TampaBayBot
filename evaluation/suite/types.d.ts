export interface EvaluationCheck {
  id: string;
  passed: boolean | null;
  kind:
    | "behavior"
    | "integrity"
    | "privacy"
    | "robustness"
    | "proxy"
    | "accuracy"
    | "citation";
  expected?: unknown;
  observed?: unknown;
}
export interface EvaluationCase {
  id: string;
  suite:
    | "navigation"
    | "guardrails"
    | "providers"
    | "metamorphic"
    | "jurisdiction"
    | "quality"
    | "live";
  title: string;
  fixture:
    | "public_snapshot"
    | "synthetic"
    | "public_snapshot_with_synthetic_input";
  checks: EvaluationCheck[];
  durationMs: number;
  details?: { category?: string; scenario?: string; challenge?: string };
}
