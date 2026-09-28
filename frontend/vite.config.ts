import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: base.endsWith('/') ? base : `${base}/`,
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
