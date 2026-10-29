import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Servi sous /scenariste/ sur GitHub Pages, à la racine en local.
  base: process.env.GITHUB_ACTIONS ? '/scenariste/' : '/',
  plugins: [react()],
  server: { port: 5173 },
})
