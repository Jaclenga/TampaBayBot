export interface GuardrailPromptInsert {
  readonly id: string;
  readonly version: string;
  readonly text: string;
}
export const GUARDRAIL_PROMPT_INSERTS: readonly GuardrailPromptInsert[];
export function buildGuardrailPrompt(): string;
