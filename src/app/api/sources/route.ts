import { sources } from "@/lib/corpus";
export async function GET() {
  return Response.json(sources, {
    headers: {
      "Content-Disposition":
        'attachment; filename="tampabaybot-sources.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
