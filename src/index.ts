#!/usr/bin/env node
import express from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { execSync, spawn, type ChildProcess } from 'child_process'
import OpenAI from 'openai'

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

// --- Scan / PRD helpers ---
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', '.testmuai', '.context', '.unikorn', '__pycache__', '.venv', 'vendor', '.cache', 'out', '.parcel-cache'])
const MAX_FILES = 20000
const MAX_DEPTH = 7

interface Inventory {
  folder: string
  fileCount: number
  topLevelFiles: string[]
  framework: string | null
  hasReadme: boolean
  readmeSnippet: string | null
  routes: string[]
  extCount: Record<string, number>
  packageManager: string | null
  truncated: boolean
  devPort: number | null
  startUrl: string | null
  hasAuth: boolean
}

function hashFolder(folder: string): string {
  return crypto.createHash('sha256').update(path.resolve(folder)).digest('hex').slice(0, 16)
}

function getProjectDir(folder: string): string {
  const h = hashFolder(folder)
  const dir = path.join(userDataPath, 'projects', h)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function detectFramework(pkg: any, files: string[], folder: string): string | null {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hasDep = (n: string) => n in deps
  // file based
  const hasFile = (names: string[]) => names.some((n) => files.includes(n) || fs.existsSync(path.join(folder, n)))
  if (hasDep('next') || hasFile(['next.config.js', 'next.config.mjs', 'next.config.ts'])) return 'next'
  if (hasDep('vite') || hasFile(['vite.config.js', 'vite.config.ts', 'vite.config.mjs'])) return 'vite'
  if (hasDep('express')) return 'express'
  if (hasDep('react') && hasFile(['vite.config.js', 'vite.config.ts'])) return 'vite+react'
  if (hasDep('react')) return 'react'
  if (hasDep('vue')) return 'vue'
  if (hasFile(['Cargo.toml'])) return 'rust'
  if (hasFile(['go.mod'])) return 'go'
  if (hasFile(['pyproject.toml', 'requirements.txt', 'setup.py'])) return 'python'
  return null
}

function scanInventory(folder: string): Inventory {
  const abs = path.resolve(folder)
  if (!fs.existsSync(abs)) throw new Error(`Folder not found: ${folder}`)
  const stat = fs.statSync(abs)
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${folder}`)

  let fileCount = 0
  let truncated = false
  const extCount: Record<string, number> = {}
  const routes: string[] = []
  const allFiles: string[] = []

  const topLevelFiles = fs.readdirSync(abs).slice(0, 30)

  let hasReadme = false
  let readmeSnippet: string | null = null

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH) return
    if (fileCount >= MAX_FILES) { truncated = true; return }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch { return }
    for (const e of entries) {
      if (fileCount >= MAX_FILES) { truncated = true; break }
      if (e.name.startsWith('.') && e.name !== '.env' && e.name !== '.env.example') {
        // allow .env but skip most dotfiles
        if (IGNORE_DIRS.has(e.name)) continue
        // skip .git already
      }
      if (IGNORE_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full, depth + 1)
      } else if (e.isFile()) {
        fileCount++
        const ext = path.extname(e.name).toLowerCase() || 'noext'
        extCount[ext] = (extCount[ext] || 0) + 1
        const rel = path.relative(abs, full).replace(/\\/g, '/')
        allFiles.push(rel)
        if (/route|page|api|controller|handler/i.test(rel) && /\.(ts|js|tsx|jsx|py|go|rs)$/.test(rel)) {
          if (routes.length < 20) routes.push(rel)
        }
        if (!hasReadme && /^readme\.md$/i.test(e.name)) {
          hasReadme = true
          try {
            const content = fs.readFileSync(full, 'utf-8').slice(0, 800)
            readmeSnippet = content
          } catch {}
        }
      }
    }
  }
  walk(abs, 0)

  let framework: string | null = null
  let packageManager: string | null = null
  let devPort: number | null = null
  let startUrl: string | null = null
  let hasAuth = false
  try {
    const pkgPath = path.join(abs, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      framework = detectFramework(pkg, topLevelFiles, abs)
      if (fs.existsSync(path.join(abs, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
      else if (fs.existsSync(path.join(abs, 'yarn.lock'))) packageManager = 'yarn'
      else if (fs.existsSync(path.join(abs, 'package-lock.json'))) packageManager = 'npm'
      else packageManager = 'npm'
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      hasAuth = Object.keys(deps).some((k) => /auth|passport|next-auth|clerk|supabase.*auth/i.test(k))
      // try to parse vite.config for server.port
      for (const cfg of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
        const p = path.join(abs, cfg)
        if (fs.existsSync(p)) {
          try {
            const txt = fs.readFileSync(p, 'utf-8')
            const m = txt.match(/port\s*:\s*(\d{4,5})/)
            if (m) devPort = parseInt(m[1], 10)
          } catch {}
          break
        }
      }
      if (!devPort) {
        if (framework && framework.includes('vite')) devPort = 5173
        else if (framework === 'next') devPort = 3000
        else if (framework === 'express') devPort = 3001
      }
      if (devPort) startUrl = `http://localhost:${devPort}`
    } else {
      framework = detectFramework(null, topLevelFiles, abs)
    }
  } catch {}
  // fallback auth check via file names
  if (!hasAuth) {
    const authHint = allFiles.some((f) => /auth|login|signin/i.test(f))
    if (authHint) hasAuth = true
  }

  const inv: Inventory = { folder: abs, fileCount, topLevelFiles, framework, hasReadme, readmeSnippet, routes, extCount, packageManager, truncated, devPort, startUrl, hasAuth }
  // persist
  const dir = getProjectDir(abs)
  fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify({ ...inv, scannedAt: new Date().toISOString() }, null, 2))
  return inv
}

function getPrdMeta(folder: string) {
  const dir = getProjectDir(path.resolve(folder))
  const prdPath = path.join(dir, 'PRD.md')
  const metaPath = path.join(dir, 'prd.meta.json')
  const exists = fs.existsSync(prdPath)
  let meta: any = null
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) } catch {}
  }
  let size: number | null = null
  let updatedAt: string | null = null
  let preview: string | null = null
  if (exists) {
    try {
      const stat = fs.statSync(prdPath)
      size = stat.size
      updatedAt = stat.mtime.toISOString()
      preview = fs.readFileSync(prdPath, 'utf-8').slice(0, 2000)
    } catch {}
  }
  return { exists, prdPath, metaPath, dir, size, updatedAt, preview, meta }
}

// ============== REST API ==============

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'unikorn', port: PORT, kaneJobs: true }))

app.get('/api/working-folder', (_req, res) => {
  res.json({ folder: process.cwd() })
})

// AI status
function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '•'.repeat(key.length)
  return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4)
}

app.get('/api/ai/status', (_req, res) => {
  const config = loadAiConfig()
  res.json({
    configured: !!(config.baseUrl && config.apiKey),
    baseUrl: config.baseUrl,
    apiKey: maskKey(config.apiKey),
    model: config.model,
    hasKey: !!config.apiKey,
  })
})

// Save AI config
app.post('/api/ai/config', (req, res) => {
  const { baseUrl, apiKey, model } = req.body
  const config = loadAiConfig()
  if (baseUrl !== undefined) config.baseUrl = baseUrl
  if (apiKey !== undefined && !apiKey.includes('•')) config.apiKey = apiKey
  if (model !== undefined) config.model = model
  saveAiConfig(config)
  res.json({ ok: true, configured: !!(config.baseUrl && config.apiKey) })
})

