import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  optimizeDeps: {
    include: ['qnn-react-cron', 'cronstrue'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:38491',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:38491',
        ws: true,
      },
    }
  }
})
