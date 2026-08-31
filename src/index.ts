#!/usr/bin/env node
import express from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { execSync } from 'child_process'
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
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', '.testmuai', '.unikorn', '__pycache__', '.venv', 'vendor', '.cache', 'out', '.parcel-cache'])
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
  try {
    const pkgPath = path.join(abs, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      framework = detectFramework(pkg, topLevelFiles, abs)
      if (fs.existsSync(path.join(abs, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
      else if (fs.existsSync(path.join(abs, 'yarn.lock'))) packageManager = 'yarn'
      else if (fs.existsSync(path.join(abs, 'package-lock.json'))) packageManager = 'npm'
      else packageManager = 'npm'
    } else {
      framework = detectFramework(null, topLevelFiles, abs)
    }
  } catch {}

  const inv: Inventory = { folder: abs, fileCount, topLevelFiles, framework, hasReadme, readmeSnippet, routes, extCount, packageManager, truncated }
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'unikorn', port: PORT }))

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

function safeReadFile(folder: string, rel: string): string {
  const abs = path.resolve(path.join(folder, rel))
  const root = path.resolve(folder)
  if (!abs.startsWith(root)) throw new Error('Path outside project folder')
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
  if (!abs.startsWith(root)) throw new Error('Dir outside project folder')
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
    const lowerInner = inner.toLowerCase()
    // detect save_prd first
    if (lowerRaw.includes('save_prd') || lowerInner.includes('save_prd') || inner.includes('markdown')) {
      // try to extract markdown payload
      let md = ''
      const mdTag = inner.match(/<(?:markdown)\b[^>]*>([\s\S]*?)<\/(?:markdown)>/i)
      if (mdTag) md = mdTag[1].trim()
      else {
        // try JSON {"markdown": "..."}
        const jsonMd = inner.match(/"markdown"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/)
        if (jsonMd) {
          try { md = JSON.parse(`"${jsonMd[1].replace(/"/g, '\\"')}"`) } catch { md = jsonMd[1] }
          // attempt full JSON parse of args
          try {
            const obj = JSON.parse(inner.match(/\{[\s\S]*\}/)?.[0] || '{}')
            if (obj.markdown) md = obj.markdown
          } catch {}
        } else {
          // fallback: content after stripping tags
          const stripped = inner.replace(/<[^>]+>/g, ' ').trim()
          // if stripped looks like markdown header, use it
          if (/^#\s/m.test(stripped)) md = stripped
        }
      }
      if (md && md.length > 20) {
        calls.push({ tool: 'save_prd', args: { markdown: md } })
      } else {
        // if inner itself is markdown-ish, capture
        const maybeMd = inner.replace(/<[^>]+>/g, '').trim()
        if (/^#\s/m.test(maybeMd) && maybeMd.length > 100) {
          calls.push({ tool: 'save_prd', args: { markdown: maybeMd } })
        }
      }
      clean = clean.split(raw).join('')
      continue
    }
    // otherwise treat as file read/list
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
  // fragmented fallback — e.g. "tool_call</longcat_arg_key>..." without opening <
  const hasToolKeyword = /tool_call|longcat|_arg_key|_arg_value|read_file|list_dir|file_path|relative_workspace_path/i.test(clean)
  const hasMarkdown = /^#\s|^##\s/m.test(clean)
  if (hasToolKeyword && !hasMarkdown) {
    const fragJson = clean.match(/"file_path"\s*:\s*"([^"]+)"/i) || clean.match(/"path"\s*:\s*"([^"]+)"/i)
    if (fragJson) {
      if (!calls.some((c) => c.args.path === fragJson[1])) calls.push({ tool: 'read_file', args: { path: fragJson[1] } })
    } else {
      const fragList = clean.match(/"relative_workspace_path"\s*:\s*"([^"]+)"/i)
      if (fragList) calls.push({ tool: 'list_files', args: { dir: fragList[1] } })
      else {
        const saveFrag = clean.match(/"markdown"\s*:\s*"([\s\S]*?)"/i)
        if (saveFrag) {
          let md = saveFrag[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
          if (md.length > 20) calls.push({ tool: 'save_prd', args: { markdown: md } })
        }
      }
    }
    // tool-only fragment → drop entirely
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

Rules:
- Use Given/When/Then for ACs.
- Every claim ends with [src: relative/path or AI-generated, unverified]
- Stable UC-N headings
- No HTML, no placeholders.
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
        if (tc.function?.arguments) toolCallsRaw[idx].function.arguments += tc.function.arguments
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

  // Build inventory summary for prompt
  const invSummary = `Folder: ${absFolder}\nFiles: ${inventory.fileCount} (truncated=${inventory.truncated})\nFramework: ${inventory.framework}\nTopLevel: ${inventory.topLevelFiles.join(', ')}\nRoutes: ${inventory.routes.slice(0, 10).join(', ')}\nReadme: ${inventory.readmeSnippet ? inventory.readmeSnippet.slice(0, 600) : 'none'}\nExts: ${JSON.stringify(inventory.extCount)}`
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
      { role: 'user', content: `Inventory:\n${invSummary}\n${userAnswers ? `Answers: ${JSON.stringify(userAnswers)}\n` : ''}Generate the PRD now. Use read_file/list_files if you need to cite, then call save_prd(markdown) with the final markdown.` },
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
      // handle generic leaked save_prd first
      const genericSave = pendingGenericThisRound.find((g) => g.tool === 'save_prd')
      if (genericSave) {
        const md = stripGenericToolTags(genericSave.args.markdown || '')
        if (md.length > 50) {
          capturedViaTool = md
          send(ws, { type: 'prd:content', delta: md.slice(0, 4000) })
          send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: { markdown: `${md.slice(0, 80)}… (${md.length} chars)` }, status: 'result', result: 'PRD captured via generic' })
          break
        }
      }
      // handle generic read/list leaked
      if (pendingGenericThisRound.length && !genericSave) {
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
            // also stream as content for preview (user sees drafting)
            send(ws, { type: 'prd:content', delta: md.slice(0, 4000) })
            send(ws, { type: 'prd:tool_call', tool: 'save_prd', args: { markdown: `${md.slice(0, 80)}… (${md.length} chars)` }, status: 'result', result: 'PRD captured via tool' })
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
                  if (capturedViaTool) send(ws, { type: 'prd:content', delta: capturedViaTool.slice(0, 4000) })
                }
              } catch {
                const m = (save.function.arguments || '').match(/"markdown"\s*:\s*"([\s\S]*?)"/)
                if (m) {
                  capturedViaTool = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
                  if (capturedViaTool) send(ws, { type: 'prd:content', delta: stripGenericToolTags(capturedViaTool).slice(0, 4000) })
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

    // Prefer tool-captured markdown, fallback to streamed content
    const finalMarkdown = stripGenericToolTags(capturedViaTool || fullMarkdown)
    if (!finalMarkdown.trim()) throw new Error('AI returned empty PRD')
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
    console.log(`PRD saved to ${prdPath} (${finalMarkdown.length} chars) via ${capturedViaTool ? 'tool' : 'stream'}`)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      send(ws, { type: 'prd:aborted' })
    } else {
      console.error('prd generation error', err)
      send(ws, { type: 'prd:error', error: err.message || String(err) })
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
