import { clientIp, gated, quota } from '../../server/ratelimit';

export async function GET(req: Request) {
  const q = await gated(() => quota.peek(clientIp(req)));
  if (q instanceof Response) return q;
  return Response.json(q, { headers: { 'cache-control': 'no-store, max-age=0' } });
}
