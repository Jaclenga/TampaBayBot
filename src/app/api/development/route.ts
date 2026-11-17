import { createRequestTiming } from "@/lib/performance/timing.mjs";
import { getNearbyDevelopment } from "@/lib/development/index.mjs";
import { readInput, inputPoint, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  const { timings, respond } = createRequestTiming();
  try {
    const input = await readInput(request);
    const radius = input.radiusMeters ?? 1000;
    if (typeof radius !== "number" || ![250, 500, 1000, 2000].includes(radius))
      return respond(json({ error: "Choose a supported search distance." }, 400));
    return respond(json(await getNearbyDevelopment(inputPoint(input), radius, { timings })));
  } catch (error) {
    return respond(inputErrorJson(error, "Development records unavailable."));
  }
}
