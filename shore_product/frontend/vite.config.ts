import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:5000'
const internalApiKey = process.env.INTERNAL_API_KEY || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('leaflet') || id.includes('@vietmap')) {
              return 'vendor-maps';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('xlsx') || id.includes('date-fns') || id.includes('dexie') || id.includes('axios')) {
              return 'vendor-utils';
            }
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        headers: internalApiKey ? { 'X-Internal-Api-Key': internalApiKey } : undefined,
      },
      '/uploads': {
        target: backendUrl,
        changeOrigin: true,
        headers: internalApiKey ? { 'X-Internal-Api-Key': internalApiKey } : undefined,
      },
      '/vietmap': {
        target: 'https://maps.vietmap.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vietmap\/?/, '/'),
      },
      '/maps': {
        target: 'https://maps.vietmap.vn',
        changeOrigin: true,
      },
      // GDACS / RainViewer — same-origin proxy so browser gets JSON (not CORS/HTML)
      '/gdacs': {
        target: 'https://www.gdacs.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gdacs/, ''),
      },
      '/rainviewer': {
        target: 'https://api.rainviewer.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/rainviewer/, ''),
      },
    }
  }
})
