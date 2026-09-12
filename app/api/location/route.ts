import { lookupAddress } from "@/lib/geospatial/index.mjs";
import { readInput, inputText, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    return json(await lookupAddress(inputText(input.address, 240)));
  } catch (error) {
    return inputErrorJson(error, "Address lookup unavailable.");
  }
}
