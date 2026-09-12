import sources from "@/data/sources.json";
import chunks from "@/data/chunks.json";
import packageMetadata from "@/package.json";
export async function GET() {
  return Response.json({
    status: chunks.length ? "ready" : "no_evidence",
    version: packageMetadata.version,
    sources: sources.length,
    chunks: chunks.length,
  });
}
