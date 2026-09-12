import { getPropertyContext } from "@/lib/geospatial/index.mjs";
import { readInput, inputPoint, json, RequestInputError } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    return json(await getPropertyContext(inputPoint(input)));
  } catch (error) {
    if (error instanceof RequestInputError)
      return json({ error: error.message, code: error.code }, error.status);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Property information unavailable.",
      },
      400,
    );
  }
}
