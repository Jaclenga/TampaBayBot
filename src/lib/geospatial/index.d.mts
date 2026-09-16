export interface Point { latitude: number; longitude: number }
export interface AddressCandidate extends Point { id: string; address: string; score: number; matchType: string; sourceId: string; sourceUrl: string; retrievedAt: string }
export type JurisdictionId = 'tampa' | 'st-petersburg' | 'clearwater' | 'pasco';
export interface AddressService { sourceId: string; sourceUrl: string; agency: string; coverage: string; status: 'available' | 'unavailable'; retrievedAt: string | null }
export interface AddressLookup { status: 'selection_required' | 'ambiguous_address' | 'not_found' | 'invalid_input' | 'unavailable'; candidates: AddressCandidate[]; message: string; retrievedAt: string | null; services: AddressService[]; warnings: string[] }
export interface LayerRecord { id: string; label: string; description: string; parcelId: string | null; pin: string | null; address: string | null; sourceId: string; sourceUrl: string; layerUrl: string; retrievedAt: string; sourceUpdatedAt: string | null; attributes: Record<string, string | number | null> }
export interface LayerResult { status: string; records: LayerRecord[]; sourceId: string; sourceUrl: string; agency: string; title: string; retrievedAt: string | null; message: string | null; queryScope?: 'whole_parcel' | 'address_point' }
export interface GeographicEvidence { sourceId: string; source_id: string; title: string; agency: string; url: string; layerUrl: string; recordId: string; retrievedAt: string; sourceUpdatedAt: string | null; snippet: string }
export interface BoundaryCheck extends LayerResult { jurisdictionId: JurisdictionId }
export interface JurisdictionResult { status: 'verified' | 'unverified' | 'missing_coverage' | 'invalid_input'; jurisdictionId: JurisdictionId | null; jurisdiction: string; boundary?: BoundaryCheck; boundaryChecks: BoundaryCheck[]; supportedJurisdictions: { id: JurisdictionId; name: string }[] }
export interface PropertyContext { status: 'found' | 'partial' | 'ambiguous_parcel' | 'missing_coverage' | 'invalid_input'; message: string; address: string; latitude?: number; longitude?: number; jurisdiction: string; jurisdictionId: JurisdictionId | null; coverage: Pick<JurisdictionResult, 'status' | 'supportedJurisdictions'>; boundaryChecks?: BoundaryCheck[]; warnings: string[]; evidence: GeographicEvidence[]; boundary?: LayerResult; parcel?: LayerResult; zoning?: LayerResult; futureLandUse?: LayerResult; municipalities?: LayerResult; parcelAnalysis?: { scope: 'whole_parcel' | 'address_point'; status: 'checked' | 'incomplete' | 'not_checked'; parcelId: string | null } }
export function validPoint(point: unknown): point is Point;
export function withinServiceRegion(point: unknown): boolean;
export function haversineMeters(a: Point, b: Point): number;
export function lookupAddress(address: string): Promise<AddressLookup>;
export function getPropertyContext(candidate: Point & { address: string }): Promise<PropertyContext>;
export function createGeospatialClient(options?: { fetcher?: typeof fetch; settings?: object }): { lookupAddress: typeof lookupAddress; getJurisdiction(point: Point): Promise<JurisdictionResult>; getPropertyContext: typeof getPropertyContext };