// Test AI connection (uses saved config only — frontend never sends the key)
app.post('/api/ai/test', async (_req, res) => {
  const config = loadAiConfig()
  if (!config.baseUrl || !config.apiKey) {
    return res.status(400).json({ error: 'Missing baseUrl or apiKey' })
  }
  if (config.apiKey.includes('•')) {
    return res.status(400).json({ error: 'API key appears masked or corrupted. Please re-enter and save.' })
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

// Scan folder (light, no AI)
app.post('/api/scan', (req, res) => {
  const { folder } = req.body || {}
  const target = folder || process.cwd()
  try {
    const inv = scanInventory(target)
    res.json({ ok: true, inventory: inv })
  } catch (err: any) {
    console.error('scan failed', err.message)
    res.status(400).json({ error: err.message || 'Scan failed' })
  }
})

app.get('/api/scan', (req, res) => {
  const folder = (req.query.folder as string) || process.cwd()
  try {
    const inv = scanInventory(folder)
    res.json({ ok: true, inventory: inv })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// PRD meta
app.get('/api/prd', (req, res) => {
  const folder = (req.query.folder as string) || process.cwd()
  try {
    const { exists, size, updatedAt, preview, meta } = getPrdMeta(folder)
    res.json({ exists, size, updatedAt, preview, meta, folder: path.resolve(folder) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/prd/content', (req, res) => {
  const folder = (req.query.folder as string) || process.cwd()
  try {
    const { exists, prdPath } = getPrdMeta(folder)
    if (!exists) return res.status(404).json({ error: 'PRD not found' })
    const content = fs.readFileSync(prdPath, 'utf-8')
    res.json({ content })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- Kane runner: async spawn (never blocks the Express event loop) ---
function kaneQuote(a: string): string {
  return /[\s"^&|<>()!]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a
}

function killTree(child: ChildProcess) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    // child.kill() only kills the cmd.exe wrapper on Windows — kill the whole tree
    try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }) } catch {}
  } else {
    try { child.kill('SIGTERM') } catch {}
  }
}

interface KaneRunResult { code: number; stdout: string; timedOut: boolean }

function runKaneAsync(args: string[], cwd: string, timeout = 120000): Promise<KaneRunResult> {
  return new Promise((resolve) => {
    const cmdline = ['kane-cli', ...args].map(kaneQuote).join(' ')
    const child = spawn(cmdline, {
      shell: true,
      cwd,
      env: { ...process.env, KANE_CLI_USER_AGENT: 'unikorn' },
      windowsHide: true,
    })
    let out = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeout)
    child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { out += d.toString() })
    child.on('error', (e: Error) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: out + (out ? '\n' : '') + (e.message || String(e)), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      let finalCode = code ?? 1
      // Windows libuv assertion can crash the shell even when kane succeeded (exit_code 0 in stdout)
      const isWindowsCrash = finalCode === -1073740791 || finalCode === 3221226505
      const hasSuccessInOut = /"exit_code"\s*:\s*0|"status"\s*:\s*"(created|unchanged|complete|trusted|passed)"/.test(out)
      if (isWindowsCrash && hasSuccessInOut) finalCode = 0
      if (timedOut) finalCode = 3
      resolve({ code: finalCode, stdout: out, timedOut })
    })
  })
}

// --- Tolerant parsing (kane output may mix prose lines with NDJSON) ---
function parseJsonLines(out: string): any[] {
  const rows: any[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try { rows.push(JSON.parse(t)) } catch {}
  }
  return rows
}

function parseMaybeJson(out: string): any | null {
  const t = out.trim()
  if (!t) return null
  try { return JSON.parse(t) } catch {}
  const lines = t.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) } catch {}
  }
  const start = t.indexOf('{')
  if (start >= 0) {
    try { return JSON.parse(t.slice(start)) } catch {}
  }
  return null
}

// --- Kane job runner: NDJSON streaming + pause/resume ---
// On assurance commands (context ingest/design tests) exit 3 = PAUSED (resumable session),
// NOT a failure. The pause questions + verbatim resume command arrive on the stream.
interface KaneJob {
  id: string
  type: 'ingest' | 'design' | 'testmd'
  folder: string
  status: 'running' | 'paused' | 'done' | 'error'
  code: number | null
  events: any[]
  rawTail: string[]
  sid: string | null
  resumeCmd: string | null
  questions: any[]
  error: string | null
  runEnd: any | null
  done?: any
  child?: ChildProcess
  opts?: { onClose?: (job: KaneJob, r: KaneRunResult) => void; timeout?: number }
  createdAt: string
  updatedAt: string
}

const kaneJobs = new Map<string, KaneJob>()
const JOB_TAIL = 100

function jobPublic(j: KaneJob) {
  return {
    id: j.id, type: j.type, folder: j.folder, status: j.status, code: j.code,
    events: j.events.slice(-40), rawTail: j.rawTail.slice(-20),
    sid: j.sid, questions: j.questions, error: j.error, runEnd: j.runEnd, done: j.done ?? null, updatedAt: j.updatedAt,
  }
}

function handleJobLine(j: KaneJob, line: string) {
  const t = line.trim()
  if (!t) return
  j.rawTail.push(t)
  if (j.rawTail.length > JOB_TAIL) j.rawTail.shift()
  if (!t.startsWith('{')) return
  let obj: any
  try { obj = JSON.parse(t) } catch { return }
  j.events.push(obj)
  if (j.events.length > JOB_TAIL) j.events.splice(0, j.events.length - JOB_TAIL)
  j.updatedAt = new Date().toISOString()
  if (obj.type === 'session_paused') {
    j.sid = obj.sid || obj.session_id || obj.sessionId || null
    j.resumeCmd = obj.resume || obj.resume_command || obj.resumeCommand || null
    const qs = obj.pending_questions || obj.questions
    j.questions = Array.isArray(qs) ? qs : []
  } else if (obj.type === 'run_end') {
    j.runEnd = obj
  } else if (obj.type === 'done') {
    j.done = obj
  } else if (obj.type === 'error') {
    j.error = obj.message || obj.error || obj.code || 'kane error'
  }
}

function launchKaneJob(j: KaneJob, cmdline: string) {
  j.status = 'running'
  j.code = null
  j.error = null
  j.questions = []
  j.sid = null
  j.resumeCmd = null
  j.runEnd = null
  j.updatedAt = new Date().toISOString()
  const child = spawn(cmdline, {
    shell: true,
    cwd: path.resolve(j.folder),
    env: { ...process.env, KANE_CLI_USER_AGENT: 'unikorn' },
    windowsHide: true,
  })
  j.child = child
  let buf = ''
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString()
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      handleJobLine(j, line)
    }
  })
  child.stderr?.on('data', (d: Buffer) => {
    const t = d.toString().trim()
    if (!t) return
    j.rawTail.push('[stderr] ' + t)
    if (j.rawTail.length > JOB_TAIL) j.rawTail.shift()
  })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; killTree(child) }, j.opts?.timeout ?? 600000)
  // Watchdog: headless testmd runs can stall on ask_user (no one to answer)
  let watchdog: ReturnType<typeof setInterval> | null = null
  if (j.type === 'testmd') {
    watchdog = setInterval(() => {
      if (j.status !== 'running' || !j.child) return
      const idleMs = Date.now() - Date.parse(j.updatedAt)
      const lastEv = j.events[j.events.length - 1]
      const askStuck = lastEv?.type === 'ask_user' && idleMs > 60000
      const idleStuck = idleMs > 240000
      if (askStuck || idleStuck) {
        ;(j as any).watchdogReason = askStuck
          ? 'Stuck on an ask_user prompt — auto-skipped (nothing can answer in a headless run)'
          : 'No activity for 4 minutes — auto-skipped'
        killTree(child)
      }
    }, 10000)
  }
  child.on('error', (e: Error) => {
    clearTimeout(timer)
    j.child = undefined
    j.status = 'error'
    j.code = 1
    j.error = e.message || String(e)
    j.updatedAt = new Date().toISOString()
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (watchdog) clearInterval(watchdog)
    j.child = undefined
    if (buf.trim()) handleJobLine(j, buf)
    let finalCode = code ?? 1
    const isWindowsCrash = finalCode === -1073740791 || finalCode === 3221226505
    const hasSuccessInOut = /"exit_code"\s*:\s*0|"status"\s*:\s*"(created|unchanged|complete|trusted|passed)"/.test(j.rawTail.join('\n'))
    if (isWindowsCrash && hasSuccessInOut) finalCode = 0
    if (timedOut) finalCode = 3
    j.code = finalCode
    j.updatedAt = new Date().toISOString()
    const isAssurance = j.type === 'ingest' || j.type === 'design'
    const doneStatus = j.done?.status
    if (finalCode === 0 || doneStatus === 'complete') {
      j.status = 'done'
    } else if ((doneStatus === 'paused' || finalCode === 3) && isAssurance && (j.sid || j.questions.length)) {
      j.status = 'paused'
    } else {
      j.status = 'error'
      if (!j.error) j.error = (j as any).watchdogReason || (finalCode === 3 ? 'Timed out or cancelled' : `kane-cli exited with code ${finalCode}`)
    }
    j.opts?.onClose?.(j, { code: finalCode, stdout: j.rawTail.join('\n'), timedOut })
  })
}

