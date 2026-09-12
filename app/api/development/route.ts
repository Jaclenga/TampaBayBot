import { getNearbyDevelopment } from "@/lib/development/index.mjs";
import { readInput, inputPoint, json, RequestInputError } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const radius = input.radiusMeters ?? 1000;
    if (typeof radius !== "number" || ![250, 500, 1000, 2000].includes(radius))
      return json({ error: "Choose a supported search distance." }, 400);
    return json(await getNearbyDevelopment(inputPoint(input), radius));
  } catch (error) {
    if (error instanceof RequestInputError)
      return json({ error: error.message, code: error.code }, error.status);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Development records unavailable.",
      },
      400,
    );
  }
}
