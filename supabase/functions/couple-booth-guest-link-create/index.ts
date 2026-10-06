import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts';
import {
  ACTIVE_SESSION_STATUSES,
  GUEST_LINK_TTL_MS,
  isInternalBoothTester,
  isUuid,
  mintGuestLinkToken,
  sha256Hex,
  tokenFingerprint,
} from '../_shared/guestLink.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflightResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { code: 'METHOD_NOT_ALLOWED' }, 405);

  const requestId = crypto.randomUUID();
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return jsonResponse(request, { code: 'UNAUTHORIZED' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const publicWebUrl = (Deno.env.get('COUPLE_BOOTH_PUBLIC_WEB_URL')
      ?? Deno.env.get('PUBLIC_WEB_URL')
      ?? 'https://jongjong-app.vercel.app').replace(/\/$/, '');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse(request, { code: 'UNAUTHORIZED' }, 401);
    const user = authData.user;

    const admin = createClient(supabaseUrl, serviceKey);
    if (!(await isInternalBoothTester(admin, user.id))) {
      return jsonResponse(request, { code: 'FORBIDDEN' }, 403);
    }

    const body = await request.json().catch(() => null);
    const sessionId = body?.sessionId;
    if (!isUuid(sessionId)) return jsonResponse(request, { code: 'INVALID_SESSION_ID' }, 400);

    const { data: session, error: sessionError } = await admin
      .from('couple_booth_sessions')
      .select('id, host_user_id, guest_user_id, status, expires_at, couple_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) return jsonResponse(request, { code: 'DATABASE_QUERY_FAILED' }, 500);
    if (!session) return jsonResponse(request, { code: 'SESSION_NOT_FOUND' }, 404);
    if (session.host_user_id !== user.id) return jsonResponse(request, { code: 'FORBIDDEN' }, 403);
    if (!ACTIVE_SESSION_STATUSES.has(session.status)) {
      return jsonResponse(request, { code: 'SESSION_NOT_ELIGIBLE' }, 409);
    }
    if (Date.parse(session.expires_at) <= Date.now()) {
      return jsonResponse(request, { code: 'SESSION_EXPIRED' }, 409);
    }

    // Keep a single unused link per session: revoke prior open ones.
    await admin
      .from('couple_booth_guest_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .is('revoked_at', null)
      .eq('use_count', 0);

    const rawToken = mintGuestLinkToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + GUEST_LINK_TTL_MS).toISOString();

    const { data: link, error: insertError } = await admin
      .from('couple_booth_guest_links')
      .insert({
        session_id: sessionId,
        token_hash: tokenHash,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: 1,
        use_count: 0,
      })
      .select('id, session_id, expires_at, max_uses, use_count, revoked_at, created_at')
      .single();
    if (insertError || !link) {
      console.error('[guest-link-create]', { requestId, message: insertError?.message });
      return jsonResponse(request, { code: 'LINK_CREATE_FAILED' }, 500);
    }

    console.info('[guest-link-create]', {
      requestId,
      linkId: link.id,
      sessionId,
      fingerprint: tokenFingerprint(rawToken),
    });

    return jsonResponse(request, {
      id: link.id,
      sessionId: link.session_id,
      url: `${publicWebUrl}/booth/guest/${rawToken}`,
      expiresAt: link.expires_at,
      maxUses: link.max_uses,
      useCount: link.use_count,
      revokedAt: null,
      claimedAt: link.claimed_at,
    });
  } catch (error) {
    console.error('[guest-link-create]', {
      requestId,
      message: error instanceof Error ? error.message : 'UNKNOWN',
    });
    return jsonResponse(request, { code: 'LINK_CREATE_FAILED' }, 500);
  }
});
