import { getPropertyContext } from "@/lib/geospatial/index.mjs";
import { readInput, inputPoint, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    return json(await getPropertyContext(inputPoint(input)));
  } catch (error) {
    return inputErrorJson(error, "Property information unavailable.");
  }
}
