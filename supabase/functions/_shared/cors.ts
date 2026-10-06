const DEFAULT_ALLOWED_ORIGINS = ['https://jongjong-app.vercel.app'];

function allowedOrigins(): string[] {
  return (Deno.env.get('COUPLE_BOOTH_ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .filter((origin) => origin !== '*');
}

export function corsHeadersForRequest(request: Request): HeadersInit | null {
  const origin = request.headers.get('Origin')?.trim().replace(/\/$/, '');
  if (!origin || !allowedOrigins().includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function corsPreflightResponse(request: Request): Response {
  const headers = corsHeadersForRequest(request);
  return headers
    ? new Response(null, { status: 204, headers })
    : new Response('Origin not allowed', { status: 403, headers: { Vary: 'Origin' } });
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeadersForRequest(request);
  if (!headers) return new Response('Origin not allowed', { status: 403, headers: { Vary: 'Origin' } });
  return Response.json(body, { status, headers });
}
