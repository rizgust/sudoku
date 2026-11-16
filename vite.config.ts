import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset URLs, so the build also works from a sub-path or a local file server.
  base: './',
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      // Updates install in the background and apply on the next launch, like the old
      // network-first worker. The build fingerprints every file, so there's no cache name to bump.
      registerType: 'autoUpdate',
      injectRegister: false,
      // Icons are already precached by globPatterns below.
      includeManifestIcons: false,
      manifest: {
        name: 'Sudoku',
        short_name: 'Sudoku',
        description: 'A clean, ad-free Sudoku.',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f2ee',
        theme_color: '#f3f2ee',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'], // the plugin adds the manifest itself
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // The Nunito font comes from Google Fonts; keep a copy for offline play.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
