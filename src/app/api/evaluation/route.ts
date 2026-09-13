import summary from "@/evaluation/results/latest.json";
import responses from "@/evaluation/results/responses.json";
import agent from "@/evaluation/agent-audit/responses.json";
import human from "@/evaluation/human-audit/responses.json";
import suite from "@/evaluation/suite/results/latest.json";
const artifacts = { summary, responses, agent, human, suite };
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("artifact") || "summary";
  if (!Object.hasOwn(artifacts, name) || (name === "suite" && suite.mode !== "offline"))
    return Response.json(
      { error: "Unknown evaluation artifact." },
      { status: 404 },
    );
  return Response.json(artifacts[name as keyof typeof artifacts], {
    headers: {
      "Content-Disposition": `attachment; filename="tampabaybot-${name}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
