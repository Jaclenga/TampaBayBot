import ResidentApp from "@/components/resident-app";
import { getModelNotice } from "@/lib/llm-settings";
import { demoMode } from "@/lib/corpus";
export const dynamic = "force-dynamic";
export default function Home() {
  return <>
    {demoMode && <aside className="demo-banner" aria-label="Fictional demonstration"><p role="note"><strong>Fictional demonstration / Demostración ficticia</strong><br />All example programs and amounts are invented for testing. Do not use these examples for housing decisions. Los programas y montos son ficticios.</p></aside>}
    <ResidentApp modelNotice={getModelNotice()} />
  </>;
}