function newJob(type: KaneJob['type'], folder: string, opts?: KaneJob['opts']): KaneJob {
  const job: KaneJob = {
    id: crypto.randomBytes(8).toString('hex'),
    type, folder, status: 'running', code: null, events: [], rawTail: [],
    sid: null, resumeCmd: null, questions: [], error: null, runEnd: null,
    opts, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  kaneJobs.set(job.id, job)
  for (const [id, j] of kaneJobs) {
    if (kaneJobs.size <= 40) break
    if (!j.child && j.status !== 'running') kaneJobs.delete(id)
  }
  return job
}

function startKaneJob(type: KaneJob['type'], folder: string, args: string[], opts?: KaneJob['opts']): KaneJob {
  const job = newJob(type, folder, opts)
  launchKaneJob(job, ['kane-cli', ...args].map(kaneQuote).join(' '))
  return job
}

function resumeKaneJob(j: KaneJob, message: string) {
  if (!j.resumeCmd && !j.sid) {
    j.status = 'error'
    j.error = 'No resumable session for this job'
    return
  }
  const base = j.resumeCmd || (j.type === 'design'
    ? `kane-cli design tests --resume ${j.sid} --mode agent`
    : `kane-cli context extract --resume ${j.sid} --mode agent`)
  j.resumeCmd = null
  // Sessions can pause with NO pending questions (durable checkpoint) — resume verbatim, no --message
  launchKaneJob(j, message ? `${base} --message ${kaneQuote(message)}` : base)
}

// Persist testmd run results (run_end) — the "collected info" used later for slides/tutorial
function recordRun(folder: string, testFile: string, j: KaneJob) {
  try {
    const re: any = j.runEnd
    const runsPath = path.join(getProjectDir(folder), 'runs.json')
    let runs: any[] = []
    if (fs.existsSync(runsPath)) {
      try { runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8')) } catch {}
    }
    // Evidence pack: testmd runs seal one into <folder>/.testmuai/evidence/ — newest is this run's
    let evidencePack: string | null = null
    try {
      const evDir = path.join(folder, '.testmuai', 'evidence')
      if (fs.existsSync(evDir)) {
        const packs = fs.readdirSync(evDir)
          .filter((f) => f.endsWith('.evidence'))
          .map((f) => ({ f, t: fs.statSync(path.join(evDir, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t)
        if (packs[0]) evidencePack = path.join(evDir, packs[0].f)
      }
    } catch {}
    runs.push({
      file: path.relative(path.resolve(folder), testFile).replace(/\\/g, '/'),
      finishedAt: new Date().toISOString(),
      status: re?.status || (j.status === 'done' ? 'passed' : 'failed'),
      oneLiner: re?.one_liner ?? null,
      summary: re?.summary ?? null,
      duration: re?.duration ?? null,
      testUrl: re?.test_url ?? null,
      finalState: re?.final_state ?? null,
      evidencePack,
      error: j.error,
    })
    if (runs.length > 100) runs = runs.slice(-100)
    fs.writeFileSync(runsPath, JSON.stringify(runs, null, 2))
  } catch (e: any) {
    console.error('recordRun failed', e.message)
  }
}

app.get('/api/kane/assurance', async (req, res) => {
  const folder = path.resolve((req.query.folder as string) || process.cwd())
  try {
    const [all, inferred, coverR, sess] = await Promise.all([
      runKaneAsync(['context', 'list', '--json', '--type', 'usecase'], folder, 30000),
      runKaneAsync(['context', 'list', '--json', '--inferred', '--type', 'usecase'], folder, 30000),
      runKaneAsync(['cover', 'gaps', '--json'], folder, 60000),
      runKaneAsync(['context', 'sessions', '--json'], folder, 30000),
    ])
    const inferredIds = new Set(parseJsonLines(inferred.stdout)
      .map((r: any) => r.id || r.cid || r.ref || r.slug || r.name)
      .filter((v: any) => typeof v === 'string' && v))
    const ucs = parseJsonLines(all.stdout).map((r: any) => {
      const id = r.id || r.cid || r.ref || r.slug || r.name || ''
      return { ...r, _id: id, _title: r.title || r.name || id || 'use-case', _trusted: r.trust === 'trusted' || (!inferredIds.has(id) && r.trust !== 'derived') }
    })
    const cover = parseMaybeJson(coverR.stdout)
    const sessions = parseMaybeJson(sess.stdout)
    let tests: string[] = []
    try {
      const testDir = path.join(folder, '.testmuai', 'tests')
      if (fs.existsSync(testDir)) {
        const walk = (d: string) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) walk(p)
            else if (e.name.endsWith('_test.md')) tests.push(path.relative(folder, p).replace(/\\/g, '/'))
          }
        }
        walk(testDir)
        tests.sort()
      }
    } catch {}
    res.json({ folder, ucs, cover, sessions, tests })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/kane/ingest', (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const prdSrc = getPrdMeta(folder).prdPath
  if (!fs.existsSync(prdSrc)) return res.status(404).json({ error: 'PRD not found — generate it first' })
  // Ingest the PRD straight from the Unikorn store — nothing is written into the user's repo
  const job = startKaneJob('ingest', folder, ['context', 'ingest', prdSrc, '--mode', 'agent'], { timeout: 600000 })
  res.json({ ok: true, jobId: job.id })
})

app.post('/api/kane/review', async (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  try {
    let args: string[]
    if (Array.isArray(req.body.verdicts) && req.body.verdicts.length) {
      const tmp = path.join(getProjectDir(folder), `verdicts-${Date.now()}.json`)
      fs.writeFileSync(tmp, JSON.stringify(req.body.verdicts))
      args = ['context', 'review', '--verdicts', tmp, '--json']
    } else {
      // Explicit "Approve" click from the UI — approve the derived (unreviewed) use-cases
      const list = await runKaneAsync(['context', 'list', '--json', '--inferred', '--type', 'usecase'], folder, 30000)
      const ids = parseJsonLines(list.stdout)
        .map((r: any) => r.id || r.cid || r.ref || r.slug || r.name)
        .filter((v: any) => typeof v === 'string' && v)
      if (!ids.length) return res.json({ ok: true, message: 'nothing to approve' })
      args = ['context', 'review', '--approve', ...ids, '--json']
    }
    const r = await runKaneAsync(args, folder, 120000)
    res.json({ ok: r.code === 0, stdout: r.stdout.slice(-4000), code: r.code })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/kane/design', (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const uc = String(req.body.uc || 'uc-1')
  const max = Number(req.body.max) || 8
  const job = startKaneJob('design', folder, ['design', 'tests', '--use-case', uc, '--mode', 'agent', '--max', String(max)], { timeout: 600000 })
  res.json({ ok: true, jobId: job.id })
})

app.post('/api/kane/testmd/run', (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const file = String(req.body.file || '')
  if (!file) return res.status(400).json({ error: 'Missing test file' })
  const absFile = path.isAbsolute(file) ? file : path.join(folder, file)
  if (!fs.existsSync(absFile)) return res.status(404).json({ error: `Test file not found: ${file}` })
  // Variables via --variables-file (never inline JSON on the command line)
  const inv = (() => { try { return scanInventory(folder) } catch { return null } })()
  const startUrl = inv?.startUrl || `http://localhost:${inv?.devPort || 5173}`
  const varsFile = path.join(getProjectDir(folder), `vars-${Date.now()}.json`)
  fs.writeFileSync(varsFile, JSON.stringify({ start_url: { value: startUrl } }))
  const args = ['testmd', 'run', absFile, '--agent', '--variables-file', varsFile]
  if (req.body.headless !== false) args.push('--headless')
  const job = startKaneJob('testmd', folder, args, { timeout: 900000, onClose: (j) => recordRun(folder, absFile, j) })
  res.json({ ok: true, jobId: job.id, startUrl })
})

app.get('/api/kane/job/:id', (req, res) => {
  const j = kaneJobs.get(req.params.id)
  if (!j) return res.status(404).json({ error: 'Job not found' })
  res.json(jobPublic(j))
})

app.post('/api/kane/job/:id/answer', (req, res) => {
  const j = kaneJobs.get(req.params.id)
  if (!j) return res.status(404).json({ error: 'Job not found' })
  if (j.status !== 'paused') return res.status(400).json({ error: `Job is ${j.status}, not paused` })
  // Empty message = resume with no answer (checkpoint pauses carry no questions)
  const message = String(req.body.message || '').trim()
  if (!message && j.questions.length > 0) return res.status(400).json({ error: 'Missing answer' })
  resumeKaneJob(j, message)
  res.json(jobPublic(j))
})

// Resume a durable kane session by id — works even after a backend restart (sessions live 24h)
app.post('/api/kane/resume', (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const sid = String(req.body.sid || '')
  const verb = String(req.body.verb || 'design')
  if (!sid) return res.status(400).json({ error: 'Missing session id' })
  const args = verb === 'extract'
    ? ['context', 'extract', '--resume', sid, '--mode', 'agent']
    : ['design', 'tests', '--resume', sid, '--mode', 'agent']
  const job = startKaneJob(verb === 'extract' ? 'ingest' : 'design', folder, args, { timeout: 600000 })
  res.json({ ok: true, jobId: job.id })
})

app.post('/api/kane/job/:id/cancel', (req, res) => {
  const j = kaneJobs.get(req.params.id)
  if (!j) return res.status(404).json({ error: 'Job not found' })
  if (j.child) killTree(j.child)
  res.json({ ok: true })
})

app.get('/api/kane/runs', (req, res) => {
  const folder = path.resolve((req.query.folder as string) || process.cwd())
  const runsPath = path.join(getProjectDir(folder), 'runs.json')
  let runs: any[] = []
  try { if (fs.existsSync(runsPath)) runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8')) } catch {}
  res.json({ runs: runs.slice().reverse(), folder })
})

// Serve an evidence pack's local viewer — returns the hosted viewer URL (local-only, nothing uploads)
const evidenceServers = new Map<string, ChildProcess>()

app.post('/api/kane/evidence/serve', (req, res) => {
  const pack = String(req.body.pack || '')
  if (!pack || !fs.existsSync(pack)) return res.status(404).json({ error: 'Evidence pack not found' })
  const prev = evidenceServers.get(pack)
  if (prev) { killTree(prev); evidenceServers.delete(pack) }
  const child = spawn(['kane-cli', 'evidence', 'serve', kaneQuote(pack)].join(' '), {
    shell: true,
    windowsHide: true,
    env: { ...process.env, KANE_CLI_USER_AGENT: 'unikorn' },
  })
  evidenceServers.set(pack, child)
  let out = ''
  let answered = false
  const finish = (fn: () => void) => { if (!answered) { answered = true; fn() } }
  const timer = setTimeout(() => finish(() => res.status(504).json({ error: 'evidence serve timed out' })), 25000)
  child.stdout?.on('data', (d: Buffer) => {
    out += d.toString()
    const m = out.match(/viewer\s+(https?:\/\/\S+)/)
    if (m) {
      clearTimeout(timer)
      finish(() => res.json({ ok: true, viewer: m[1] }))
    }
  })
  child.stderr?.on('data', (d: Buffer) => { out += d.toString() })
  child.on('close', () => { clearTimeout(timer); finish(() => res.status(500).json({ error: 'evidence serve exited before serving' })) })
  child.on('error', (e: Error) => { clearTimeout(timer); finish(() => res.status(500).json({ error: e.message })) })
})

app.post('/api/kane/cover', async (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const r = await runKaneAsync(['cover', 'gaps', '--json'], folder, 120000)
  res.json({ ok: r.code === 0, stdout: r.stdout.slice(-4000), code: r.code, cover: parseMaybeJson(r.stdout) })
})

// Dev server prepare for kane tests
const devServers = new Map<string, ChildProcess>()

app.post('/api/kane/prepare', async (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const inv = (() => { try { return scanInventory(folder) } catch { return null } })()
  const port = inv?.devPort || 5173
  const url = `http://localhost:${port}`
  // Already reachable? Don't spawn a second server on the same port.
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 2500)
    const probe = await fetch(url, { signal: controller.signal })
    clearTimeout(t)
    if (probe.ok) return res.json({ ok: true, message: 'already running', port, startUrl: url })
  } catch {}
  const key = folder
  const existing = devServers.get(key)
  if (existing && !existing.killed) return res.json({ ok: true, message: 'already running', port, startUrl: url })
  try {
    const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: folder,
      shell: true,
      detached: false,
      stdio: 'ignore',
    })
    child.on('error', (e) => console.error('dev server error', e.message))
    child.unref()
    devServers.set(key, child)
    console.log(`Dev server spawned for ${folder} on port ${port} pid ${child.pid}`)
    res.json({ ok: true, port, startUrl: url, pid: child.pid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/kane/prepare/status', async (req, res) => {
  const folder = path.resolve((req.query.folder as string) || process.cwd())
  const inv = (() => { try { return scanInventory(folder) } catch { return null } })()
  const port = inv?.devPort || 5173
  const url = `http://localhost:${port}`
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    const r = await fetch(url, { signal: controller.signal })
    clearTimeout(t)
    res.json({ ok: r.ok, status: r.status, port, startUrl: url, running: r.ok })
  } catch (err: any) {
    res.json({ ok: false, running: false, port, startUrl: url, error: err.message })
  }
})

app.post('/api/kane/prepare/stop', (req, res) => {
  const folder = path.resolve(req.body.folder || process.cwd())
  const child = devServers.get(folder)
  if (child && child.pid) {
    killTree(child)
    devServers.delete(folder)
    return res.json({ ok: true, stopped: true })
  }
  res.json({ ok: true, stopped: false, message: 'not running' })
})

// Kane status (global)
app.get('/api/kane/status', (_req, res) => {
  res.json(getKaneStatus())
})

// Logs
app.get('/api/logs', (_req, res) => res.json({ logs: logBuffer }))

app.post('/api/logs/clear', (_req, res) => {
  logBuffer.length = 0
  res.json({ ok: true })
})

// --- Artifacts (tutorial / slide deck) — PRD + collected runs + evidence screenshots → HTML ---
function zipExtract(buf: Buffer, mapName: (name: string) => string | null, outDir: string, limit = 60): string[] {
  const out: string[] = []
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return out
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const lho = buf.readUInt32LE(off + 42)
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8')
    const outName = mapName(name)
    if (outName) {
      try {
        const lnLen = buf.readUInt16LE(lho + 26)
        const leLen = buf.readUInt16LE(lho + 28)
        const dataStart = lho + 30 + lnLen + leLen
        const data = buf.slice(dataStart, dataStart + compSize)
        const raw = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? data : null
        if (raw) {
          fs.writeFileSync(path.join(outDir, outName), raw)
          out.push(path.join(outDir, outName))
          if (out.length >= limit) break
        }
      } catch {}
    }
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

// Map each run record to its evidence pack (runs are sequential; pack mtimes line up)
function mapRunPacks(folder: string, runs: any[]): Record<string, string> {
  const map: Record<string, string> = {}
  try {
    const evDir = path.join(folder, '.testmuai', 'evidence')
    if (!fs.existsSync(evDir)) return map
    const packs = fs.readdirSync(evDir)
      .filter((f) => f.endsWith('.evidence'))
      .map((f) => ({ p: path.join(evDir, f), t: fs.statSync(path.join(evDir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t)
    const sorted = [...runs].sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)))
    const used = new Set<number>()
    for (const r of sorted) {
      const target = Date.parse(r.finishedAt)
      if (!Number.isFinite(target)) continue
      let best = -1
      let bestDiff = Infinity
      packs.forEach((p, i) => {
        if (used.has(i)) return
        const d = Math.abs(p.t - target)
        if (d < bestDiff) { bestDiff = d; best = i }
      })
      if (best >= 0 && bestDiff < 10 * 60 * 1000) {
        used.add(best)
        map[r.file] = packs[best].p
      }
    }
  } catch {}
  return map
}

// Inline referenced asset images as base64 → truly self-contained pages
function inlineImages(html: string, assetsDir: string): string {
  return html.replace(/src=["'](assets\/[^"']+)["']/g, (m0: string, rel: string) => {
    try {
      const abs = path.join(assetsDir, rel.slice('assets/'.length))
      const b = fs.readFileSync(abs)
      if (b.length > 600_000) return m0
      return `src="data:image/png;base64,${b.toString('base64')}"`
    } catch {
      return m0
    }
  })
}

function findArtifactDir(id: string): string | null {
  const root = path.join(userDataPath, 'projects')
  try {
    for (const proj of fs.readdirSync(root)) {
      const arts = path.join(root, proj, 'artifacts')
      if (!fs.existsSync(arts)) continue
      for (const kind of fs.readdirSync(arts)) {
        const d = path.join(arts, kind, id)
        if (fs.existsSync(path.join(d, 'meta.json'))) return d
      }
    }
  } catch {}
  return null
}

app.get('/api/artifacts', (req, res) => {
  const folder = path.resolve((req.query.folder as string) || process.cwd())
  const dir = path.join(getProjectDir(folder), 'artifacts')
  const list: any[] = []
  try {
    for (const kind of fs.readdirSync(dir)) {
      const kindDir = path.join(dir, kind)
      if (!fs.statSync(kindDir).isDirectory()) continue
      for (const id of fs.readdirSync(kindDir)) {
        const metaPath = path.join(kindDir, id, 'meta.json')
        if (!fs.existsSync(metaPath)) continue
        try { list.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8'))) } catch {}
      }
    }
  } catch {}
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  res.json({ artifacts: list, folder })
})

app.post('/api/artifacts/delete', (req, res) => {
  const id = String(req.body.id || '')
  const d = findArtifactDir(id)
  if (!d) return res.status(404).json({ error: 'Artifact not found' })
  try { fs.rmSync(d, { recursive: true, force: true }) } catch (e: any) { return res.status(500).json({ error: e.message }) }
  res.json({ ok: true })
})

// Serve generated artifact pages
app.get('/artifacts/:id', (req, res) => {
  const d = findArtifactDir(req.params.id)
  if (!d) return res.status(404).send('Artifact not found')
  res.sendFile(path.join(d, 'index.html'))
})

app.get('/artifacts/:id/*', (req, res) => {
  const d = findArtifactDir(req.params.id)
  if (!d) return res.status(404).send('Artifact not found')
  const rest = (req.params as any)[0] as string
  const p = path.resolve(d, rest || '')
  if (!isInsideFolder(d, p) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).send('Not found')
  res.sendFile(p)
})

// Inject a Prev/Next bar + arrow-key handler into every artifact page (deterministic navigation)
function stripKeydownScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => (/ArrowLeft|ArrowRight/.test(m) ? '' : m))
}

function injectPageNav(html: string, prevFile: string | null, nextFile: string | null, pos: number, total: number): string {
  const nav = `
<div style="position:fixed;bottom:16px;right:16px;display:flex;gap:8px;align-items:center;z-index:50;font-family:Manrope,sans-serif">
  ${prevFile ? `<a href="${prevFile}" style="text-decoration:none;padding:8px 14px;border-radius:9999px;background:#fff;border:1px solid #E5DEFA;color:#251F33;font-size:12px;font-weight:600">&#8592; Prev</a>` : ''}
  <span style="font-size:12px;color:#8A7FA6;font-family:'JetBrains Mono',monospace">${pos} / ${total}</span>
  ${nextFile ? `<a href="${nextFile}" style="text-decoration:none;padding:8px 14px;border-radius:9999px;background:#7C5CFC;color:#fff;font-size:12px;font-weight:600">Next &#8594;</a>` : `<a href="index.html" style="text-decoration:none;padding:8px 14px;border-radius:9999px;background:#fff;border:1px solid #E5DEFA;color:#251F33;font-size:12px;font-weight:600">Index</a>`}
</div>
<script>
(function(){
  var prev=${prevFile ? `"${prevFile}"` : 'null'},next=${nextFile ? `"${nextFile}"` : 'null'};
  document.addEventListener('keydown',function(e){
    if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.key==='ArrowRight'&&next){e.preventDefault();location.href=next}
    if(e.key==='ArrowLeft'&&prev){e.preventDefault();location.href=prev}
  });
})();
</script>`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${nav}\n</body>`)
  return html + nav
}

const SAVE_ARTIFACT_TOOL: any = {
  type: 'function',
  function: {
    name: 'save_artifact',
    description: 'Save the generated artifact. Call once when every page is ready.',
    parameters: {
      type: 'object',
      properties: {
        index_html: { type: 'string', description: 'Viewer/cover page HTML with navigation links to every page' },
        pages: {
          type: 'array',
          description: 'One entry per slide/step, in order',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'e.g. slide-01.html or step-01.html' },
              title: { type: 'string' },
              html: { type: 'string', description: 'Full self-contained HTML document' },
            },
            required: ['file', 'title', 'html'],
          },
        },
      },
      required: ['index_html', 'pages'],
    },
  },
}

