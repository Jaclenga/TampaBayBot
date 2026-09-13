import { GET as health } from '../health/route';
export async function GET(request: Request) {
  const response = await health(request);
  const report = await response.json();
  return Response.json(report, { status: report.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
