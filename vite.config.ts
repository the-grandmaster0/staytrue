import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: use our own SW file — VitePWA injects the precache
      // manifest into it at build time.  This way our push handler is preserved.
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: false, // We use our own public/manifest.json
      injectManifest: {
        // Only precache static assets — Supabase API calls are handled at runtime
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Don't precache SW itself
        globIgnores: ['sw.js'],
      },
      devOptions: {
        enabled: false, // Disable SW in dev to avoid confusion
      },
    }),
  ],
})
