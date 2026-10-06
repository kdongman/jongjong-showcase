import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AccessToken, TrackSource } from 'https://esm.sh/livekit-server-sdk@2.13.3';
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts';
import { coupleBoothVideoGrant } from '../couple-booth-token/grant.ts';
import { sha256Hex, tokenFingerprint } from '../_shared/guestLink.ts';

const MEDIA_STATUSES = new Set(['invited', 'accepted', 'connecting', 'ready', 'capturing']);

function safeErrorMessage(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return secrets.reduce(
    (sanitized, secret) => (secret ? sanitized.replaceAll(secret, '[REDACTED]') : sanitized),
    message,
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflightResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { code: 'METHOD_NOT_ALLOWED' }, 405);

  const requestId = crypto.randomUUID();
  const apiKey = Deno.env.get('LIVEKIT_API_KEY') ?? '';
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

  try {
    const body = await request.json().catch(() => null);
    const rawToken = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!rawToken || rawToken.length < 20) {
      return jsonResponse(request, { code: 'GUEST_LINK_INVALID' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const livekitUrl = Deno.env.get('LIVEKIT_URL');
    if (!livekitUrl || !apiKey || !apiSecret) {
      return jsonResponse(request, { code: 'LIVEKIT_CONFIG_MISSING' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const tokenHash = await sha256Hex(rawToken);

    const { data: claimed, error: claimError } = await admin.rpc('claim_couple_booth_guest_link', {
      p_token_hash: tokenHash,
    });
    if (claimError || !claimed) {
      console.info('[guest-link-redeem]', {
        requestId,
        fingerprint: tokenFingerprint(rawToken),
        result: 'invalid',
      });
      return jsonResponse(request, {
        code: 'GUEST_LINK_INVALID',
        error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.',
      }, 410);
    }

    const link = Array.isArray(claimed) ? claimed[0] : claimed;
    const sessionId = link.session_id as string;

    const { data: session, error: sessionError } = await admin
      .from('couple_booth_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError || !session || !MEDIA_STATUSES.has(session.status)) {
      await admin.from('couple_booth_guest_links').update({ revoked_at: new Date().toISOString() }).eq('id', link.id);
      return jsonResponse(request, {
        code: 'GUEST_LINK_INVALID',
        error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.',
      }, 410);
    }

    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const livekitIdentity = `guest:${link.id}:${suffix}`;
    const ephemeralEmail = `booth-guest-${link.id.replace(/-/g, '').slice(0, 12)}-${suffix}@guest.internal`;
    const ephemeralPassword = base64Url(crypto.getRandomValues(new Uint8Array(24)));

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: ephemeralEmail,
      password: ephemeralPassword,
      email_confirm: true,
      user_metadata: {
        booth_guest_link_id: link.id,
        booth_guest: true,
        full_name: 'Booth Guest',
      },
    });
    if (createUserError || !createdUser.user) {
      console.error('[guest-link-redeem]', { requestId, phase: 'create_user', message: createUserError?.message });
      await admin.from('couple_booth_guest_links').update({ revoked_at: new Date().toISOString() }).eq('id', link.id);
      return jsonResponse(request, { code: 'GUEST_LINK_INVALID', error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.' }, 410);
    }
    const guestUserId = createdUser.user.id;

    // Profile without couple_id — booth access only via claimed guest link helper.
    await admin.from('profiles').upsert({
      id: guestUserId,
      email: ephemeralEmail,
      display_name: 'Booth Guest',
      couple_id: null,
      profile_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    const { error: bindError } = await admin
      .from('couple_booth_guest_links')
      .update({
        claimed_user_id: guestUserId,
        livekit_guest_identity: livekitIdentity,
      })
      .eq('id', link.id);
    if (bindError) {
      console.error('[guest-link-redeem]', { requestId, phase: 'bind_claim', message: bindError.message });
      return jsonResponse(request, { code: 'GUEST_LINK_INVALID', error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.' }, 410);
    }

    // Bind this session's guest seat to the ephemeral auth user for shot/RLS paths.
    const nextStatus = session.status === 'invited' ? 'accepted' : session.status;
    const { error: seatError } = await admin
      .from('couple_booth_sessions')
      .update({
        guest_user_id: guestUserId,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .neq('host_user_id', guestUserId);
    if (seatError) {
      console.error('[guest-link-redeem]', { requestId, phase: 'bind_seat', message: seatError.message });
      return jsonResponse(request, { code: 'GUEST_LINK_INVALID', error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.' }, 410);
    }

    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: passwordSession, error: signInError } = await anon.auth.signInWithPassword({
      email: ephemeralEmail,
      password: ephemeralPassword,
    });
    if (signInError || !passwordSession.session) {
      console.error('[guest-link-redeem]', { requestId, phase: 'sign_in', message: signInError?.message });
      return jsonResponse(request, { code: 'GUEST_LINK_INVALID', error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.' }, 410);
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: livekitIdentity,
      name: 'Booth Guest',
      ttl: '10m',
      metadata: JSON.stringify({
        sessionId,
        guestLinkId: link.id,
        guestUserId,
        featureVersion: 1,
        protocolVersion: 1,
        role: 'guest_link',
      }),
    });
    at.addGrant({
      ...coupleBoothVideoGrant(session.livekit_room_name),
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    });
    const livekitToken = await at.toJwt();

    console.info('[guest-link-redeem]', {
      requestId,
      linkId: link.id,
      sessionId,
      fingerprint: tokenFingerprint(rawToken),
      result: 'ok',
    });

    return jsonResponse(request, {
      sessionId,
      role: 'guest',
      expiresAt: link.expires_at,
      accessToken: passwordSession.session.access_token,
      refreshToken: passwordSession.session.refresh_token,
      livekit: {
        token: livekitToken,
        url: livekitUrl,
        roomName: session.livekit_room_name,
        identity: livekitIdentity,
      },
      session: {
        id: session.id,
        status: nextStatus,
        hostUserId: session.host_user_id,
        guestUserId,
        livekitRoomName: session.livekit_room_name,
        expiresAt: session.expires_at,
        sameSpaceEnabled: Boolean(session.same_space_enabled),
      },
    });
  } catch (error) {
    console.error('[guest-link-redeem]', {
      requestId,
      message: safeErrorMessage(error, [apiKey, apiSecret]),
    });
    return jsonResponse(request, {
      code: 'GUEST_LINK_INVALID',
      error: '이 테스트 링크는 만료되었거나 이미 사용되었습니다.',
    }, 410);
  }
});

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