const SHARED_RENDER_RULES = `HARD RULES for every HTML page:
- Full HTML document: <!DOCTYPE html>, Tailwind via <script src="https://cdn.tailwindcss.com"></script>, fonts Manrope + JetBrains Mono via Google Fonts.
- Self-contained: reference images ONLY as <img src="assets/..."> using the exact paths given in the manifest (they are inlined automatically afterwards). Never invent other image paths.
- No external APIs, no fetch, no frameworks. Do NOT add navigation scripts — prev/next navigation and arrow-key handling are injected automatically by Unikorn. index_html lists every page as plain <a href> links.
- Every factual product claim must trace to the PRD or the run evidence. Show run-verified facts with a small "✓ verified" badge quoting the observed value. Never invent features, metrics or numbers.
- Footer stamp on every page: "Verified by Kane · <passed>/<total> checks passed".`

function artifactOutlineSystem(kind: string, purpose: string): string {
  if (kind === 'tutorial') {
    return `You are Unikorn — design the outline for a step-by-step TUTORIAL built from a PRD and real verified test runs.
One page per step, following the actual use-case flow. Each step reuses one acceptance criterion and its run-verified observed value.
Output ONLY JSON: {"title":"...","subtitle":"...","sections":[{"id":"s1","title":"...","layout":"screenshot|bullets|split|hero","bullets":["..."],"verified":"<observed value from the runs, or null>","image":"<assets/... path from the manifest, or null>","source":"<file or 'AI-generated, unverified'>"}]}
Rules: max 4 bullets per page, short. 'verified' MUST quote the real observed value from the runs when available. Images ONLY from the manifest. Layout 'screenshot' requires an image.`
  }
  if (purpose === 'pitch') {
    return `You are Unikorn — design the outline for an investor PITCH DECK built from a PRD and real verified test runs.
Arc: problem → solution (one-liner + demo hint) → how it works (product tour, 2-3 slides) → proof (verified-run stats + 2-3 concrete observed values) → tech stack → roadmap/ask.
Output ONLY JSON: {"title":"...","subtitle":"...","sections":[{"id":"s1","title":"...","layout":"hero|bullets|proof|screenshot|split","bullets":["..."],"verified":"<observed value or null>","image":"<assets/... or null>","source":"<file or 'AI-generated, unverified'>"}]}
Rules: max 5 bullets per slide. 'proof' slides must quote real observed values from the runs. Images ONLY from the manifest. Never invent metrics, users or revenue.`
  }
  return `You are Unikorn — design the outline for a product DEMO WALKTHROUGH deck built from a PRD and real verified test runs.
One slide per feature/use-case in logical order: what it does, how to trigger it, the verified observed result.
Output ONLY JSON: {"title":"...","subtitle":"...","sections":[{"id":"s1","title":"...","layout":"screenshot|bullets|split|hero","bullets":["..."],"verified":"<observed value or null>","image":"<assets/... or null>","source":"<file or 'AI-generated, unverified'>"}]}
Rules: max 4 bullets per slide. 'verified' quotes the real observed value from the runs. Images ONLY from the manifest.`
}

