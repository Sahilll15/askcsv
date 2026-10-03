import { clientIp, quota } from '../../server/ratelimit';

export async function GET(req: Request) {
  return Response.json(await quota.peek(clientIp(req)), { headers: { 'cache-control': 'no-store, max-age=0' } });
}
