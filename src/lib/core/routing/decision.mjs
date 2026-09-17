/** Consequential decisions are detected separately from subject classification. */
export function detectDecision(text, { scores, startsWithAddress }) {
  const noRoutingSignal = Math.max(...Object.values(scores)) === 0 && !startsWithAddress && !/\b(help|start|lost|confused|go|apply|tampa|hillsborough|petersburg|pete|clearwater|pinellas|pasco)\b/.test(text);
  const explicitOutOfScope = /\b(pizza|song|recipe|sports score|football|weather|stock price)\b/.test(text);
  const officialJudgment = /\b(am i eligible|do i qualify|guarantee|guaranteed|legally|legal advice|sue|official (determination|approval)|approve my|certify|am i allowed|is it legal|can i (build|evict)|prove i can build|will (the city|i) approve|definitely (eligible|allowed)|tell me i qualify|automatically qualify)\b/.test(text);
  return { outOfScope: noRoutingSignal || explicitOutOfScope, noRoutingSignal, explicitOutOfScope, consequentialDecision: officialJudgment };
}
