import sources from "@/data/sources.json";
export async function GET() {
  return Response.json(sources, {
    headers: {
      "Content-Disposition":
        'attachment; filename="parcelprivateer-sources.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