const ARTIFACT_RENDER_SYSTEM = `You are Unikorn — render a final HTML artifact from an approved outline.
Call save_artifact ONCE with:
- index_html: a cover/viewer page listing all pages as <a href="slide-01.html"> links, with the deck title and a tiny arrow-key prev/next script (under 30 lines).
- pages: one object per section, in order: file "slide-01.html"/"step-01.html" (zero-padded), title, html (full document).
${SHARED_RENDER_RULES}
Design: each page is a centered stage (max-w-5xl, min-h-screen flex) that looks good full-screen. Follow the user's design direction verbatim when given; otherwise house style: bg #FBFAFE, white cards with border #EFEAFB, accent gradient 135deg #7C5CFC→#B79CFF, Manrope text, JetBrains Mono for values, rounded-2xl.`

function buildFallbackIndex(outline: any, pages: any[]): string {
  const links = pages.map((p, i) => `<li><a class="text-[#7C5CFC] underline" href="${p.file}">${p.title || p.file}</a></li>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${outline?.title || 'Artifact'}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#FBFAFE] min-h-screen p-10"><h1 class="text-2xl font-extrabold">${outline?.title || 'Artifact'}</h1><ul class="mt-4 space-y-2">${links}</ul></body></html>`
}

async function handleArtifactGeneration(ws: WebSocket, sess: WsSession, msg: any) {
  const folder = path.resolve(msg.folder || sess.folder || process.cwd())
  const kind: 'tutorial' | 'deck' = msg.kind === 'tutorial' ? 'tutorial' : 'deck'
  const purpose = kind === 'deck' ? (msg.purpose === 'pitch' ? 'pitch' : 'demo') : 'tutorial'
  const topic = String(msg.topic || 'Full product tour')
  const audience = String(msg.audience || 'Developer')
  const stylePrompt = String(msg.stylePrompt || '').slice(0, 2000)
  const config = loadAiConfig()
  if (!config.baseUrl || !config.apiKey) {
    send(ws, { type: 'artifact:error', error: 'AI not configured — open Settings → AI Provider' })
    return
  }
  const ac = new AbortController()
  sess.abort = ac
  try {
    send(ws, { type: 'artifact:progress', status: 'Collecting PRD, run results and evidence screenshots…' })
    const prdPath = getPrdMeta(folder).prdPath
    const prd = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf-8').slice(0, 12000) : ''
    let runs: any[] = []
    try { runs = JSON.parse(fs.readFileSync(path.join(getProjectDir(folder), 'runs.json'), 'utf-8')) } catch {}
    const passed = runs.filter((r) => r.status === 'passed').length
    const id = `${kind}-${Date.now().toString(36)}`
    const dir = path.join(getProjectDir(folder), 'artifacts', kind, id)
    const assetsDir = path.join(dir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })

    // Extract step screenshots from evidence packs (mapped to runs by execution time)
    const packMap = mapRunPacks(folder, runs)
    const manifest: Array<{ image: string; test: string; verified: string }> = []
    let imgCount = 0
    for (const r of runs) {
      if (imgCount >= 60) break
      const pack = packMap[r.file]
      if (!pack) continue
      const testSlug = (r.file.split('/').pop() || 'test').replace(/_test\.md$/, '').replace(/[^\w-]/g, '_').slice(0, 48)
      // Pack layout: tests/<test-id>/steps/<run>-<step>-<sub>/{annotated.png|screenshot.jpg}
      // One image per step dir — prefer annotated.png (alphabetically first), else screenshot.jpg
      const seenSteps = new Set<string>()
      let idx = 0
      const extracted = zipExtract(fs.readFileSync(pack), (name) => {
        const m = name.match(/^tests\/[^/]+\/steps\/([\d-]+)\/(annotated\.png|screenshot\.jpg)$/)
        if (!m) return null
        if (seenSteps.has(m[1])) return null
        seenSteps.add(m[1])
        idx++
        const ext = m[2].endsWith('.png') ? 'png' : 'jpg'
        return `${testSlug}-${String(idx).padStart(2, '0')}.${ext}`
      }, assetsDir, 6)
      imgCount += extracted.length
      for (const p of extracted) {
        manifest.push({ image: 'assets/' + path.basename(p), test: r.file, verified: r.status })
      }
    }

    send(ws, { type: 'artifact:progress', status: `Extracted ${imgCount} screenshots — drafting outline…` })

    const runsDigest = runs.map((r) => {
      const name = (r.file.split('/').pop() || r.file).replace(/_test\.md$/, '')
      const state = r.finalState && Object.keys(r.finalState).length ? ` observed=${JSON.stringify(r.finalState)}` : ''
      return `- [${r.status}] ${name}: ${r.oneLiner || ''}${state}`
    }).join('\n')
    const manifestList = manifest.map((m) => `- ${m.image} — ${m.test.replace('.testmuai/tests/', '')} (${m.verified})`).join('\n') || '(no screenshots available — use hero/bullets layouts only)'

    // Shot 1 — outline JSON
    const o1 = await callAiStream(
      [
        { role: 'system', content: artifactOutlineSystem(kind, purpose) },
        { role: 'user', content: `PRD:\n${prd || '(no PRD found)'}\n\nRun evidence (verified behaviors):\n${runsDigest || '(none)'}\n\nCoverage: ${passed}/${runs.length} checks passed on the live app.\n\nAvailable screenshots:\n${manifestList}\n\nArtifact: ${kind}${kind === 'deck' ? ` (${purpose})` : ''}\nTopic: ${topic}\nAudience: ${audience}\n\nProduce the outline JSON now.` },
      ],
      undefined,
      () => {},
      () => {},
      ac.signal,
      false
    )
    let outline: any = null
    const om = o1.content.match(/\{[\s\S]*\}/)
    if (om) { try { outline = JSON.parse(om[0]) } catch {} }
    if (!outline || !Array.isArray(outline.sections) || !outline.sections.length) {
      throw new Error('Outline generation failed — try again')
    }
    send(ws, { type: 'artifact:outline', outline })
    send(ws, { type: 'artifact:progress', status: `Outline ready (${outline.sections.length} pages) — rendering HTML…` })

    // Shot 2 — render via save_artifact
    let captured: any = null
    await callAiStream(
      [
        { role: 'system', content: ARTIFACT_RENDER_SYSTEM },
        { role: 'user', content: `Outline JSON:\n${JSON.stringify(outline)}\n\nScreenshot manifest:\n${manifestList}\n\nDesign direction from the user (highest priority for visuals):\n${stylePrompt || '(none — use the clean Unikorn house style)'}\n\nCall save_artifact now with index_html and every page.` },
      ],
      [SAVE_ARTIFACT_TOOL],
      () => {},
      (tcs) => {
        const call = (tcs as any[]).find((t) => t.function?.name === 'save_artifact')
        if (call) {
          try { captured = JSON.parse(call.function.arguments || '{}') } catch {}
        }
      },
      ac.signal,
      true,
      undefined,
      { type: 'function', function: { name: 'save_artifact' } }
    )
    if (!captured || !Array.isArray(captured.pages) || !captured.pages.length) {
      throw new Error('HTML rendering failed — try again')
    }

    const pages: Array<{ file: string; title: string; html: string }> = (captured.pages || [])
      .map((p: any) => ({ file: String(p.file || '').replace(/[^\w.-]/g, ''), title: String(p.title || ''), html: String(p.html || '') }))
      .filter((p: any) => p.file.endsWith('.html') && p.html)
    // Deterministic navigation: strip any AI key-handlers, inject our own Prev/Next + arrows
    const indexHtml = stripKeydownScripts(String(captured.index_html || buildFallbackIndex(outline, pages)))
    fs.writeFileSync(path.join(dir, 'index.html'), injectPageNav(inlineImages(indexHtml, assetsDir), null, pages[0]?.file || null, 0, pages.length))
    let saved = 0
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      const prev = i > 0 ? pages[i - 1].file : null
      const next = i < pages.length - 1 ? pages[i + 1].file : null
      fs.writeFileSync(path.join(dir, p.file), injectPageNav(inlineImages(stripKeydownScripts(p.html), assetsDir), prev, next, i + 1, pages.length))
      saved++
    }
    const meta = { id, kind, purpose, title: String(outline.title || topic), topic, audience, stylePrompt, createdAt: new Date().toISOString(), pageCount: saved, model: config.model }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
    send(ws, { type: 'artifact:done', id, url: `/artifacts/${id}/`, pageCount: saved, title: meta.title })
  } catch (err: any) {
    if (err.name === 'AbortError') send(ws, { type: 'artifact:aborted' })
    else {
      console.error('artifact generation error', err.message)
      send(ws, { type: 'artifact:error', error: err.message || 'Unknown error' })
    }
  } finally {
    sess.abort = undefined
  }
}

