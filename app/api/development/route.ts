import { getNearbyDevelopment } from "@/lib/development/index.mjs";
import { readInput, inputPoint, json, inputErrorJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const radius = input.radiusMeters ?? 1000;
    if (typeof radius !== "number" || ![250, 500, 1000, 2000].includes(radius))
      return json({ error: "Choose a supported search distance." }, 400);
    return json(await getNearbyDevelopment(inputPoint(input), radius));
  } catch (error) {
    return inputErrorJson(error, "Development records unavailable.");
  }
}
