import type { CrisisPlan } from "../../src/lib/housing/crisis.mjs";

export interface Evidence {
  id: string;
  title: string;
  agency: string;
  quote: string;
  url: string;
  section: string | null;
  retrieved_at: string | null;
  source_updated_date: string | null;
  stale: boolean;
}

export interface ResidentAnswer {
  status: string;
  answer: string;
  jurisdictionId: string;
  jurisdictionLabel: string;
  conversation: Record<string, unknown> | null;
  conversationUsed: boolean;
  evidence: Evidence[];
  nextSteps: { label: string; url: string; agency: string }[];
  warnings: string[];
  meaning: string | null;
  requirementsToVerify?: string[];
  coverage?: { statement: string };
  generation?: { status: string; provider: string; reason?: string };
  aiUsage?: AiUsage | null;
  crisisPlan?: CrisisPlan | null;
}

export interface AiUsage {
  remaining: number | null;
  limit: number;
  used: number | null;
  resetAt: string | null;
  available: boolean;
  reason: string | null;
}

export interface UsageResponse { ai: AiUsage }

export class ApiError extends Error {
  status: number;
  code: string | null;
  aiUsage: AiUsage | null;
  constructor(message: string, status: number, code: string | null, aiUsage: AiUsage | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.aiUsage = aiUsage;
  }
}

export interface AddressCandidate {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

export interface AddressLookup {
  status: string;
  message: string;
  candidates: AddressCandidate[];
  warnings: string[];
}

export interface LayerRecord {
  id: string;
  label: string;
  description: string;
  pin: string | null;
  sourceUrl: string;
}

export interface LayerResult {
  title: string;
  status: string;
  message: string | null;
  sourceUrl: string;
  records: LayerRecord[];
}

export interface PropertyContext {
  status: string;
  message: string;
  jurisdiction: string;
  warnings: string[];
  parcelAnalysis?: { scope: string };
  parcel?: LayerResult;
  zoning?: LayerResult;
  futureLandUse?: LayerResult;
}

export interface DevelopmentRecord {
  id: string;
  address: string;
  projectName: string;
  recordId: string;
  recordType: string;
  status: string;
  date: string | null;
  dateType: string;
  distanceMeters: number | null;
  sourceUrl: string;
  originalSourceUrl: string | null;
}

export interface DevelopmentResult {
  status: string;
  message: string;
  title?: string;
  sourceUrl: string;
  sourceSnapshotDate: string | null;
  coverage: string;
  warnings: string[];
  totalMatches: number;
  totalMatchesExact?: boolean;
  records: DevelopmentRecord[];
}

export function classifyHealth(report: unknown): "ready" | "empty" | "degraded" | "unavailable" {
  if (!report || typeof report !== "object") return "unavailable";
  const value = report as { corpus?: { chunks?: unknown; status?: unknown } };
  const chunks = value.corpus?.chunks;
  if (chunks === 0 || value.corpus?.status === "no_evidence") return "empty";
  if (typeof chunks !== "number" || !Number.isInteger(chunks) || chunks < 0) return "unavailable";
  return value.corpus?.status === "ready" ? "ready" : "degraded";
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "Date not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date not supplied";
  // GIS and source metadata often provide a calendar date without a time zone.
  // Keep that date stable for visitors west of UTC.
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) options.timeZone = "UTC";
  return date.toLocaleDateString("en-US", options);
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The service returned an unreadable response. Please try again.");
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" ? data as { error?: unknown; code?: unknown; aiUsage?: unknown } : null;
    const message = detail && typeof detail.error === "string"
      ? detail.error
      : "The service is unavailable. Please try again.";
    throw new ApiError(message, response.status, typeof detail?.code === "string" ? detail.code : null,
      isAiUsage(detail?.aiUsage) ? detail.aiUsage : null);
  }
  return data as T;
}

export function isAiUsage(value: unknown): value is AiUsage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Partial<AiUsage>;
  return (usage.remaining === null || Number.isInteger(usage.remaining)) && Number.isInteger(usage.limit)
    && (usage.used === null || Number.isInteger(usage.used))
    && typeof usage.available === "boolean"
    && (usage.reason === null || typeof usage.reason === "string")
    && (usage.resetAt === null || typeof usage.resetAt === "string");
}

export async function getAiUsage(signal?: AbortSignal): Promise<AiUsage | null> {
  const response = await fetch("/api/usage", { cache: "no-store", signal });
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("ai" in data)) return null;
  return isAiUsage(data.ai) ? data.ai : null;
}
