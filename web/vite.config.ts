import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const buildInfo = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_GIT_COMMIT_SHA ?? 'unknown',
  deployment: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VITE_VERCEL_DEPLOYMENT_ID ?? 'unknown',
};

export default defineConfig({
  define: {
    __COUPLE_BOOTH_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  plugins: [react()],
  // Shared Booth protocol files live outside the Vite root. Keep their transform
  // independent from the React Native app's Expo tsconfig.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2022',
        jsx: 'automatic',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared/coupleBooth', import.meta.url)),
      '@couplePet': fileURLToPath(new URL('../shared/couplePet', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  // Vite serves index.html for unknown paths in preview/dev — required for /booth/:sessionId deep links.
  appType: 'spa',
});
