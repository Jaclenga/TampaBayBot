import sources from "@/data/sources.json";
import chunks from "@/data/chunks.json";
export async function GET() {
  return Response.json({
    status: chunks.length ? "ready" : "no_evidence",
    version: "0.1.0-alpha.1",
    sources: sources.length,
    chunks: chunks.length,
  });
}
