// Insert trusted deployment-specific guards here. Never load guard code or
// settings from a resident request. Built-in checks and citation validators stay on.
// Example: { id: 'local-policy', stages: ['before_model'], check: async
//   (context, { signal }) => ({ action: 'allow' }) }
// See docs/GUARDRAIL_INSERTS.md for the contract and all five stages.
export const siteGuards = Object.freeze([]);
