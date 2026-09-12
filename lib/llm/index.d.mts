import type { ResidentAnswer } from '../core/answer.mjs';

export type LlmProviderKind = 'none' | 'ollama' | 'openai-compatible';
export interface LlmConfig {
  readonly provider: LlmProviderKind; readonly valid: boolean; readonly enabled: boolean;
  readonly endpoint?: string; readonly model?: string; readonly apiKey?: string;
  readonly timeoutMs: number; readonly maxResponseBytes: number;
  readonly locality: 'loopback' | 'network' | null; readonly invalidReason?: string;
}
export interface PublicLlmInfo {
  enabled: boolean; provider: LlmProviderKind | 'invalid'; locality: 'loopback' | 'network' | null;
}
export interface GenerationInfo {
  mode: 'extractive' | 'llm'; provider: LlmProviderKind | 'invalid';
  status: 'disabled' | 'used' | 'skipped' | 'fallback'; reason?: string;
}
export interface LlmProviderRequest {
  messages: {role: 'system' | 'user'; content: string}[];
  model: string; signal: AbortSignal; schema: Record<string, unknown>;
}
export interface LlmProvider { complete(request: LlmProviderRequest): Promise<string>; }
export function parseLlmConfig(env?: Record<string, unknown>): LlmConfig;
export function publicLlmInfo(config: LlmConfig): PublicLlmInfo;
export function createHttpProvider(config: LlmConfig, fetchImpl?: typeof fetch): LlmProvider;
export function synthesizeAnswer<T extends ResidentAnswer>(baseline: T, options?: {
  config?: LlmConfig; fetchImpl?: typeof fetch; provider?: LlmProvider; signal?: AbortSignal;
}): Promise<T & {generation: GenerationInfo}>;