// --- WebSocket + AI PRD streaming ---
const wss = new WebSocketServer({ server })

interface WsSession {
  ws: WebSocket
  folder: string
  abort?: AbortController
  pendingQuestions?: any[]
}

const sessions = new Map<WebSocket, WsSession>()

function send(ws: WebSocket, obj: any) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

const TOOL_DEFS: any[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file relative to project folder, truncated to 8000 chars. Path must be inside folder.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'relative path from folder root' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory relative to project folder, up to depth 1, limited to 50 entries.',
      parameters: { type: 'object', properties: { dir: { type: 'string', description: 'relative dir, empty = root' }, limit: { type: 'number' } }, required: [] },
    },
  },
]

const SAVE_PRD_TOOL: any = {
  type: 'function',
  function: {
    name: 'save_prd',
    description: 'Save final PRD markdown. Call once when PRD is ready. Must be Kane-compatible markdown with # header, ## 1. Overview, UC-...[src:].',
    parameters: {
      type: 'object',
      properties: { markdown: { type: 'string', description: 'Full PRD markdown content' } },
      required: ['markdown'],
    },
  },
}

function isInsideFolder(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

function safeReadFile(folder: string, rel: string): string {
  const abs = path.resolve(path.join(folder, rel))
  const root = path.resolve(folder)
  if (!isInsideFolder(root, abs)) throw new Error('Path outside project folder')
  const stat = fs.statSync(abs)
  if (stat.isDirectory()) throw new Error('Path is a directory, not a file')
  if (stat.size > 200_000) {
    // truncate large files
    return fs.readFileSync(abs, 'utf-8').slice(0, 8000) + '\n...[truncated large file]'
  }
  return fs.readFileSync(abs, 'utf-8').slice(0, 8000)
}

function safeListFiles(folder: string, relDir: string, limit = 50): string[] {
  const abs = path.resolve(path.join(folder, relDir || '.'))
  const root = path.resolve(folder)
  if (!isInsideFolder(root, abs)) throw new Error('Dir outside project folder')
  const entries = fs.readdirSync(abs, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    if (out.length >= limit) break
    if (IGNORE_DIRS.has(e.name)) continue
    out.push(e.name + (e.isDirectory() ? '/' : ''))
  }
  return out
}

// --- Generic tool-tag fallback (provider-agnostic) ---
// Handles OpenAI-compatible providers that leak tools as text e.g. <tool_call>, <longcat_tool_call>, <function_call>, <invoke>
function extractGenericToolCalls(text: string): { clean: string; calls: Array<{ tool: string; args: any }> } {
  const calls: Array<{ tool: string; args: any }> = []
  let clean = text
  const tagRe = /<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>([\s\S]*?)<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi
  let m: RegExpExecArray | null
  // Use original text for matching to avoid shifting indices
  const matches: Array<{ raw: string; inner: string }> = []
  while ((m = tagRe.exec(text)) !== null) {
    matches.push({ raw: m[0], inner: m[1] })
  }
  for (const { raw, inner } of matches) {
    const lowerRaw = raw.toLowerCase()
    // only handle file read/list via generic fallback — save_prd must be via tool_calls, not text
    // (remove save_prd extract hack for reliability)
    let rel = ''
    const pathTag = inner.match(/<(?:file_path|path|file)\b[^>]*>([^<]+)<\/(?:file_path|path|file)>/i)
    if (pathTag) rel = pathTag[1].trim()
    else {
      const jsonPath = inner.match(/"path"\s*:\s*"([^"]+)"/i) || inner.match(/"file_path"\s*:\s*"([^"]+)"/i)
      if (jsonPath) rel = jsonPath[1].trim()
      else {
        // fallback: first token that looks like a path
        const stripped = inner.replace(/<[^>]+>/g, ' ').trim()
        const token = stripped.split(/\s+/).find((t) => t.includes('.') || t.includes('/') || t.includes('\\'))
        if (token) rel = token.trim()
      }
    }
    if (rel) {
      const isRead = lowerRaw.includes('read') || /\.[a-z0-9]{1,5}$/i.test(rel)
      const tool = isRead ? 'read_file' : 'list_files'
      if (tool === 'read_file') {
        let normalized = rel.replace(/\\/g, '/')
        if (path.isAbsolute(rel) || /^[a-zA-Z]:\//.test(normalized)) {
          normalized = normalized.replace(/^[a-zA-Z]:\//, '')
          const parts = normalized.split('/')
          rel = parts.slice(-2).join('/')
          if (rel.includes(':')) rel = path.basename(rel)
        }
        calls.push({ tool, args: { path: rel } })
      } else {
        calls.push({ tool, args: { dir: rel, limit: 50 } })
      }
    }
    clean = clean.split(raw).join('')
  }
  // fragmented fallback — only for file read/list, not save_prd (tool-only)
  const hasToolKeyword = /tool_call|longcat|_arg_key|_arg_value|read_file|list_dir|file_path|relative_workspace_path/i.test(clean)
  const hasMarkdown = /^#\s|^##\s/m.test(clean)
  if (hasToolKeyword && !hasMarkdown) {
    const fragJson = clean.match(/"file_path"\s*:\s*"([^"]+)"/i) || clean.match(/"path"\s*:\s*"([^"]+)"/i)
    if (fragJson) {
      if (!calls.some((c) => c.args.path === fragJson[1])) calls.push({ tool: 'read_file', args: { path: fragJson[1] } })
    } else {
      const fragList = clean.match(/"relative_workspace_path"\s*:\s*"([^"]+)"/i)
      if (fragList) calls.push({ tool: 'list_files', args: { dir: fragList[1] } })
    }
    // tool-only fragment → drop entirely (no markdown)
    clean = ''
  }
  // strip any remaining orphan tool tags (incomplete streaming) and arg tags
  clean = clean.replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file|markdown)\b[^>]*\/?>/gi, '')
  clean = clean.replace(/<\/?longcat[^>]*>/gi, '')
  clean = clean.replace(/<\/?longcat_arg[^>]*>/gi, '')
  return { clean: clean.trim(), calls }
}

function stripGenericToolTags(text: string): string {
  return extractGenericToolCalls(text).clean
}

const SYSTEM_CLARIFY = `You are Unikorn — an expert product manager who turns a codebase inventory into a Kane-CLI-compatible PRD.

You have tools: read_file(path), list_files(dir). Use them via function tool_calls, never emit XML tags like <tool_call> or <longcat_tool_call> as text.
Goal: decide if you need clarification before writing the PRD. If the inventory + snippets already make the product's users, value, and non-goals obvious (e.g. clear README, obvious framework), reply with JSON {"ready": true, "reason": "..."}.

Otherwise ask 1-3 multiple-choice questions to clarify. Format your answer as JSON:
{"questions": [{"id":"q1","question":"...","choices":["A","B","C"],"allowFreeText":true}], "ready": false}

Keep questions focused: target user, primary value prop, scope/non-goals, monetization, or deployment context. Do not ask about file details you can read via tools.
If you need to read files first, call tools, then decide. Max 2 tool rounds.
Output ONLY JSON for this phase.`

const SYSTEM_GENERATE = `You are Unikorn — generate a Kane-CLI-compatible PRD in markdown. Use tools via function tool_calls, never emit XML tags like <tool_call> or <longcat_tool_call> as text.

Sections required:
# <Product> PRD
> one-line overview

## 1. Overview
Brief product overview (2-3 sentences), cite sources.

## 2. Users
- **Role** — description [src: path]

## 3. Use Cases & Acceptance Criteria
### UC-1: <title>
- **AC-1.1:** Given ... when ... then ... [src: path or AI-generated, unverified]
### UC-2: ...
(each AC must end with [src: ...])

## 4. Non-goals
- ...

## 5. Tech Constraints
- Express + WebSocket, OpenAI-compatible AI, Kane CLI, etc.

## 6. Environment / How to Run (required for Kane CLI)
- **Start URL:** http://localhost:PORT (from inventory startUrl, e.g. Vite 5173, Next 3000)
- **Command:** npm run dev (or packageManager from inventory)
- **Auth:** None if hasAuth=false, else describe login (e.g. no auth for calculator)
- **Variables:** none or list {{baseUrl}} if needed

Rules:
- Use Given/When/Then for ACs.
- Every claim ends with [src: relative/path or AI-generated, unverified]
- Stable UC-N headings
- No HTML, no placeholders.
- Must include section 6 with Start URL and Auth so Kane can run kane-cli run with startUrl.
`

