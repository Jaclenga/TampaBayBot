import { createRequestTiming } from "@/lib/performance/timing.mjs";
import { lookupAddress } from "@/lib/geospatial/index.mjs";
import { readInput, inputText, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  const { timings, respond } = createRequestTiming();
  try {
    const input = await readInput(request);
    return respond(json(await lookupAddress(inputText(input.address, 240), { timings })));
  } catch (error) {
    return respond(inputErrorJson(error, "Address lookup unavailable."));
  }
}
