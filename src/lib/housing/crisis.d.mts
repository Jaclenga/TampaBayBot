export type CrisisSituation = 'eviction' | 'rent' | 'imminent_homelessness' | 'homelessness' | 'unsafe_housing' | 'utilities' | 'domestic_violence' | 'disaster' | 'affordable_housing';
export type CrisisUrgency = 'emergency' | 'urgent' | 'standard';
export type CrisisLocation = 'all' | 'hillsborough' | 'pinellas' | 'pasco' | 'tampa' | 'st-petersburg' | 'clearwater';
export type CrisisNoticeStage = 'none' | 'informal_warning' | 'written_notice' | 'pay_or_vacate' | 'court_summons' | 'pending_case' | 'judgment_or_possession' | 'unknown';
export interface CrisisInput {
  situation: CrisisSituation;
  location?: CrisisLocation;
  timeframe?: 'tonight' | 'days' | 'later' | 'unknown';
  safe?: 'yes' | 'no' | 'unsure';
  noticeStage?: CrisisNoticeStage;
  physicalDanger?: boolean;
  seriousHazard?: boolean;
  noSafePlaceTonight?: boolean;
  courtDeadlineSoon?: boolean;
  shutoffImminent?: boolean;
  mentionsRmap?: boolean;
}
export interface CrisisResource {
  id: string;
  categories: string[];
  crisisCategories?: CrisisSituation[];
  organization: string;
  program: string;
  description: string;
  geography: string[];
  municipalities?: string[];
  url: string;
  contacts: {label: string; value: string; kind: string}[];
  eligibility: string;
  availability: string;
  verifiedAt: string;
  sourceUrl: string;
  verificationStatus?: 'source_checked' | 'needs_recheck' | 'source_unavailable';
  availabilityStatus?: 'unknown' | 'confirmed_open' | 'temporarily_closed' | 'discontinued';
  refreshDays?: number;
  intakeUrl?: string;
  serviceHours?: string;
  restrictions?: string[];
}
export interface CrisisTriage {
  situation: CrisisSituation;
  urgency: CrisisUrgency;
  reason: 'immediate_safety_or_sleep' | 'time_sensitive_housing' | 'planning';
  dangerKind: 'physical_danger' | 'domestic_violence' | 'unsafe_sleep' | 'none';
  referralPath: 'emergency_services' | 'dv_advocate' | 'shelter_intake' | 'legal_aid' | 'housing_navigation' | 'assistance_intake';
}
export interface CrisisPlan {
  input: CrisisInput;
  situation: CrisisSituation;
  urgency: CrisisUrgency;
  dangerKind: CrisisTriage['dangerKind'];
  referralPath: CrisisTriage['referralPath'];
  language: 'en' | 'es';
  title: string;
  immediatePriority: string;
  steps: string[];
  resources: CrisisResource[];
  documents: string[];
  deadline: string;
  humanAssistance: string;
  notes: string[];
  sources: {title: string; url: string; verifiedAt: string}[];
}
export const CRISIS_SITUATIONS: readonly CrisisSituation[];
export const CRISIS_NOTICE_STAGES: readonly CrisisNoticeStage[];
export function triageHousingCrisis(input: CrisisInput | null | undefined): CrisisTriage | null;
export function selectCrisisResources(input: CrisisInput | null | undefined, resources: CrisisResource[], options?: {now?: Date | string | number; limit?: number}): CrisisResource[];
export function buildCrisisPlan(input: CrisisInput | null | undefined, resources: CrisisResource[], options?: {now?: Date | string | number; locale?: 'en' | 'es'}): CrisisPlan | null;
export function inferCrisisInput(question: string, options?: {jurisdictionId?: string}): CrisisInput | null;
