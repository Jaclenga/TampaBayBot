import { createRequestTiming } from "@/lib/performance/timing.mjs";
import { getPropertyContext } from "@/lib/geospatial/index.mjs";
import { readInput, inputPoint, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  const { timings, respond } = createRequestTiming();
  try {
    const input = await readInput(request);
    return respond(json(await getPropertyContext(inputPoint(input), { timings })));
  } catch (error) {
    return respond(inputErrorJson(error, "Property information unavailable."));
  }
}
