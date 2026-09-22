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
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('zustand')) {
              return 'vendor-react';
            }
            if (id.includes('leaflet') || id.includes('@vietmap')) {
              return 'vendor-maps';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('exceljs') || id.includes('jspdf') || id.includes('docx-preview') || id.includes('xlsx')) {
              return 'vendor-docs';
            }
            if (id.includes('@radix-ui') || id.includes('@dnd-kit') || id.includes('@tiptap') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }
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

