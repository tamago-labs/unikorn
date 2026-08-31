const API_BASE = '/api'

async function fetchWithRetry(input: string, init?: RequestInit, retries = 3): Promise<Response> {
  let lastErr: any
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(input, init)
    } catch (e: any) {
      lastErr = e
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * Math.pow(1.5, i)))
    }
  }
  throw lastErr
}

export interface AiStatus {
  configured: boolean
  baseUrl: string
  apiKey: string
  model: string
  hasKey: boolean
}

export interface KaneStatus {
  available: boolean
  version: string | null
  authenticated: boolean
  balance: { available: number; total: number } | null
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const res = await fetchWithRetry(`${API_BASE}/ai/status`)
  if (!res.ok) throw new Error(`AI status ${res.status}`)
  return res.json()
}

export async function saveAiConfig(baseUrl: string, apiKey: string, model: string): Promise<{ ok: boolean; configured: boolean }> {
  const res = await fetch(`${API_BASE}/ai/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey, model }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to save config')
  }
  return res.json()
}

export async function testAiConnection(): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/ai/test`, { method: 'POST' })
  return res.json()
}

export async function fetchKaneStatus(): Promise<KaneStatus> {
  const res = await fetch(`${API_BASE}/kane/status`)
  if (!res.ok) throw new Error(`Kane status ${res.status}`)
  return res.json()
}

export async function fetchWorkingFolder(): Promise<{ folder: string }> {
  const res = await fetchWithRetry(`${API_BASE}/working-folder`)
  if (!res.ok) throw new Error(`Working folder ${res.status}`)
  return res.json()
}

export interface Inventory {
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

export async function scanFolder(folder: string): Promise<{ ok: boolean; inventory: Inventory }> {
  const res = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Scan failed')
  }
  return res.json()
}

export async function fetchPrd(folder: string): Promise<{ exists: boolean; size: number | null; updatedAt: string | null; preview: string | null; meta: any; folder: string }> {
  const res = await fetch(`${API_BASE}/prd?folder=${encodeURIComponent(folder)}`)
  if (!res.ok) throw new Error(`PRD meta ${res.status}`)
  return res.json()
}

export async function fetchPrdContent(folder: string): Promise<{ content: string }> {
  const res = await fetch(`${API_BASE}/prd/content?folder=${encodeURIComponent(folder)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'PRD not found')
  }
  return res.json()
}

export function getWsUrl(): string {
  const stored = localStorage.getItem('unikorn-cli-host')
  if (stored) {
    try {
      const u = new URL(stored)
      return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`
    } catch {}
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.hostname}:3001`
}

export async function fetchLogs(): Promise<{ logs: string[] }> {
  const res = await fetch(`${API_BASE}/logs`)
  return res.json()
}

export async function clearLogs(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/logs/clear`, { method: 'POST' })
  return res.json()
}

// --- Kane job runner (async, streamed, pausable) ---

export interface KaneJobState {
  id: string
  type: 'ingest' | 'design' | 'testmd'
  folder: string
  status: 'running' | 'paused' | 'done' | 'error'
  code: number | null
  events: any[]
  rawTail: string[]
  sid: string | null
  questions: any[]
  error: string | null
  runEnd: any | null
  updatedAt: string
}

export interface KaneRunRecord {
  file: string
  finishedAt: string
  status: string
  oneLiner: string | null
  summary: string | null
  duration: number | string | null
  testUrl: string | null
  finalState: Record<string, any> | null
  evidencePack: string | null
  error: string | null
}

async function postJson(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j as any).error || `${res.status}`)
  return j
}

export const startKaneIngest = (folder: string) =>
  postJson(`${API_BASE}/kane/ingest`, { folder }) as Promise<{ jobId: string }>

export const startKaneDesign = (folder: string, uc: string, max = 8) =>
  postJson(`${API_BASE}/kane/design`, { folder, uc, max }) as Promise<{ jobId: string }>

export const startKaneResume = (folder: string, sid: string, verb = 'design') =>
  postJson(`${API_BASE}/kane/resume`, { folder, sid, verb }) as Promise<{ jobId: string }>

export const startTestmdRun = (folder: string, file: string, headless = true) =>
  postJson(`${API_BASE}/kane/testmd/run`, { folder, file, headless }) as Promise<{ jobId: string; startUrl?: string }>

export const kaneReview = (folder: string, payload: { approveAll?: boolean; verdicts?: Array<{ ref: string; resolution: string }> } = {}) =>
  postJson(`${API_BASE}/kane/review`, { folder, ...payload }) as Promise<{ ok: boolean; message?: string; stdout?: string; code?: number }>

export const answerKaneJob = (id: string, message: string) =>
  postJson(`${API_BASE}/kane/job/${id}/answer`, { message }) as Promise<KaneJobState>

export const cancelKaneJob = (id: string) =>
  postJson(`${API_BASE}/kane/job/${id}/cancel`, {}) as Promise<{ ok: boolean }>

export const serveEvidence = (pack: string) =>
  postJson(`${API_BASE}/kane/evidence/serve`, { pack }) as Promise<{ ok: boolean; viewer: string }>

export async function fetchKaneJob(id: string): Promise<KaneJobState> {
  return jsonFetch(`${API_BASE}/kane/job/${id}`)
}

export async function fetchRuns(folder: string): Promise<{ runs: KaneRunRecord[] }> {
  return jsonFetch(`${API_BASE}/kane/runs?folder=${encodeURIComponent(folder)}`)
}

// --- Artifacts (tutorial / slide deck) ---

export interface ArtifactMeta {
  id: string
  kind: 'tutorial' | 'deck'
  purpose?: string
  title: string
  topic: string
  audience: string
  stylePrompt: string
  createdAt: string
  pageCount: number
  model?: string
}

export async function fetchArtifacts(folder: string): Promise<{ artifacts: ArtifactMeta[] }> {
  return jsonFetch(`${API_BASE}/artifacts?folder=${encodeURIComponent(folder)}`)
}

export const deleteArtifact = (id: string) =>
  postJson(`${API_BASE}/artifacts/delete`, { id }) as Promise<{ ok: boolean }>

export async function fetchHealth(): Promise<{ status: string; kaneJobs?: boolean }> {
  const res = await fetch(`${API_BASE}/health`)
  return res.json()
}

// Fetch that fails loudly when the backend answers HTML (stale CLI server / missing route)
export async function jsonFetch(input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init)
  const text = await res.text()
  let data: any = null
  try { data = JSON.parse(text) } catch {}
  if (data === null) {
    if (text.trimStart().startsWith('<')) {
      throw new Error('CLI server is outdated — restart it (npm run dev) and refresh this page')
    }
    throw new Error(`Unexpected response from ${input}: ${text.slice(0, 120)}`)
  }
  if (!res.ok) throw new Error(data?.error || `${res.status}`)
  return data
}
