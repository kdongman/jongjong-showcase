import type { BoothRealtimeEvent } from '@shared/protocol';
import type { CapturedFrame, ConnectParams } from '@shared/types';
import type { BoothCameraFacing } from '@shared/stage';
import type { CaptureViewportMode } from '@shared/boothSceneSpec';

export type BoothRemoteParticipant = {
  identity: string;
  connected: boolean;
};

export type BoothMediaListener = {
  onRemoteParticipant?: (participant: BoothRemoteParticipant | null) => void;
  onConnectionState?: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => void;
  onEvent?: (event: BoothRealtimeEvent) => void;
  onError?: (error: Error) => void;
  onLocalTrackChanged?: () => void;
};

export type BoothCameraDevice = {
  deviceId: string;
  label: string;
};

export type BoothCameraVisualState = {
  mirrorX: boolean;
  cameraFacing: BoothCameraFacing;
  mirrorMode: 'auto' | 'manual';
};

export interface CoupleBoothMediaService {
  connect(params: ConnectParams): Promise<void>;
  disconnect(): Promise<void>;
  enumerateCameras(): Promise<BoothCameraDevice[]>;
  selectCamera(deviceId: string): Promise<void>;
  enableCamera(): Promise<void>;
  enableMicrophone(): Promise<void>;
  disableCamera(): Promise<void>;
  sendReliableEvent(event: BoothRealtimeEvent): Promise<void>;
  subscribe(listener: BoothMediaListener): () => void;
  captureLocalFrame(options?: { captureViewportMode?: CaptureViewportMode }): Promise<CapturedFrame>;
  getRoom(): unknown;
  getLocalVideoElement(): HTMLVideoElement | null;
  setLocalVideoElement(el: HTMLVideoElement | null): void;
  /** Clear only if `expected` is still the registered element — prevents stale stage cleanup races. */
  clearLocalVideoElement(expected: HTMLVideoElement | null): boolean;
  isFrontCamera(): boolean;
  getCameraVisualState(): BoothCameraVisualState;
  setMirrorX(mirrorX: boolean): void;
  isConnected(): boolean;
  /**
   * Request HIGH remote subscribe quality and wait briefly for videoWidth to
   * stabilize before shutter capture. Never waits forever.
   */
  prepareHighQualityCapture(options?: {
    minWidth?: number;
    timeoutMs?: number;
  }): Promise<{
    localWidth: number;
    localHeight: number;
    remoteWidth: number;
    remoteHeight: number;
    ready: boolean;
  }>;
}
