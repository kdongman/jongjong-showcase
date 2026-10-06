# JONGJONG Couple Booth (Web)

Desktop Vite + React + TypeScript client for synchronized Couple Booth sessions. Shares protocol/types with the mobile app via `@shared` → `../shared/coupleBooth`.

## Setup

```bash
cd web
cp .env.example .env
# fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_LIVEKIT_URL, VITE_APP_URL
# Set VITE_SAME_SPACE_MODE_ENABLED=true only after verifying MediaPipe assets in the target deployment.
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

**Never** put `LIVEKIT_API_SECRET` (or the Supabase service role key) in web env. LiveKit JWTs are issued only by the Supabase Edge Function `couple-booth-token`.

The deployed Edge Functions require a server-side allowlist; set it in Supabase,
not in Vite:

```text
COUPLE_BOOTH_ALLOWED_ORIGINS=https://jongjong-app.vercel.app,http://localhost:5173
```

The production fallback allows only `https://jongjong-app.vercel.app`; local origins
must be added explicitly to the target project's secret.

## Auth redirects

1. In Supabase Dashboard → Authentication → URL configuration:
   - **Site URL**: `VITE_APP_URL` (currently `https://jongjong-app.vercel.app`)
   - **Redirect URLs**: include `https://jongjong-app.vercel.app/**` and local `http://localhost:5173/**`
2. Magic-link / signup confirmation returns to `VITE_APP_URL` + the path stored in `sessionStorage.booth_return_to` (defaults to `/booth`, or `/booth/:sessionId` when deep-linked).
3. Production must be **HTTPS** (camera + Secure Cookies / PKCE).

## Deploy notes

| Topic | Guidance |
| --- | --- |
| SPA fallback | `web/vercel.json` serves `index.html` for `/booth/:sessionId` and `/login`. Configure Vercel's Root Directory as `web`. |
| HTTPS | Required for `getUserMedia` in modern browsers. |
| CSP `connect-src` | Allow your Supabase origin (`https://*.supabase.co`), LiveKit signaling (`wss://*.livekit.cloud` or your self-hosted WSS), and `https:` for signed storage URLs. Example: `connect-src 'self' https://YOUR_PROJECT.supabase.co wss://YOUR_LIVEKIT_HOST https:`. |
| Camera | Only one tab/app can hold a camera. Surface `NotReadableError` by closing Zoom/Teams/Meet. |
| Env | Public anon key only. Token minting stays on the edge function. |
| Same Space | `VITE_SAME_SPACE_MODE_ENABLED=true` enables host mode selection and post-capture cutout composition. It is a public build flag, never a secret. |

## Routes

- `/login` — email/password + magic link
- `/booth` — couple check, create session, list active
- `/booth/:sessionId` — invite accept/decline, LiveKit room, synced capture, 4-of-8 review, finalize 1080×2400 strip

## Architecture

- Media: `WebLiveKitCoupleBoothMediaService` (video only, `audio: false`)
- Frame capture: `ImageCapture.takePhoto` → canvas fallback; front camera mirrored to match CSS preview
- Final compose: offscreen canvas using `@shared/layout` geometry
- Shared: `@shared/protocol`, `selection`, `stateMachine`, `validation`, `poses`, `layout`
