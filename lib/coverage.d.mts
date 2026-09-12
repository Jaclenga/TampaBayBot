export type JurisdictionId = 'tampa-bay' | 'tampa' | 'st-petersburg' | 'clearwater' | 'hillsborough-county' | 'pinellas-county' | 'pasco-county';
export type JurisdictionReason = 'unspecified' | 'conflict' | 'unsupported_municipality' | 'invalid_selection' | null;
export interface JurisdictionContext {
  jurisdictionId: JurisdictionId;
  jurisdictionLabel: string;
  needsJurisdiction: boolean;
  jurisdictionReason: JurisdictionReason;
}
export const JURISDICTIONS: ReadonlyArray<Readonly<{ id: JurisdictionId; label: string }>>;
export function isJurisdictionId(value: unknown): value is JurisdictionId;
export function sourceCoversJurisdiction(source: { jurisdiction_ids?: unknown } | null | undefined, jurisdictionId: unknown): boolean;
export function resolveJurisdiction(localityText: string, selected?: JurisdictionId): JurisdictionContext;
