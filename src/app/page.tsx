import ResidentApp from "@/components/resident-app";
import { getModelNotice } from "@/lib/llm-settings";
import chunks from "@/data/chunks.json";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default function Home() {
  if (chunks.length === 0) return (
    <main id="main" className="document-page content-width">
      <h1>Source information is not loaded</h1>
      <p>This installation is not ready to answer questions. Its operator needs to load and review the source information first.</p>
      <p>You can still visit the official sources directly.</p>
      <Link href="/sources" className="text-link">Browse official sources</Link>
    </main>
  );
  return <ResidentApp modelNotice={getModelNotice()} />;
}
