/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_LIVEKIT_URL?: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Minimal ImageCapture typing for browsers that support it. */
interface ImageCapture {
  takePhoto(photoSettings?: unknown): Promise<Blob>;
  getPhotoCapabilities(): Promise<unknown>;
}

declare const ImageCapture: {
  prototype: ImageCapture;
  new (track: MediaStreamTrack): ImageCapture;
};
