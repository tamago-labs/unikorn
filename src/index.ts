#!/usr/bin/env node
import express from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const PORT = Number(process.env.PORT) || 3001

process.env.KANE_CLI_USER_AGENT = process.env.KANE_CLI_USER_AGENT || 'unikorn'

// --- User data ---
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.unikorn')
fs.mkdirSync(userDataPath, { recursive: true })

// --- Log capture ---
const logBuffer: string[] = []
const LOG_MAX = 500
function captureLog(level: string, args: any[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`
  logBuffer.push(line)
  if (logBuffer.length > LOG_MAX) logBuffer.shift()
}
const _origLog = console.log.bind(console)
console.log = (...args: any[]) => { captureLog('info', args); _origLog(...args) }
const _origErr = console.error.bind(console)
console.error = (...args: any[]) => { captureLog('error', args); _origErr(...args) }
const _origWarn = console.warn.bind(console)
console.warn = (...args: any[]) => { captureLog('warn', args); _origWarn(...args) }

app.use(express.json())

// --- AI Config ---
const aiConfigPath = path.join(userDataPath, 'aiConfig.json')

interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

function loadAiConfig(): AiConfig {
  const defaults: AiConfig = { baseUrl: '', apiKey: '', model: '' }
  try {
    if (fs.existsSync(aiConfigPath)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8')) }
    }
  } catch {}
  return defaults
}

function saveAiConfig(config: AiConfig): void {
  fs.writeFileSync(aiConfigPath, JSON.stringify(config, null, 2))
}

// --- Kane CLI status ---
interface KaneStatus {
  available: boolean
  version: string | null
  authenticated: boolean
  balance: { available: number; total: number } | null
}

function getKaneStatus(): KaneStatus {
  try {
    const version = execSync('kane-cli --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    let authenticated = false
    try {
      const who = execSync('kane-cli whoami', { encoding: 'utf-8', timeout: 5000 })
      authenticated = /authenticated/i.test(who)
    } catch { /* not authenticated */ }
    let balance: { available: number; total: number } | null = null
    if (authenticated) {
      try {
        const balRaw = execSync('kane-cli balance', { encoding: 'utf-8', timeout: 5000 })
        const availM = balRaw.match(/Available credits:\s*([\d.,]+)/i)
        const totalM = balRaw.match(/Total credits:\s*([\d.,]+)/i)
        if (availM && totalM) {
          balance = { available: Number(availM[1].replace(/,/g, '')), total: Number(totalM[1].replace(/,/g, '')) }
        }
      } catch { /* no balance */ }
    }
    return { available: true, version, authenticated, balance }
  } catch {
    return { available: false, version: null, authenticated: false, balance: null }
  }
}

// ============== REST API ==============

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'unikorn', port: PORT }))

// AI status
app.get('/api/ai/status', (_req, res) => {
  const config = loadAiConfig()
  res.json({
    configured: !!(config.baseUrl && config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    hasKey: !!config.apiKey,
  })
})

// Save AI config
app.post('/api/ai/config', (req, res) => {
  const { baseUrl, apiKey, model } = req.body
  const config = loadAiConfig()
  if (baseUrl !== undefined) config.baseUrl = baseUrl
  if (apiKey !== undefined) config.apiKey = apiKey
  if (model !== undefined) config.model = model
  saveAiConfig(config)
  res.json({ ok: true, configured: !!(config.baseUrl && config.apiKey) })
})

// Test AI connection
app.post('/api/ai/test', async (req, res) => {
  const config = loadAiConfig()
  if (!config.baseUrl || !config.apiKey) {
    return res.status(400).json({ error: 'Missing baseUrl or apiKey' })
  }
  try {
    const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "ok" if you can hear me.' }],
        max_tokens: 5,
      }),
    })
    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: errText.slice(0, 300) })
    }
    const data = await response.json()
    res.json({ ok: true, reply: data.choices?.[0]?.message?.content || 'connected' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Connection failed' })
  }
})

// Kane status
app.get('/api/kane/status', (_req, res) => {
  res.json(getKaneStatus())
})

// Logs
app.get('/api/logs', (_req, res) => res.json({ logs: logBuffer }))

app.post('/api/logs/clear', (_req, res) => {
  logBuffer.length = 0
  res.json({ ok: true })
})

// --- WebSocket ---
const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
  console.log('WS client connected')
  ws.on('error', (err) => console.error('WS error:', err.message))
})

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
