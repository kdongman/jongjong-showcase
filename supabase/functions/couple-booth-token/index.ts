import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AccessToken, TrackSource } from 'https://esm.sh/livekit-server-sdk@2.13.3';
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts';
import { coupleBoothVideoGrant } from './grant.ts';

const MEDIA_STATUSES = new Set(['accepted', 'connecting', 'ready', 'capturing']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value !== 'null'
    && value !== 'undefined'
    && UUID_PATTERN.test(value);
}

function validLiveKitRoomName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const roomName = value.trim();
  return roomName.length > 0
    && !roomName.includes('null')
    && !roomName.includes('undefined')
    && !roomName.includes('[object Object]');
}

function safeErrorMessage(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return secrets.reduce(
    (sanitized, secret) => secret ? sanitized.replaceAll(secret, '[REDACTED]') : sanitized,
    message,
  ).replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflightResponse(request);

  const requestId = crypto.randomUUID();
  let phase = 'request';
  try {
  phase = 'parse_body';
  const body = await request.json().catch(() => null);
  phase = 'validate_session_id';
  if (!body || !validSessionId(body.sessionId)) {
    return jsonResponse(request, {
      error: 'A valid booth session ID is required.',
      code: 'INVALID_SESSION_ID',
      phase,
      request_id: requestId,
    }, 400);
  }
  const sessionId = body.sessionId;

  phase = 'authenticate_user';
  const authorization = request.headers.get('Authorization');
  if (!authorization?.trim() || !/^Bearer\s+\S+/i.test(authorization)) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      code: 'AUTH_SESSION_MISSING',
      authUserId: null,
      boothSessionId: sessionId,
    });
    return jsonResponse(request, {
      error: 'Authorization bearer is required.',
      code: 'AUTH_SESSION_MISSING',
      phase,
      request_id: requestId,
    }, 401);
  }

  phase = 'validate_environment';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const functionBuildId = Deno.env.get('COUPLE_BOOTH_TOKEN_BUILD_ID') ?? 'local';
  const missing = [
    !supabaseUrl?.trim() ? 'SUPABASE_URL' : null,
    !anonKey?.trim() ? 'SUPABASE_ANON_KEY' : null,
    !livekitUrl?.trim() ? 'LIVEKIT_URL' : null,
    !apiKey?.trim() ? 'LIVEKIT_API_KEY' : null,
    !apiSecret?.trim() ? 'LIVEKIT_API_SECRET' : null,
  ].filter((name): name is string => Boolean(name));
  if (missing.length || !/^wss:\/\//i.test(livekitUrl ?? '')) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      code: 'TOKEN_CONFIG_ERROR',
      boothSessionId: sessionId,
      functionBuildId,
    });
    return jsonResponse(request, {
      error: 'LiveKit is not configured.',
      code: 'TOKEN_CONFIG_ERROR',
      phase,
      request_id: requestId,
      missing: missing.length ? missing : ['LIVEKIT_URL_FORMAT'],
    }, 500);
  }

  // Never trust body.userId / role / coupleId — only Authorization JWT.
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      code: 'AUTH_TOKEN_INVALID',
      authUserId: null,
      boothSessionId: sessionId,
      functionBuildId,
    });
    return jsonResponse(request, {
      error: 'Auth token is invalid or expired.',
      code: 'AUTH_TOKEN_INVALID',
      phase,
      request_id: requestId,
    }, 401);
  }
  const user = authData.user;

  phase = 'load_session';
  const { data: session, error } = await client
    .from('couple_booth_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    return jsonResponse(request, {
      error: 'Could not load the Booth session.',
      code: 'DATABASE_QUERY_FAILED',
      phase,
      request_id: requestId,
    }, 500);
  }
  if (!session) return jsonResponse(request, { code: 'SESSION_NOT_FOUND', request_id: requestId }, 404);

  phase = 'verify_participant';
  const isParticipant = session.host_user_id === user.id || session.guest_user_id === user.id;
  if (!isParticipant) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      code: 'NOT_SESSION_PARTICIPANT',
      authUserId: user.id,
      boothSessionId: sessionId,
      functionBuildId,
    });
    return jsonResponse(request, { code: 'NOT_SESSION_PARTICIPANT', request_id: requestId }, 403);
  }

  const { data: profile, error: profileError } = await client.from('profiles').select('couple_id').eq('id', user.id).maybeSingle();
  if (profileError) {
    return jsonResponse(request, {
      error: 'Could not verify Booth membership.',
      code: 'DATABASE_QUERY_FAILED',
      phase,
      request_id: requestId,
    }, 500);
  }
  if (!profile?.couple_id || profile.couple_id !== session.couple_id) {
    return jsonResponse(request, { code: 'NOT_SESSION_PARTICIPANT', request_id: requestId }, 403);
  }

  if (!MEDIA_STATUSES.has(session.status)) {
    return jsonResponse(request, { code: 'SESSION_NOT_MEDIA_ELIGIBLE', status: session.status, request_id: requestId }, 409);
  }
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    return jsonResponse(request, { code: 'SESSION_EXPIRED', request_id: requestId }, 409);
  }
  if (session.media_expires_at && Date.parse(session.media_expires_at) <= Date.now()) {
    return jsonResponse(request, { code: 'MEDIA_EXPIRED', request_id: requestId }, 409);
  }

  phase = 'build_livekit_token';
  // Identity is fixed to the authenticated user, never a client or participant-row value.
  const identity = user.id;
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      errorName: 'InvalidLiveKitIdentity',
      errorMessage: 'Authenticated user identity is empty',
    });
    return jsonResponse(request, { code: 'LIVEKIT_IDENTITY_INVALID', phase, request_id: requestId }, 500);
  }

  // The database owns the room naming contract; reject corrupted legacy values.
  const roomName = session.livekit_room_name;
  if (!validLiveKitRoomName(roomName)) {
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      code: 'SESSION_ROOM_MISSING',
      authUserId: user.id,
      boothSessionId: sessionId,
      functionBuildId,
    });
    return jsonResponse(request, { code: 'SESSION_ROOM_MISSING', phase, request_id: requestId }, 500);
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: identity,
    ttl: '10m',
    metadata: JSON.stringify({
      sessionId,
      userId: identity,
      coupleId: profile.couple_id,
      role: session.host_user_id === user.id ? 'host' : 'guest',
      featureVersion: 1,
      protocolVersion: 1,
    }),
  });
  at.addGrant({
    ...coupleBoothVideoGrant(roomName),
    // This SDK accepts protocol enum values here, not their string wire names.
    // Restrict publishing to the media sources Couple Booth actually needs.
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
  });

  const token = await at.toJwt();
  if (typeof token !== 'string' || !token) throw new Error('LIVEKIT_TOKEN_INVALID');
  phase = 'serialize_response';
  console.info('[couple-booth-token]', {
    requestId,
    phase,
    code: 'OK',
    authUserId: user.id,
    boothSessionId: sessionId,
    functionBuildId,
  });
  return jsonResponse(request,
    {
      token,
      url: livekitUrl,
      roomName,
    },
  );
  } catch (error) {
    // Never log credentials, JWTs, generated tokens, or secret values.
    console.error('[couple-booth-token]', {
      requestId,
      phase,
      errorName: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      errorMessage: safeErrorMessage(error, [apiKey ?? '', apiSecret ?? '']),
    });
    return jsonResponse(request, {
      error: 'LiveKit token issuance failed.',
      code: 'TOKEN_ISSUANCE_FAILED',
      phase,
      request_id: requestId,
    }, 500);
  }
});
