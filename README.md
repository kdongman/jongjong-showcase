# JONGJONG Couple Booth

A browser based couple photo booth built with React, TypeScript, Vite, Supabase and LiveKit. Partners can join the same session, capture synchronized photos, compose a shared scene, and save a finished photo strip.

## Run locally

```bash
cd web
cp .env.example .env.local
# Set the public Supabase URL/key, LiveKit WebSocket URL, and app URL.
npm install
npm run dev
```

The web app expects the shared booth protocol in `../shared/coupleBooth` and the small shared pet model in `../shared/couplePet`.

## Backend

The browser client uses Supabase Edge Functions for LiveKit token issuance, guest links, and finalization. Deploy the functions in `supabase/functions` to a Supabase project configured with the required secrets. Keep `LIVEKIT_API_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` server-side; never add them to a `VITE_*` variable. See [web/README.md](web/README.md) for routing, auth redirect, and deployment notes.

The production app is configured around `https://jongjong-app.vercel.app`. A public source repository does not include production credentials or grant access to its hosted backend. The optional Same Space cutout mode downloads the MediaPipe WASM and model assets during `npm run prepare:mediapipe`; deployers should confirm the upstream asset terms and availability before enabling it.

## License

The source code is released under the MIT License. JONGJONG names, logos, character artwork, app screenshots, and other brand assets are excluded from that grant and remain with their respective rights holders. See [LICENSE](LICENSE).
