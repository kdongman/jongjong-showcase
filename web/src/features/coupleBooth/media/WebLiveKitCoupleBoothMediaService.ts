import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type RoomOptions,
} from 'livekit-client';
import { encodeBoothEvent, parseBoothEvent, type BoothRealtimeEvent } from '@shared/protocol';
import {
  COUPLE_BOOTH_PROTOCOL_VERSION,
  FINAL_JPEG_QUALITY,
  VIDEO_IDEAL_FPS,
  VIDEO_IDEAL_HEIGHT,
  VIDEO_IDEAL_WIDTH,
  VIDEO_MAX_FPS,
  type CapturedFrame,
  type ConnectParams,
} from '@shared/types';
import { resolveBoothRemoteParticipant } from '@shared/remoteParticipant';
import { formatCameraError } from '../../../lib/cameraErrors';
import type { BoothCameraDevice, BoothMediaListener, CoupleBoothMediaService } from './types';
import type { BoothCameraVisualState } from './types';
import { shouldClearLocalVideoElement } from './localVideoElementOwnership';
import { getCaptureFrameDimensions, type CaptureViewportMode } from '@shared/boothSceneSpec';

/**
 * Browser LiveKit media service for Couple Booth (video only).
 *
 * captureLocalFrame:
 * 1) ImageCapture.takePhoto on the local MediaStreamTrack when available
 * 2) Fallback: canvas drawImage from the local <video> preview
 * The one participant mirror setting is baked into the saved JPEG exactly once.
 */
export class WebLiveKitCoupleBoothMediaService implements CoupleBoothMediaService {
  private room: Room | null = null;
  private localTrack: LocalVideoTrack | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private listeners = new Set<BoothMediaListener>();
  private deviceId: string | undefined;
  private facingMode: 'user' | 'environment' = 'user';
  private cameraFacing: 'user' | 'environment' | 'unknown' = 'unknown';
  private mirrorX = true;
  private mirrorSelectedByUser = false;
  private localVideoEl: HTMLVideoElement | null = null;
  private expectedPartnerIdentity: string | null = null;

  constructor(private readonly diagnostics?: {
    attemptId: number;
    sessionKey: string;
    onPhase?: (phase: string, details?: Record<string, unknown>) => void;
  }) {}

  private log(event: string, details: Record<string, unknown> = {}): void {
    console.info('[couple-booth][room]', { ...this.diagnostics, event, ...details });
  }

  private phase(phase: string, details: Record<string, unknown> = {}): void {
    this.diagnostics?.onPhase?.(phase, details);
  }

  getRoom(): Room | null {
    return this.room;
  }

  isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  getLocalVideoElement(): HTMLVideoElement | null {
    return this.localVideoEl;
  }

  setLocalVideoElement(el: HTMLVideoElement | null): void {
    if (el === null) {
      this.localVideoEl = null;
      return;
    }
    if (this.localVideoEl === el) {
      this.attachLocalPreview();
      return;
    }
    this.localVideoEl = el;
    this.attachLocalPreview();
  }

  clearLocalVideoElement(expected: HTMLVideoElement | null): boolean {
    if (!shouldClearLocalVideoElement(this.localVideoEl, expected)) return false;
    if (this.localTrack && expected) {
      try {
        this.localTrack.detach(expected);
      } catch {
        /* element may already be detached */
      }
    }
    this.localVideoEl = null;
    return true;
  }

  setExpectedPartnerIdentity(identity: string | null | undefined): void {
    const next = identity?.trim() ? identity : null;
    if (this.expectedPartnerIdentity === next) return;
    this.expectedPartnerIdentity = next;
    if (this.room) this.emitRemote(this.findRemote(this.room));
  }

  isFrontCamera(): boolean {
    return this.cameraFacing === 'user' || (this.cameraFacing === 'unknown' && this.facingMode === 'user');
  }

  getCameraVisualState(): BoothCameraVisualState {
    return {
      mirrorX: this.mirrorX,
      cameraFacing: this.cameraFacing,
      mirrorMode: this.mirrorSelectedByUser ? 'manual' : 'auto',
    };
  }

