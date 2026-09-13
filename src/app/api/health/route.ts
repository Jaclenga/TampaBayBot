import { sources, chunks } from "@/lib/corpus";
import packageMetadata from "@/package.json";
export async function GET() {
  return Response.json({
    status: chunks.length ? "ready" : "no_evidence",
    version: packageMetadata.version,
    sources: sources.length,
    chunks: chunks.length,
  });
}
