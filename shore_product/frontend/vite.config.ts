import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
// Vite chỉ nạp .env* vào import.meta.env cho code phía trình duyệt, KHÔNG vào process.env ở file
// config này. Không gọi loadEnv thì VITE_BACKEND_URL trong .env.local bị bỏ qua và proxy rơi về
// cổng 5000 — nơi có thể là một backend khác (container Docker cũ). Biến môi trường shell vẫn ưu tiên.
const env = loadEnv(mode, __dirname, '')
const backendUrl = process.env.VITE_BACKEND_URL || env.VITE_BACKEND_URL || 'http://localhost:5000'
const internalApiKey = process.env.INTERNAL_API_KEY || env.INTERNAL_API_KEY || ''

return {
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
            // Thư viện xuất PDF/Excel (vài MB) chỉ nạp khi bấm xuất hồ sơ: để rollup tự tách thành
            // chunk tải lười, không gộp vào 'vendor' tải ngay khi mở app.
            if (id.includes('pdfmake') || id.includes('exceljs')) return undefined;
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
}
})