async function callAiStream(
  messages: any[],
  tools: any[] | undefined,
  onDelta: (delta: string) => void,
  onToolCalls: (toolCalls: any[]) => void,
  signal: AbortSignal,
  includeTools = true,
  onThinking?: (delta: string) => void,
  forcedToolChoice?: any
): Promise<{ content: string; reasoning: string; toolCalls?: any[]; finishReason?: string }> {
  const config = loadAiConfig()
  if (!config.baseUrl || !config.apiKey) throw new Error('AI not configured — set baseUrl and apiKey in Settings')
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl.replace(/\/$/, '') })
  const params: any = {
    model: config.model || 'LongCat-2.0',
    messages,
    stream: true,
    temperature: 0.4,
  }
  if (includeTools && tools && tools.length) {
    params.tools = tools
    params.tool_choice = forcedToolChoice || 'auto'
  }
  // @ts-ignore - openai types
  const stream: any = await client.chat.completions.create(params as any, { signal } as any)
  let content = ''
  let reasoning = ''
  const toolCallsRaw: Record<number, any> = {}
  let finishReason: string | undefined
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    if (!choice) continue
    if (choice.finish_reason) finishReason = choice.finish_reason
    const delta: any = choice.delta
    if (!delta) continue
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content
      if (onThinking) onThinking(delta.reasoning_content)
      else onDelta(delta.reasoning_content) // fallback
    }
    if (delta.content) {
      content += delta.content
      onDelta(delta.content)
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls as any[]) {
        const idx = tc.index ?? 0
        if (!toolCallsRaw[idx]) toolCallsRaw[idx] = { id: tc.id || `call_${idx}`, type: 'function', function: { name: '', arguments: '' } }
        if (tc.id) toolCallsRaw[idx].id = tc.id
        if (tc.function?.name) toolCallsRaw[idx].function.name += tc.function.name
        if (tc.function?.arguments) {
          toolCallsRaw[idx].function.arguments += tc.function.arguments
          // stream save_prd markdown incrementally (tool-only, no extract hack)
          const toolName = toolCallsRaw[idx].function.name || tc.function?.name || ''
          if (toolName === 'save_prd') {
            let chunkArg = tc.function.arguments
            // strip JSON wrapper: remove leading {"markdown": " and trailing "} etc., unescape
            // chunk is part of JSON string value, e.g. "# PRD\\n" or "## Overview"
            // Heuristic: remove up to first " and after last "
            let cleaned = chunkArg
              .replace(/^.*?\"markdown\"\s*:\s*\"/, '')
              .replace(/\"\s*\}?\s*$/, '')
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
            cleaned = stripGenericToolTags(cleaned)
            if (cleaned) onDelta(cleaned)
          }
        }
      }
    }
  }
  const toolCalls = Object.values(toolCallsRaw)
  if (toolCalls.length) onToolCalls(toolCalls)
  return { content, reasoning, toolCalls: toolCalls.length ? toolCalls : undefined, finishReason }
}

async function handlePrdGeneration(ws: WebSocket, folder: string, session: WsSession, userAnswers?: Record<string, string>) {
  const absFolder = path.resolve(folder)
  if (!fs.existsSync(absFolder) || !fs.statSync(absFolder).isDirectory()) {
    send(ws, { type: 'prd:error', error: `Folder not found: ${folder}` })
    return
  }
  const config = loadAiConfig()
  if (!config.baseUrl || !config.apiKey) {
    send(ws, { type: 'prd:error', error: 'AI not configured. Open Settings → AI Provider and set baseUrl/apiKey/model.' })
    return
  }

  const inventory = scanInventory(absFolder)
  send(ws, { type: 'prd:inventory', inventory })
  send(ws, { type: 'prd:thinking', delta: `Scanning ${inventory.fileCount} files (${inventory.framework || 'unknown'} framework)…\n` })

  const ac = new AbortController()
  session.abort = ac

  // Build inventory summary for prompt (include startUrl/auth for Kane)
  const invSummary = `Folder: ${absFolder}\nFiles: ${inventory.fileCount} (truncated=${inventory.truncated})\nFramework: ${inventory.framework}\nTopLevel: ${inventory.topLevelFiles.join(', ')}\nRoutes: ${inventory.routes.slice(0, 10).join(', ')}\nReadme: ${inventory.readmeSnippet ? inventory.readmeSnippet.slice(0, 600) : 'none'}\nExts: ${JSON.stringify(inventory.extCount)}\nStartUrl: ${inventory.startUrl || 'unknown (ask user)'}\nDevPort: ${inventory.devPort || 'unknown'}\nPackageManager: ${inventory.packageManager || 'npm'}\nHasAuth: ${inventory.hasAuth}`
  const messages: any[] = [
    { role: 'system', content: SYSTEM_CLARIFY },
    { role: 'user', content: `Inventory:\n${invSummary}\n\nDecide if you need to read files or ask questions. Use tools if needed, otherwise output JSON.` },
  ]
  // If userAnswers provided (second round after questions), append them
  if (userAnswers && Object.keys(userAnswers).length) {
    messages.push({ role: 'user', content: `User answers to clarification:\n${Object.entries(userAnswers).map(([k, v]) => `${k}: ${v}`).join('\n')}\nNow either output {"ready":true} or remaining questions as JSON.` })
  }

  let clarifyContent = ''
  let toolLoops = 0
  let needQuestions: any[] | null = null

  try {
    while (toolLoops < 3) {
      let collectedToolCalls: any[] | undefined
      const { content, toolCalls } = await callAiStream(
        messages,
        TOOL_DEFS,
        (delta) => {
          // clarify phase streams thinking — strip generic leaked tags
          const clean = stripGenericToolTags(delta)
          if (clean) send(ws, { type: 'prd:thinking', delta: clean })
          // if delta was pure tool tag, it will be handled via generic fallback below
        },
        (tcs) => { collectedToolCalls = tcs },
        ac.signal,
        true
      )
      // generic fallback: provider leaked tools as text instead of tool_calls
      const genericInClarify = extractGenericToolCalls(content)
      if (genericInClarify.calls.length) {
        const cleanForMsg = stripGenericToolTags(content) || '(tool call)'
        for (const g of genericInClarify.calls) {
          const name = g.tool
          const args = g.args
          send(ws, { type: 'prd:tool_call', tool: name, args, status: 'running' })
          let result = ''
          try {
            if (name === 'read_file') result = safeReadFile(absFolder, args.path)
            else if (name === 'list_files') result = safeListFiles(absFolder, args.dir || '', args.limit || 50).join('\n')
            else result = `Unknown tool ${name}`
          } catch (e: any) {
            result = `Error: ${e.message}`
          }
          send(ws, { type: 'prd:tool_call', tool: name, args, status: 'result', result: result.slice(0, 3000) })
          messages.push({ role: 'assistant', content: cleanForMsg })
          messages.push({ role: 'tool', tool_call_id: `generic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, content: result.slice(0, 6000) })
        }
        toolLoops++
        continue
      }
      if (collectedToolCalls && collectedToolCalls.length) {
        // execute tools (OpenAI standard)
        for (const tc of collectedToolCalls) {
          const name = tc.function?.name
          let args: any = {}
          try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
          send(ws, { type: 'prd:tool_call', tool: name, args, status: 'running' })
          let result = ''
          try {
            if (name === 'read_file') result = safeReadFile(absFolder, args.path)
            else if (name === 'list_files') result = safeListFiles(absFolder, args.dir || '', args.limit || 50).join('\n')
            else result = `Unknown tool ${name}`
          } catch (e: any) {
            result = `Error: ${e.message}`
          }
          send(ws, { type: 'prd:tool_call', tool: name, args, status: 'result', result: result.slice(0, 3000) })
          messages.push({ role: 'assistant', content: null, tool_calls: collectedToolCalls })
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0, 6000) })
        }
        toolLoops++
        clarifyContent = ''
        continue
      }
      clarifyContent += stripGenericToolTags(content)
      // No tools, try parse JSON
      const jsonMatch = clarifyContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.ready === true) {
            needQuestions = null
            break
          }
          if (Array.isArray(parsed.questions) && parsed.questions.length) {
            needQuestions = parsed.questions
            break
          }
        } catch {}
      }
      // If not JSON, assume ready
      if (clarifyContent.trim().length > 20 && !clarifyContent.includes('"questions"') && !clarifyContent.includes('"ready"')) {
        // model didn't emit JSON, treat as ready
        needQuestions = null
        break
      }
      break
    }

    if (needQuestions && needQuestions.length && !userAnswers) {
      // emit questions and wait for user
      for (const q of needQuestions) {
        send(ws, { type: 'prd:question', id: q.id, question: q.question, choices: q.choices || [], allowFreeText: q.allowFreeText !== false })
      }
      session.pendingQuestions = needQuestions
      // pause — client must send prd:answer(s) then prd:continue
      send(ws, { type: 'prd:awaiting_answers', count: needQuestions.length })
      return
    }

    // Generate PRD — use save_prd tool to capture final markdown (provider-agnostic) with robust loop
    send(ws, { type: 'prd:thinking', delta: '\n\nGenerating PRD…\n' })
    const genMessages: any[] = [
      { role: 'system', content: SYSTEM_GENERATE },
      { role: 'user', content: `Inventory:\n${invSummary}\nStartUrl: ${inventory.startUrl || 'http://localhost:5173'} (run ${inventory.packageManager || 'npm'} run dev)\nHasAuth: ${inventory.hasAuth ? 'yes - describe auth' : 'no'}\n${userAnswers ? `Answers: ${JSON.stringify(userAnswers)}\n` : ''}Generate the PRD now. Use read_file/list_files if you need to cite, then call save_prd(markdown) with the final markdown. Must include section 6 Environment with Start URL and Auth.` },
    ]
    let fullMarkdown = ''
    let capturedViaTool: string | null = null
    const GEN_TOOLS = [...TOOL_DEFS, SAVE_PRD_TOOL]
    let genLoops = 0
    while (genLoops < 3 && !capturedViaTool) {
      let genToolCalls: any[] | undefined
      let genContent = ''
      let genReasoning = ''
      const pendingGenericThisRound: Array<{ tool: string; args: any }> = []
      await callAiStream(
        genMessages,
        GEN_TOOLS,
        (delta) => {
          const extracted = extractGenericToolCalls(delta)
          if (extracted.calls.length) pendingGenericThisRound.push(...extracted.calls)
          const cleanDelta = stripGenericToolTags(delta)
          if (!cleanDelta) return
          genContent += cleanDelta
          fullMarkdown += cleanDelta
          send(ws, { type: 'prd:content', delta: cleanDelta })
        },
        (tcs) => { genToolCalls = tcs },
        ac.signal,
        true,
        (tdelta) => {
          const cleanThink = stripGenericToolTags(tdelta)
          if (!cleanThink) return
          genReasoning += cleanThink
          send(ws, { type: 'prd:thinking', delta: cleanThink })
        }
      )
      // handle generic leaked save_prd first (indicator only, no markdown preview)
      // generic read/list only — save_prd must be via tool_calls
      if (pendingGenericThisRound.length) {
        for (const g of pendingGenericThisRound) {
          if (g.tool === 'save_prd') continue
          send(ws, { type: 'prd:tool_call', tool: g.tool, args: g.args, status: 'running' })
          let result = ''
          try {
            if (g.tool === 'read_file') result = safeReadFile(absFolder, g.args.path)
            else if (g.tool === 'list_files') result = safeListFiles(absFolder, g.args.dir || '', 50).join('\n')
          } catch (e: any) { result = `Error: ${e.message}` }
          send(ws, { type: 'prd:tool_call', tool: g.tool, args: g.args, status: 'result', result: result.slice(0, 3000) })
          genMessages.push({ role: 'assistant', content: genContent || fullMarkdown })
          genMessages.push({ role: 'tool', tool_call_id: `generic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, content: result.slice(0, 6000) })
        }
        genLoops++
        continue
      }
      // handle OpenAI tool_calls
      if (genToolCalls && genToolCalls.length) {
        const saveCall = genToolCalls.find((tc: any) => tc.function?.name === 'save_prd')
        if (saveCall) {
          let args: any = {}
          try { args = JSON.parse(saveCall.function?.arguments || '{}') } catch { 
            const m = saveCall.function?.arguments?.match(/"markdown"\s*:\s*"([\s\S]*?)"/)
            if (m) args.markdown = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
          }
          const md = stripGenericToolTags(args.markdown || '')
          if (md && md.length > 30) {
            capturedViaTool = md
            send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'running' })
            send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'result', result: 'PRD saved' })
            genMessages.push({ role: 'assistant', content: genContent || fullMarkdown, tool_calls: genToolCalls })
            genMessages.push({ role: 'tool', tool_call_id: saveCall.id, content: 'PRD saved via tool' })
            break
          } else {
            console.log('save_prd empty or short', JSON.stringify(args).slice(0,200))
          }
        }
        // handle read/list (push once, not per tc)
        const hasReadList = genToolCalls.some((tc: any) => ['read_file','list_files'].includes(tc.function?.name))
        if (hasReadList) {
          // send tool_call events first
          for (const tc of genToolCalls) {
            if (tc.function?.name === 'save_prd') continue
            let a: any = {}
            try { a = JSON.parse(tc.function?.arguments || '{}') } catch {}
            send(ws, { type: 'prd:tool_call', tool: tc.function?.name, args: a, status: 'running' })
          }
          // push single assistant message with all tool_calls
          genMessages.push({ role: 'assistant', content: genContent || null, tool_calls: genToolCalls })
          for (const tc of genToolCalls) {
            if (tc.function?.name === 'save_prd') continue
            let a: any = {}
            try { a = JSON.parse(tc.function?.arguments || '{}') } catch {}
            let result = ''
            try {
              if (tc.function?.name === 'read_file') result = safeReadFile(absFolder, a.path)
              else if (tc.function?.name === 'list_files') result = safeListFiles(absFolder, a.dir || '', 50).join('\n')
            } catch (e: any) { result = `Error: ${e.message}` }
            send(ws, { type: 'prd:tool_call', tool: tc.function?.name, args: a, status: 'result', result: result.slice(0, 3000) })
            genMessages.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0, 6000) })
          }
          genLoops++
          // if we got tool calls but no content, loop will fetch next content
          if (genContent.trim().length === 0) continue
        }
      }
      // if we got content without tool, we're done
      if (genContent.trim().length > 0 && !capturedViaTool) {
        // content streamed, treat as final if no save_prd call and loop will exit
        // but keep looping in case model will call save_prd next round with same content
        // break if we have substantial markdown and no pending tools
        if (genContent.length > 200 && /^#\s/m.test(genContent)) break
      }
      genLoops++
      if (genLoops >= 3) break
    }

    // Final forced save_prd if still no markdown after loops (like test script)
    if (!capturedViaTool && (!fullMarkdown || !/^#\s/m.test(fullMarkdown))) {
      console.log('Forcing save_prd, fullMarkdown len', fullMarkdown.length, 'captured', !!capturedViaTool)
      genMessages.push({ role: 'user', content: 'You have read enough files. Now call save_prd with the complete PRD markdown. Do not call read_file again. Markdown must start with # and include ## 1. Overview, ## 3. Use Cases with UC- and [src:].' })
      try {
        await callAiStream(
          genMessages,
          [SAVE_PRD_TOOL],
          (delta) => {
            const clean = stripGenericToolTags(delta)
            if (!clean) return
            fullMarkdown += clean
            send(ws, { type: 'prd:content', delta: clean })
          },
          (tcs) => {
            const save = (tcs as any[]).find((tc: any) => tc.function?.name === 'save_prd')
            if (save) {
              try {
                const a = JSON.parse(save.function.arguments || '{}')
                if (a.markdown) {
                  capturedViaTool = stripGenericToolTags(a.markdown)
                  if (capturedViaTool) {
                    send(ws, { type: 'prd:content', delta: capturedViaTool.slice(0, 4000) })
                    send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'running' })
                    send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'result', result: 'PRD saved' })
                  }
                }
              } catch {
                const m = (save.function.arguments || '').match(/"markdown"\s*:\s*"([\s\S]*?)"/)
                if (m) {
                  capturedViaTool = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
                  if (capturedViaTool) {
                    send(ws, { type: 'prd:content', delta: stripGenericToolTags(capturedViaTool).slice(0, 4000) })
                    send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'running' })
                    send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: {}, status: 'result', result: 'PRD saved' })
                  }
                }
              }
            }
          },
          ac.signal,
          true,
          (tdelta) => {
            const cleanThink = stripGenericToolTags(tdelta)
            if (cleanThink) send(ws, { type: 'prd:thinking', delta: cleanThink })
          },
          { type: 'function', function: { name: 'save_prd' } }
        )
      } catch (e) { console.log('forced save_prd failed', (e as any).message) }
    }

    // Prefer save_prd capture; fall back to streamed content (providers that never emit tool calls)
    let finalMarkdown = stripGenericToolTags(capturedViaTool || '')
    if (!finalMarkdown.trim() && fullMarkdown.trim().length > 100) {
      finalMarkdown = stripGenericToolTags(fullMarkdown)
    }
    if (!finalMarkdown.trim()) throw new Error('AI did not return a PRD — retry generation')
    const hasMarkdownHeader = /^#\s/m.test(finalMarkdown) || /##\s*1\.\s*Overview/i.test(finalMarkdown)
    if (!hasMarkdownHeader && finalMarkdown.length < 300) {
      throw new Error('AI did not return a valid PRD markdown — retry generation')
    }

    // Save
    const dir = getProjectDir(absFolder)
    const prdPath = path.join(dir, 'PRD.md')
    fs.writeFileSync(prdPath, finalMarkdown, 'utf-8')
    const meta = { folder: absFolder, createdAt: new Date().toISOString(), model: config.model, fileCount: inventory.fileCount, framework: inventory.framework }
    fs.writeFileSync(path.join(dir, 'prd.meta.json'), JSON.stringify(meta, null, 2))
    send(ws, { type: 'prd:done', markdown: finalMarkdown, savedTo: prdPath, meta })
    console.log(`PRD saved to ${prdPath} (${finalMarkdown.length} chars) via tool`)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      send(ws, { type: 'prd:aborted' })
    } else {
      console.error('prd generation error', err.message, err.stack?.slice(0, 500))
      send(ws, { type: 'prd:error', error: err.message || String(err) || 'Unknown error' })
    }
  } finally {
    session.abort = undefined
  }
}

