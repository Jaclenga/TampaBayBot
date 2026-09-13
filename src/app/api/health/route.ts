import { sources, chunks, corpusGeneration } from "@/lib/corpus";
import packageMetadata from "@/package.json";
import { corpusReadiness, readinessResponse } from "@/lib/operations/readiness.mjs";
import { operationsStatus, monitorAuthorized } from "@/lib/operations/control.mjs";
import { getRuntimeEnv } from "@/lib/runtime-env.mjs";
export async function GET(request: Request) {
  // Liveness stays HTTP 200; /api/ready uses the same report and returns 503
  // whenever evidence or shared production controls are not ready.
  const env = getRuntimeEnv();
  return Response.json(readinessResponse(corpusReadiness(sources, chunks),
    await operationsStatus(env, { probe: monitorAuthorized(request, env) }), packageMetadata.version, corpusGeneration),
    { headers: { "Cache-Control": "no-store" } });
}
