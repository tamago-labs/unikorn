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

export async function fetchLogs(): Promise<{ logs: string[] }> {
  const res = await fetch(`${API_BASE}/logs`)
  return res.json()
}

export async function clearLogs(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/logs/clear`, { method: 'POST' })
  return res.json()
}
