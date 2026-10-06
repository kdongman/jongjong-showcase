import { useEffect, useRef, useState, type RefObject } from 'react';
import { RoomContext, VideoTrack, useTracks } from '@livekit/components-react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import type { BoothParticipantVisual } from '@shared/stage';
import { DEFAULT_BOOTH_PARTICIPANT_VISUAL, resolveBoothParticipantVisual } from '@shared/stage';
import type { WebLiveKitCoupleBoothMediaService } from '../media/WebLiveKitCoupleBoothMediaService';
import type { BoothCameraVisualState } from '../media/types';
import type { CaptureViewportMode } from '@shared/boothSceneSpec';

type Props = {
  room: Room | null;
  media: WebLiveKitCoupleBoothMediaService | null;
  remoteConnected: boolean;
  trackEpoch: number;
  hostUserId: string;
  guestUserId: string;
  localUserId: string;
  localVisual: BoothCameraVisualState;
  captureViewportMode?: CaptureViewportMode;
};

function visualFromMetadata(metadata: string | undefined): BoothParticipantVisual {
  try {
    return resolveBoothParticipantVisual(JSON.parse(metadata ?? ''));
  } catch {
    return resolveBoothParticipantVisual(null);
  }
}

function ParticipantPane({
  participantId,
  label,
  local,
  localRef,
  visual,
  connected,
}: {
  participantId: string;
  label: string;
  local: boolean;
  localRef?: RefObject<HTMLVideoElement | null>;
  visual: BoothParticipantVisual;
  connected: boolean;
}) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: true });
  const remote = tracks.find((track) => !track.participant.isLocal && track.participant.identity === participantId && track.publication != null);
  const transform = `translate(${visual.offsetX * 100}%, ${visual.offsetY * 100}%) scale(${visual.scale})`;
  return (
    <div className="booth-stage-participant">
      <div className="booth-stage-crop" style={{ transform }}>
        <div className={visual.mirrorX ? 'booth-stage-mirror is-mirrored' : 'booth-stage-mirror'}>
          {local ? (
            <video ref={localRef} autoPlay muted playsInline />
          ) : remote?.publication ? (
            <VideoTrack
              trackRef={remote as typeof remote & { publication: NonNullable<typeof remote.publication> }}
              muted
              playsInline
            />
          ) : (
            <div className="booth-stage-placeholder">
              <span className="booth-stage-placeholder-title">
                {connected ? '상대 영상을 불러오는 중…' : '상대를 기다리고 있어요'}
              </span>
              {!connected ? (
                <span className="booth-stage-placeholder-detail">상대가 들어오면 바로 함께 보여요.</span>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <span className="video-label">{label}</span>
    </div>
  );
}

export function BoothVideoStage({
  room,
  media,
  remoteConnected,
  trackEpoch,
  hostUserId,
  guestUserId,
  localUserId,
  localVisual,
  captureViewportMode = 'desktop',
}: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const [metadataEpoch, setMetadataEpoch] = useState(0);

  useEffect(() => {
    const el = localRef.current;
    media?.setLocalVideoElement(el);
    return () => {
      // Only release ownership of this stage's element — never clobber a newer stage.
      media?.clearLocalVideoElement(el);
    };
  }, [media, trackEpoch]);

  useEffect(() => {
    if (!room) return;
    const refresh = () => setMetadataEpoch((value) => value + 1);
    room.on(RoomEvent.ParticipantMetadataChanged, refresh);
    return () => { room.off(RoomEvent.ParticipantMetadataChanged, refresh); };
  }, [room]);

  const hostIsLocal = localUserId === hostUserId;
  const guestIsLocal = localUserId === guestUserId;
  const remoteHost = room?.remoteParticipants.get(hostUserId);
  const remoteGuest = room?.remoteParticipants.get(guestUserId);
  void metadataEpoch;
  const hostVisual = hostIsLocal
    ? { ...DEFAULT_BOOTH_PARTICIPANT_VISUAL, ...localVisual }
    : visualFromMetadata(remoteHost?.metadata);
  const guestVisual = guestIsLocal
    ? { ...DEFAULT_BOOTH_PARTICIPANT_VISUAL, ...localVisual }
    : visualFromMetadata(remoteGuest?.metadata);

  if (!room) {
    return (
      <div className="booth-shared-stage" data-capture-viewport={captureViewportMode} style={{ aspectRatio: captureViewportMode === 'mobile' ? '3 / 4' : '4 / 3' }} aria-label="Shared photo stage">
        <div className="booth-stage-participant">
          <div className="booth-stage-placeholder">
            <span className="booth-stage-placeholder-title">카메라 연결 중…</span>
          </div>
          <span className="video-label">나</span>
        </div>
        <div className="booth-stage-participant">
          <div className="booth-stage-placeholder">
            <span className="booth-stage-placeholder-title">상대를 기다리고 있어요</span>
            <span className="booth-stage-placeholder-detail">상대가 들어오면 바로 함께 보여요.</span>
          </div>
          <span className="video-label">상대</span>
        </div>
      </div>
    );
  }

  return (
    <RoomContext.Provider value={room}>
      <div className="booth-shared-stage" data-capture-viewport={captureViewportMode} style={{ aspectRatio: captureViewportMode === 'mobile' ? '3 / 4' : '4 / 3' }} aria-label="Shared photo stage">
        <ParticipantPane
          participantId={hostUserId}
          label={hostIsLocal ? '나' : '상대'}
          local={hostIsLocal}
          localRef={hostIsLocal ? localRef : undefined}
          visual={hostVisual}
          connected={remoteConnected}
        />
        <ParticipantPane
          participantId={guestUserId}
          label={guestIsLocal ? '나' : '상대'}
          local={guestIsLocal}
          localRef={guestIsLocal ? localRef : undefined}
          visual={guestVisual}
          connected={remoteConnected}
        />
      </div>
    </RoomContext.Provider>
  );
}
