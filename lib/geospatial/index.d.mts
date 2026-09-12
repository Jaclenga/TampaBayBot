export interface Point { latitude: number; longitude: number }
export interface AddressCandidate extends Point { id: string; address: string; score: number; matchType: string; sourceId: string; sourceUrl: string; retrievedAt: string }
export interface AddressLookup { status: 'selection_required' | 'ambiguous_address' | 'not_found' | 'invalid_input' | 'unavailable'; candidates: AddressCandidate[]; message: string; retrievedAt: string | null }
export interface LayerRecord { id: string; label: string; description: string; parcelId: string | null; pin: string | null; address: string | null; sourceId: string; sourceUrl: string; layerUrl: string; retrievedAt: string; sourceUpdatedAt: string | null; attributes: Record<string, string | number | null> }
export interface LayerResult { status: string; records: LayerRecord[]; sourceId: string; sourceUrl: string; agency: string; title: string; retrievedAt: string | null; message: string | null }
export interface GeographicEvidence { sourceId: string; source_id: string; title: string; agency: string; url: string; layerUrl: string; recordId: string; retrievedAt: string; sourceUpdatedAt: string | null; snippet: string }
export interface PropertyContext { status: 'found' | 'partial' | 'ambiguous_parcel' | 'missing_coverage' | 'invalid_input'; message: string; address: string; latitude?: number; longitude?: number; jurisdiction: string; warnings: string[]; evidence: GeographicEvidence[]; boundary?: LayerResult; parcel?: LayerResult; zoning?: LayerResult; futureLandUse?: LayerResult }
export function validPoint(point: unknown): point is Point;
export function withinServiceRegion(point: unknown): boolean;
export function haversineMeters(a: Point, b: Point): number;
export function lookupAddress(address: string): Promise<AddressLookup>;
export function getPropertyContext(candidate: Point & { address: string }): Promise<PropertyContext>;
export function createGeospatialClient(options?: { fetcher?: typeof fetch; settings?: object }): { lookupAddress: typeof lookupAddress; getPropertyContext: typeof getPropertyContext };