  setMirrorX(mirrorX: boolean): void {
    this.mirrorX = mirrorX;
    this.mirrorSelectedByUser = true;
  }

  subscribe(listener: BoothMediaListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(params: ConnectParams): Promise<void> {
    // A service instance belongs to exactly one attempt and starts without a
    // Room. Do not emit a synthetic disconnect before its first connection.
    const options: RoomOptions = {
      // Hidden opacity video elements make adaptiveStream pick LOW layers.
      // Booth capture needs stable HIGH frames — disable adaptive stream.
      adaptiveStream: false,
      dynacast: true,
      videoCaptureDefaults: {
        facingMode: this.facingMode,
        resolution: {
          width: Math.max(VIDEO_IDEAL_WIDTH, 1920),
          height: Math.max(VIDEO_IDEAL_HEIGHT, 1080),
          frameRate: VIDEO_IDEAL_FPS,
        },
      },
      publishDefaults: {
        videoEncoding: { maxBitrate: 2_500_000, maxFramerate: VIDEO_MAX_FPS },
        simulcast: true,
        dtx: false,
      },
    };
    this.phase('room-object-create');
    const room = new Room(options);
    this.room = room;
    this.phase('room-listener-register');
    this.bindRoom(room);
    this.emitConnection('connecting');
    this.phase('room-connect-call');
    await room.connect(params.url, params.token, { autoSubscribe: true });
    this.phase('room-connect-returned', { roomState: room.state });
    if (room.state !== ConnectionState.Connected) throw new Error('ROOM_STATE_INVALID');
    this.phase('room-connected-validation');
      // Video only — never enable microphone / never create audio tracks.
      this.emitConnection('connected');
      this.log('connected');
      this.emitRemote(this.findRemote(room));
  }

  async setParticipantMetadata(metadata: Record<string, unknown>): Promise<void> {
    if (!this.room) throw new Error('ROOM_NOT_CONNECTED');
    await this.room.localParticipant.setMetadata(JSON.stringify({ ...metadata, protocolVersion: COUPLE_BOOTH_PROTOCOL_VERSION }));
  }

  async enumerateCameras(): Promise<BoothCameraDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
      }));
  }

  async selectCamera(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    const devices = await this.enumerateCameras();
    const label = devices.find((d) => d.deviceId === deviceId)?.label.toLowerCase() ?? '';
    if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
      this.facingMode = 'environment';
      if (!this.mirrorSelectedByUser) this.mirrorX = false;
    } else {
      this.facingMode = 'user';
      if (!this.mirrorSelectedByUser) this.mirrorX = true;
    }
    if (this.localTrack) {
      await this.disableCamera();
      await this.enableCamera();
    }
  }

  async enableCamera(): Promise<void> {
    if (!this.room) throw new Error('ROOM_NOT_CONNECTED');
    try {
      if (this.localTrack) {
        await this.room.localParticipant.publishTrack(this.localTrack, { source: Track.Source.Camera });
        this.attachLocalPreview();
        this.emitLocalTrackChanged();
        return;
      }
      this.localTrack = await createLocalVideoTrack({
        deviceId: this.deviceId,
        facingMode: this.deviceId ? undefined : this.facingMode,
        resolution: {
          width: Math.max(VIDEO_IDEAL_WIDTH, 1920),
          height: Math.max(VIDEO_IDEAL_HEIGHT, 1080),
          frameRate: VIDEO_IDEAL_FPS,
        },
      });
      this.syncCameraVisualState();
      if (import.meta.env?.DEV) {
        const settings = this.localTrack.mediaStreamTrack.getSettings();
        console.info('[couple-booth][camera]', {
          requested: { width: 1920, height: 1080, frameRate: VIDEO_IDEAL_FPS },
          actual: { width: settings.width ?? 0, height: settings.height ?? 0, frameRate: settings.frameRate ?? 0 },
          facingMode: settings.facingMode ?? 'unknown',
        });
      }
      await this.room.localParticipant.publishTrack(this.localTrack, { source: Track.Source.Camera });
      this.attachLocalPreview();
      this.emitLocalTrackChanged();
    } catch (error) {
      const wrapped = new Error(formatCameraError(error));
      this.emitError(wrapped);
      throw wrapped;
    }
  }

  async enableMicrophone(): Promise<void> {
    if (!this.room) throw new Error('ROOM_NOT_CONNECTED');
    try {
      if (this.localAudioTrack) {
        await this.room.localParticipant.publishTrack(this.localAudioTrack, { source: Track.Source.Microphone });
        return;
      }
      this.localAudioTrack = await createLocalAudioTrack();
      await this.room.localParticipant.publishTrack(this.localAudioTrack, { source: Track.Source.Microphone });
    } catch (error) {
      const wrapped = new Error(formatCameraError(error));
      this.emitError(wrapped);
      throw wrapped;
    }
  }

  async disableCamera(): Promise<void> {
    if (this.localTrack) {
      await this.room?.localParticipant.unpublishTrack(this.localTrack, true);
      this.localTrack.stop();
      this.localTrack = null;
      this.emitLocalTrackChanged();
    } else {
      await this.room?.localParticipant.setCameraEnabled(false);
    }
  }

  async sendReliableEvent(event: BoothRealtimeEvent): Promise<void> {
    if (!this.room) throw new Error('ROOM_NOT_CONNECTED');
    const data = encodeBoothEvent(event);
    await this.room.localParticipant.publishData(new Uint8Array(data), { reliable: true });
  }

  async captureLocalFrame(options: { captureViewportMode?: CaptureViewportMode } = {}): Promise<CapturedFrame> {
    const track = this.localTrack?.mediaStreamTrack;
    if (!track) throw new Error('LOCAL_CAMERA_TRACK_MISSING');

    const visual = this.getCameraVisualState();
    const mirrored = visual.mirrorX;
    let blob: Blob | null = null;
    let width = 0;
    let height = 0;

    if (typeof ImageCapture !== 'undefined') {
      try {
        const capture = new ImageCapture(track);
        const photo = await capture.takePhoto();
        const processed = await this.normalizeCapturedBlob(photo, false, options.captureViewportMode);
        blob = processed.blob;
        width = processed.width;
        height = processed.height;
      } catch {
        blob = null;
      }
    }

    if (!blob) {
      const fromVideo = await this.captureFromVideoElement(false);
      blob = fromVideo.blob;
      width = fromVideo.width;
      height = fromVideo.height;
    }

    const canonical = await this.normalizeCapturedBlob(blob, mirrored, options.captureViewportMode ?? 'desktop');
    blob = canonical.blob;
    width = canonical.width;
    height = canonical.height;
    const uri = URL.createObjectURL(blob);
    return {
      uri,
      width,
      height,
      mimeType: 'image/jpeg',
      capturedAt: Date.now(),
      mirrored,
      mirrorBakedIntoAsset: true,
      mirrorX: visual.mirrorX,
      cameraFacing: visual.cameraFacing,
    };
  }

  async disconnect(reason = 'service-disconnect'): Promise<void> {
    this.log('disconnect-requested', {
      reason,
      roomState: this.room?.state ?? 'none',
      hasCameraTrack: Boolean(this.localTrack),
      hasMicrophoneTrack: Boolean(this.localAudioTrack),
    });
    try {
      await this.disableCamera();
    } catch {
      /* ignore */
    }
    if (this.localAudioTrack) {
      await this.room?.localParticipant.unpublishTrack(this.localAudioTrack, true);
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    if (this.room) {
      this.room.removeAllListeners();
      await this.room.disconnect();
      this.room = null;
    }
    this.emitConnection('disconnected');
    this.emitRemote(null);
  }

  private attachLocalPreview(): void {
    if (!this.localVideoEl || !this.localTrack) return;
    this.localTrack.attach(this.localVideoEl);
  }

  private syncCameraVisualState(): void {
    const facing = this.localTrack?.mediaStreamTrack.getSettings().facingMode;
    this.cameraFacing = facing === 'environment' ? 'environment' : facing === 'user' ? 'user' : 'unknown';
    if (!this.mirrorSelectedByUser) {
      this.mirrorX = this.cameraFacing === 'environment' ? false : true;
    }
  }

  private async captureFromVideoElement(mirror: boolean): Promise<{ blob: Blob; width: number; height: number }> {
    const video = this.localVideoEl;
    if (!video) {
      // Last resort: draw from MediaStream via a temporary video element.
      return this.captureFromTrackCanvas(mirror);
    }
    // Element dimensions can be ready before its first decoded camera frame.
    // Wait for a real frame instead of relying on the countdown boundary.
    await waitForVideoFrame(video, true);
    if (video.videoWidth === 0 || video.videoHeight === 0) return this.captureFromTrackCanvas(mirror);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
    if (mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    assertUsableFrame(canvas);
    const blob = await canvasToJpeg(canvas);
    return { blob, width, height };
  }

  private async captureFromTrackCanvas(mirror: boolean): Promise<{ blob: Blob; width: number; height: number }> {
    const track = this.localTrack?.mediaStreamTrack;
    if (!track) throw new Error('LOCAL_CAMERA_TRACK_MISSING');
    const stream = new MediaStream([track]);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await waitForVideoFrame(video, true);
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) throw new Error('VIDEO_FRAME_UNAVAILABLE');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
    if (mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    assertUsableFrame(canvas);
    video.pause();
    video.srcObject = null;
    const blob = await canvasToJpeg(canvas);
    return { blob, width, height };
  }


  async prepareHighQualityCapture(options?: {
    minWidth?: number;
    timeoutMs?: number;
  }): Promise<{
    localWidth: number;
    localHeight: number;
    remoteWidth: number;
    remoteHeight: number;
    ready: boolean;
  }> {
    const minWidth = options?.minWidth ?? 640;
    const timeoutMs = Math.min(1500, Math.max(300, options?.timeoutMs ?? 900));
    const room = this.room;
    if (room) {
      for (const participant of room.remoteParticipants.values()) {
        const pub = participant.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined;
        try {
          pub?.setVideoQuality?.(VideoQuality.HIGH);
        } catch {
          /* best-effort */
        }
      }
      try {
        this.localTrack?.setPublishingQuality?.(VideoQuality.HIGH);
      } catch {
        /* best-effort */
      }
    }

    const started = Date.now();
    let localWidth = 0;
    let localHeight = 0;
    let remoteWidth = 0;
    let remoteHeight = 0;
    while (Date.now() - started < timeoutMs) {
      const localEl = this.localVideoEl;
      localWidth = localEl?.videoWidth ?? this.localTrack?.mediaStreamTrack?.getSettings?.().width ?? 0;
      localHeight = localEl?.videoHeight ?? this.localTrack?.mediaStreamTrack?.getSettings?.().height ?? 0;
      remoteWidth = 0;
      remoteHeight = 0;
      if (room) {
        const remote = this.findRemote(room);
        const media = remote?.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
        const settings = media?.getSettings?.();
        remoteWidth = Number(settings?.width ?? 0);
        remoteHeight = Number(settings?.height ?? 0);
        // Prefer attached remote video element dimensions when available.
        for (const el of document.querySelectorAll('video[data-same-space-source="remote"]')) {
          const video = el as HTMLVideoElement;
          if (video.videoWidth > remoteWidth) {
            remoteWidth = video.videoWidth;
            remoteHeight = video.videoHeight;
          }
        }
      }
      const localOk = localWidth >= minWidth;
      const remoteOk = remoteWidth === 0 || remoteWidth >= minWidth;
      if (localOk && remoteOk) {
        return { localWidth, localHeight, remoteWidth, remoteHeight, ready: true };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return {
      localWidth,
      localHeight,
      remoteWidth,
      remoteHeight,
      ready: localWidth > 0,
    };
  }

  private async normalizeCapturedBlob(

    blob: Blob,
    mirror: boolean,
    captureViewportMode?: CaptureViewportMode,
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const bitmap = await createImageBitmap(blob);
    const target = captureViewportMode
      ? getCaptureFrameDimensions(captureViewportMode)
      : { width: bitmap.width, height: bitmap.height };
    const width = target.width;
    const height = target.height;
    const sourceRatio = bitmap.width / Math.max(1, bitmap.height);
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (sourceRatio > targetRatio) {
      sw = bitmap.height * targetRatio;
      sx = (bitmap.width - sw) / 2;
    } else if (sourceRatio < targetRatio) {
      sh = bitmap.width / targetRatio;
      sy = (bitmap.height - sh) / 2;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('CANVAS_UNSUPPORTED');
    }
    if (mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close();
    assertUsableFrame(canvas);
    const normalized = await canvasToJpeg(canvas);
    return { blob: normalized, width, height };
  }

  private bindRoom(room: Room): void {
    room.on(RoomEvent.DataReceived, (payload) => {
      const event = parseBoothEvent(payload);
      if (!event) return;
      this.listeners.forEach((listener) => listener.onEvent?.(event));
    });
    room.on(RoomEvent.ParticipantConnected, () => this.emitRemote(this.findRemote(room)));
    room.on(RoomEvent.ParticipantDisconnected, () => this.emitRemote(this.findRemote(room)));
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (state === ConnectionState.Connected) this.emitConnection('connected');
      else if (state === ConnectionState.Connecting) this.emitConnection('connecting');
      else if (state === ConnectionState.Reconnecting) this.emitConnection('reconnecting');
      else this.emitConnection('disconnected');
    });
    room.on(RoomEvent.Disconnected, () => {
      this.emitConnection('disconnected');
      this.emitRemote(null);
    });
  }

  private findRemote(room: Room): RemoteParticipant | null {
    return resolveBoothRemoteParticipant(room.remoteParticipants.values(), this.expectedPartnerIdentity);
  }

  private emitRemote(participant: RemoteParticipant | null): void {
    const payload = participant ? { identity: participant.identity, connected: true } : null;
    this.listeners.forEach((listener) => listener.onRemoteParticipant?.(payload));
  }

  private emitConnection(state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'): void {
    this.listeners.forEach((listener) => listener.onConnectionState?.(state));
  }

  private emitError(error: Error): void {
    this.listeners.forEach((listener) => listener.onError?.(error));
  }

  private emitLocalTrackChanged(): void {
    this.listeners.forEach((listener) => listener.onLocalTrackChanged?.());
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG_ENCODE_FAILED'))),
      'image/jpeg',
      FINAL_JPEG_QUALITY,
    );
  });
}

function waitForVideoFrame(video: HTMLVideoElement, requireFreshFrame = false): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error('VIDEO_FRAME_TIMEOUT'));
    };
    const timer = window.setTimeout(fail, 2500);
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    if (!requireFreshFrame && video.videoWidth > 0 && video.videoHeight > 0) {
      done();
      return;
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => done());
      return;
    }
    const initialTime = video.currentTime;
    const poll = () => {
      if (settled) return;
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== initialTime) {
        done();
      } else {
        window.requestAnimationFrame(poll);
      }
    };
    video.onloadeddata = poll;
    window.requestAnimationFrame(poll);
  });
}

function assertUsableFrame(canvas: HTMLCanvasElement): void {
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error('FRAME_DIMENSIONS_INVALID');
  const sample = document.createElement('canvas');
  sample.width = Math.min(canvas.width, 32);
  sample.height = Math.min(canvas.height, 18);
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  if (!sampleCtx) throw new Error('CANVAS_UNSUPPORTED');
  sampleCtx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  let visiblePixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 8 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 24) visiblePixels += 1;
  }
  if (visiblePixels / (sample.width * sample.height) < 0.01) throw new Error('FRAME_BLANK');
}
