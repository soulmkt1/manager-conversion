import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 모드(vite)에서 /api 요청을 로컬 서버(8787)로 전달
    proxy: { '/api': 'http://localhost:8787' },
  },
})
