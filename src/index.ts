#!/usr/bin/env node
import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const PORT = Number(process.env.PORT) || 3001

process.env.KANE_CLI_USER_AGENT = process.env.KANE_CLI_USER_AGENT || 'unikorn'

app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'unikorn', port: PORT }))
app.get('/api/kane/status', (_req, res) => res.json({ available: false, reason: 'stub — wiring in next step' }))

// Serve Vite build in prod
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')))
  console.log(`Serving frontend from ${frontendDist}`)
} else {
  console.log('Frontend dist not found — run `npm run build` or `npm run dev` for Vite')
  app.get('/', (_req, res) => res.json({ ok: true, hint: 'Run frontend dev: npm run dev:web (vite :3000) + cli :3001' }))
}

server.listen(PORT, () => {
  console.log(`Unikorn CLI running at http://localhost:${PORT}`)
})