wss.on('connection', (ws) => {
  console.log('WS client connected')
  sessions.set(ws, { ws, folder: process.cwd() })
  ws.on('message', async (raw) => {
    let msg: any
    try { msg = JSON.parse(raw.toString()) } catch { return }
    const sess = sessions.get(ws)
    if (!sess) return
    if (msg.type === 'prd:start') {
      const folder = msg.folder || process.cwd()
      sess.folder = path.resolve(folder)
      sess.pendingQuestions = undefined
      if (sess.abort) sess.abort.abort()
      await handlePrdGeneration(ws, folder, sess)
    } else if (msg.type === 'prd:answer') {
      // collect answers, client may send multiple then prd:continue
      if (!sess.pendingQuestions) return
      // store answers in ws session temp
      ;(sess as any)._answers = (sess as any)._answers || {}
      ;(sess as any)._answers[msg.id] = msg.answer || msg.choice || ''
      // auto-continue if all answered
      const pendingIds = sess.pendingQuestions.map((q: any) => q.id)
      const answeredIds = Object.keys((sess as any)._answers)
      if (pendingIds.every((id: string) => answeredIds.includes(id))) {
        const answers = (sess as any)._answers
        ;(sess as any)._answers = {}
        sess.pendingQuestions = undefined
        await handlePrdGeneration(ws, sess.folder, sess, answers)
      }
    } else if (msg.type === 'prd:continue') {
      const answers = (sess as any)._answers || msg.answers || {}
      ;(sess as any)._answers = {}
      sess.pendingQuestions = undefined
      await handlePrdGeneration(ws, sess.folder, sess, answers)
    } else if (msg.type === 'prd:cancel') {
      if (sess.abort) sess.abort.abort()
      sess.pendingQuestions = undefined
      send(ws, { type: 'prd:aborted' })
    } else if (msg.type === 'artifact:start') {
      const folder = msg.folder || sess.folder || process.cwd()
      sess.folder = path.resolve(folder)
      if (sess.abort) sess.abort.abort()
      await handleArtifactGeneration(ws, sess, msg)
    }
  })
  ws.on('close', () => {
    const s = sessions.get(ws)
    if (s?.abort) s.abort.abort()
    sessions.delete(ws)
  })
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
