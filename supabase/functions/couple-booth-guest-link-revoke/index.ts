import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts';
import { isInternalBoothTester, isUuid } from '../_shared/guestLink.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflightResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { code: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return jsonResponse(request, { code: 'UNAUTHORIZED' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse(request, { code: 'UNAUTHORIZED' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    if (!(await isInternalBoothTester(admin, authData.user.id))) {
      return jsonResponse(request, { code: 'FORBIDDEN' }, 403);
    }

    const body = await request.json().catch(() => null);
    const linkId = body?.linkId;
    if (!isUuid(linkId)) return jsonResponse(request, { code: 'INVALID_LINK_ID' }, 400);

    const { data: link, error } = await admin
      .from('couple_booth_guest_links')
      .select('id, created_by, revoked_at')
      .eq('id', linkId)
      .maybeSingle();
    if (error) return jsonResponse(request, { code: 'DATABASE_QUERY_FAILED' }, 500);
    if (!link || link.created_by !== authData.user.id) {
      return jsonResponse(request, { code: 'FORBIDDEN' }, 403);
    }
    if (link.revoked_at) return jsonResponse(request, { ok: true, alreadyRevoked: true });

    const { error: updateError } = await admin
      .from('couple_booth_guest_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', linkId)
      .eq('created_by', authData.user.id);
    if (updateError) return jsonResponse(request, { code: 'REVOKE_FAILED' }, 500);
    return jsonResponse(request, { ok: true });
  } catch {
    return jsonResponse(request, { code: 'REVOKE_FAILED' }, 500);
  }
});
