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
