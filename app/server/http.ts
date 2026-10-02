import type { z } from 'zod';

export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Size-checks before parsing, then validates. Returns a Response on failure. */
export async function readJson<T extends z.ZodType>(req: Request, maxBytes: number, schema: T) {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return fail(413, `Request is too large (limit ${Math.round(maxBytes / 1024)} KB).`);

  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return fail(413, `Request is too large (limit ${Math.round(maxBytes / 1024)} KB).`);
  }
  if (!text.trim()) return fail(400, 'Request body is empty.');

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'Request body is not valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(400, `Invalid request: ${issue.path.join('.') || 'body'} ${issue.message}`.trim());
  }
  return parsed.data as z.infer<T>;
}
