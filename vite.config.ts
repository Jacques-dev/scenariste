import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { SUPABASE_URL } from './src/config.ts'

// GitHub Pages ne permet pas d'en-têtes HTTP : la CSP est injectée en balise
// <meta> dans le HTML construit. Pas en dev : le rechargement à chaud de Vite
// a besoin de scripts inline.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // CodeMirror injecte ses styles dans des <style>
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${SUPABASE_URL ? ` ${SUPABASE_URL} ${SUPABASE_URL.replace('https://', 'wss://')}` : ''}`,
  "worker-src 'self' blob:", // worker pdf.js
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const injectCsp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend' as const,
      },
    ]
  },
}

export default defineConfig({
  // Servi sous /scenariste/ sur GitHub Pages, à la racine en local.
  base: process.env.GITHUB_ACTIONS ? '/scenariste/' : '/',
  plugins: [react(), injectCsp],
  server: { port: 5173 },
})
