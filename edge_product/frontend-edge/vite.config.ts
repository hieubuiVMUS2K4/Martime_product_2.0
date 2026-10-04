import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
            // Keep interdependent React/UI packages together to avoid circular chunks.
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3002,
    host: '0.0.0.0', // Allow access from other devices on LAN
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:5001', // Edge Backend API
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:5001', // Static files from backend
        changeOrigin: true,
        secure: false,
      },
      '/vietmap': {
        target: 'https://maps.vietmap.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vietmap\/?/, '/'),
      },
      '/maps': {
        target: 'https://maps.vietmap.vn',
        changeOrigin: true,
      }
    },
  },
})
