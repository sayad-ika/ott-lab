import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/live': 'http://localhost:8080',
      '/vod': 'http://localhost:8080',
      '/ad-break': 'http://localhost:8080',
    },
  },
})
