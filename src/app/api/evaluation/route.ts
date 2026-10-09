import summary from "../../../../evaluation/results/latest.json" with { type: "json" };
import responses from "../../../../evaluation/results/responses.json" with { type: "json" };
import agent from "../../../../evaluation/agent-audit/responses.json" with { type: "json" };
import human from "../../../../evaluation/human-audit/responses.json" with { type: "json" };
import suite from "../../../../evaluation/suite/results/latest.json" with { type: "json" };
import { monitorAuthorized } from "../../../lib/operations/control.mjs";
import { getRuntimeEnv } from "../../../lib/runtime-env.mjs";

const artifacts = { summary, responses, agent, human, suite };
const privateArtifacts = new Set(["responses", "agent", "human"]);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("artifact") || "summary";
  if (!Object.hasOwn(artifacts, name) || (name === "suite" && suite.mode !== "offline"))
    return Response.json(
      { error: "Unknown evaluation artifact." },
      { status: 404, headers },
    );
  if (privateArtifacts.has(name) && !monitorAuthorized(request, getRuntimeEnv()))
    return new Response("Not found.", { status: 404, headers });
  return Response.json(artifacts[name as keyof typeof artifacts], {
    headers: {
      ...headers,
      "Content-Disposition": `attachment; filename="tampabaybot-${name}.json"`,
    },
  });
}
