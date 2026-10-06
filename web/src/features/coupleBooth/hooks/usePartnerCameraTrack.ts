import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
} from 'livekit-client';
import { isPartnerCameraTrack } from '@shared/partnerCameraTrack';
type Options = {
  room: Room | null;
  partnerUserId: string | null | undefined;
  /** Fired after a successful attach to the current video element (idempotent). */
  onAttached?: (info: { trackSid: string | null; element: HTMLVideoElement }) => void;
};

function publicationMatchesPartner(
  partnerUserId: string,
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
): boolean {
  return isPartnerCameraTrack({
    expectedParticipantId: partnerUserId,
    participantIdentity: participant.identity,
    source: String(publication.source ?? track.source ?? ''),
    kind: String(publication.kind ?? track.kind ?? ''),
    isLocal: participant.isLocal,
  });
}

function findPartnerCameraTrack(room: Room, partnerUserId: string): RemoteTrack | null {
  const participant = room.remoteParticipants.get(partnerUserId);
  if (!participant) return null;
  for (const publication of participant.trackPublications.values()) {
    const track = publication.track;
    if (!track || !publication.isSubscribed) continue;
    if (
      isPartnerCameraTrack({
        expectedParticipantId: partnerUserId,
        participantIdentity: participant.identity,
        source: String(publication.source ?? track.source ?? ''),
        kind: String(publication.kind ?? track.kind ?? ''),
        isLocal: participant.isLocal,
      })
    ) {
      return track;
    }
  }
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  if (
    cameraPub?.track
    && cameraPub.isSubscribed
    && isPartnerCameraTrack({
      expectedParticipantId: partnerUserId,
      participantIdentity: participant.identity,
      source: String(cameraPub.source ?? Track.Source.Camera),
      kind: String(cameraPub.kind ?? Track.Kind.Video),
      isLocal: participant.isLocal,
    })
  ) {
    return cameraPub.track;
  }
  return null;
}

function trackSidOf(track: RemoteTrack | null): string | null {
  return track?.sid ?? null;
}

/**
 * Attaches the partner's subscribed camera track to a video element.
 * Identity-scoped — never uses the first remote participant array entry.
 *
 * Works for both:
 * - remote track late arrival after Same Space mount
 * - remote track already present before Same Space mount
 *
 * The video element is stored in a ref so React state updates for hasRemoteTrack
 * do not re-run attach/detach. Same Space composition changes must never remount
 * this element or force a track cycle.
 */
export function usePartnerCameraTrack({ room, partnerUserId, onAttached }: Options) {
  const [hasRemoteTrack, setHasRemoteTrack] = useState(false);
  const [trackSid, setTrackSid] = useState<string | null>(null);
  const generationRef = useRef(0);
  const attachedTrackRef = useRef<RemoteTrack | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const onAttachedRef = useRef(onAttached);
  onAttachedRef.current = onAttached;

  const notifyAttached = (el: HTMLVideoElement, track: RemoteTrack) => {
    const sid = trackSidOf(track);
    setTrackSid(sid);
    setHasRemoteTrack(true);
    onAttachedRef.current?.({ trackSid: sid, element: el });
  };

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    const previous = videoElRef.current;
    videoElRef.current = node;
    const track = attachedTrackRef.current;
    if (previous && previous !== node && track) {
      try {
        track.detach(previous);
      } catch {
        /* ignore */
      }
    }
    if (node && track) {
      try {
        track.attach(node);
        void node.play().catch(() => undefined);
      } catch {
        /* ignore */
      }
      notifyAttached(node, track);
    }
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    const detach = () => {
      const attached = attachedTrackRef.current;
      const el = videoElRef.current;
      if (attached && el) {
        try {
          attached.detach(el);
        } catch {
          /* element may already be gone */
        }
      }
      attachedTrackRef.current = null;
      if (el) el.srcObject = null;
      if (isCurrent()) {
        setHasRemoteTrack(false);
        setTrackSid(null);
      }
    };

    const attach = (track: RemoteTrack) => {
      if (!isCurrent()) return;
      const el = videoElRef.current;
      if (!el) {
        // Element not mounted yet — keep track intent; ref callback will attach.
        // Critical for "track already present before mount" when effect races ref.
        attachedTrackRef.current = track;
        setTrackSid(trackSidOf(track));
        return;
      }
      if (attachedTrackRef.current === track && el.srcObject) {
        notifyAttached(el, track);
        void el.play().catch(() => undefined);
        return;
      }
      if (attachedTrackRef.current && attachedTrackRef.current !== track) {
        try {
          attachedTrackRef.current.detach(el);
        } catch {
          /* ignore */
        }
      }
      track.attach(el);
      attachedTrackRef.current = track;
      void el.play().catch(() => undefined);
      notifyAttached(el, track);
    };

    if (!room || !partnerUserId) {
      detach();
      return () => {
        generationRef.current += 1;
        detach();
      };
    }

    const existing = findPartnerCameraTrack(room, partnerUserId);
    if (existing) attach(existing);
    else detach();

    const onSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (!isCurrent()) return;
      if (!publicationMatchesPartner(partnerUserId, track, publication, participant)) return;
      attach(track);
    };

    const onUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (!isCurrent()) return;
      if (!publicationMatchesPartner(partnerUserId, track, publication, participant)) return;
      if (attachedTrackRef.current === track || attachedTrackRef.current == null) {
        detach();
      }
    };

    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      if (!isCurrent()) return;
      if (participant.identity !== partnerUserId) return;
      detach();
    };

    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    return () => {
      generationRef.current += 1;
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      detach();
    };
  }, [room, partnerUserId]);

  const getAttachment = useCallback(() => ({
    element: videoElRef.current,
    track: attachedTrackRef.current,
    trackSid: trackSidOf(attachedTrackRef.current),
    attached: Boolean(
      videoElRef.current
      && attachedTrackRef.current
      && videoElRef.current.srcObject,
    ),
  }), []);

  return {
    videoRef,
    hasRemoteTrack,
    trackSid,
    getAttachment,
  };
}
