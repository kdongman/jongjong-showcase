import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WebhookReceiver } from 'https://esm.sh/livekit-server-sdk@2.13.3';

/**
 * LiveKit webhook → authoritative booth media clock + third-party reject.
 * Configure LiveKit Cloud webhook URL to this function and set LIVEKIT_API_KEY/SECRET.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!apiKey || !apiSecret) return Response.json({ error: 'LIVEKIT_NOT_CONFIGURED' }, { status: 500 });

  const body = await request.text();
  const authHeader = request.headers.get('Authorization') ?? '';
  const receiver = new WebhookReceiver(apiKey, apiSecret);

  let event: {
    id?: string;
    event?: string;
    room?: { name?: string };
    participant?: { identity?: string };
  };
  try {
    event = await receiver.receive(body, authHeader);
  } catch (error) {
    return Response.json(
      { error: 'INVALID_WEBHOOK_SIGNATURE', detail: error instanceof Error ? error.message : String(error) },
      { status: 401 },
    );
  }

  const eventId = event.id ?? `${event.event}:${event.room?.name}:${event.participant?.identity}:${body.length}`;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { error: insertError } = await admin.from('couple_booth_webhook_events').insert({
    id: eventId,
    event_type: event.event ?? 'unknown',
    room_name: event.room?.name ?? null,
    participant_identity: event.participant?.identity ?? null,
    payload: { event: event.event, room: event.room?.name, identity: event.participant?.identity },
  });
  if (insertError) {
    if (String(insertError.code) === '23505' || String(insertError.message).toLowerCase().includes('duplicate')) {
      return Response.json({ ok: true, duplicate: true });
    }
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  const roomName = event.room?.name;
  if (!roomName) return Response.json({ ok: true, skipped: 'no_room' });

  const { data: session } = await admin
    .from('couple_booth_sessions')
    .select('*')
    .eq('livekit_room_name', roomName)
    .maybeSingle();
  if (!session) return Response.json({ ok: true, skipped: 'unknown_room' });

  await admin.from('couple_booth_webhook_events').update({ session_id: session.id }).eq('id', eventId);

  const identity = event.participant?.identity;
  const eventType = event.event ?? '';

  if (eventType === 'participant_joined' && identity) {
    let participantId = identity;
    if (identity.startsWith('guest:')) {
      const linkId = identity.split(':')[1];
      if (linkId) {
        const { data: link } = await admin
          .from('couple_booth_guest_links')
          .select('id, session_id, claimed_user_id, revoked_at, expires_at')
          .eq('id', linkId)
          .maybeSingle();
        if (
          link
          && link.session_id === session.id
          && !link.revoked_at
          && Date.parse(String(link.expires_at)) > Date.now()
          && link.claimed_user_id
        ) {
          participantId = String(link.claimed_user_id);
        } else {
          participantId = String(session.guest_user_id);
        }
      } else {
        participantId = String(session.guest_user_id);
      }
    }

    const { error: joinError } = await admin.rpc('mark_couple_booth_participant_join', {
      target_session: session.id,
      participant_id: participantId,
    });
    if (joinError) {
      if (String(joinError.message).includes('THIRD_PARTY_PARTICIPANT')) {
        await admin
          .from('couple_booth_sessions')
          .update({ status: 'failed', error_reason: 'THIRD_PARTY_PARTICIPANT', updated_at: new Date().toISOString() })
          .eq('id', session.id)
          .in('status', ['invited', 'accepted', 'connecting', 'ready', 'capturing']);
        return Response.json({ ok: true, rejectedThirdParty: true });
      }
      return Response.json({ error: joinError.message }, { status: 500 });
    }

    // Join alone must NOT start the 90s capture clock — that happens only via
    // start_couple_booth_capture when the host begins shooting after both ready.
    const { data: refreshed } = await admin.from('couple_booth_sessions').select('*').eq('id', session.id).single();
    if (refreshed?.host_joined_at && refreshed?.guest_joined_at && !refreshed.connected_at) {
      await admin.rpc('start_couple_booth_media_clock', { target_session: session.id, source: 'webhook' });
    }
  }

  if (
    (eventType === 'participant_left' || eventType === 'participant_connection_aborted') &&
    identity &&
    ['ready', 'capturing', 'connecting'].includes(session.status)
  ) {
    await admin
      .from('couple_booth_sessions')
      .update({ error_reason: `PEER_LEFT:${identity}`, updated_at: new Date().toISOString() })
      .eq('id', session.id);
  }

  if (eventType === 'room_finished' && ['ready', 'capturing', 'connecting', 'accepted'].includes(session.status)) {
    if (session.media_expires_at && Date.parse(session.media_expires_at) <= Date.now()) {
      await admin
        .from('couple_booth_sessions')
        .update({ status: 'review', updated_at: new Date().toISOString() })
        .eq('id', session.id)
        .in('status', ['ready', 'capturing', 'connecting']);
    }
  }

  return Response.json({ ok: true });
});
