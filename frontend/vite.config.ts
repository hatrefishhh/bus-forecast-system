import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 開發時把 /api 代理到 FastAPI；前端程式只使用相對路徑 /api。
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
