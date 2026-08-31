import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { fetchKaneStatus, fetchAiStatus, type KaneStatus, type AiStatus } from '../api'

interface StatusContextValue {
  kane: KaneStatus | null
  ai: AiStatus | null
  loading: boolean
  isRefreshing: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => Promise<void>
}

const StatusContext = createContext<StatusContextValue | null>(null)

const POLL_INTERVAL = 30_000
const STORAGE_KEY = 'unikorn-status-cache'

interface CachedStatus {
  kane: KaneStatus | null
  ai: AiStatus | null
  ts: number
}

function loadCache(): CachedStatus | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedStatus
    // expire after 2 * poll interval to avoid stale forever
    if (Date.now() - parsed.ts > POLL_INTERVAL * 2) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(kane: KaneStatus | null, ai: AiStatus | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ kane, ai, ts: Date.now() } satisfies CachedStatus))
  } catch {}
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [cached] = useState<CachedStatus | null>(() => loadCache())
  const [kane, setKane] = useState<KaneStatus | null>(cached?.kane ?? null)
  const [ai, setAi] = useState<AiStatus | null>(cached?.ai ?? null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(cached?.ts ?? null)
  const [loading, setLoading] = useState(cached ? false : true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const lastUpdatedRef = useRef<number | null>(cached?.ts ?? null)
  useEffect(() => { lastUpdatedRef.current = lastUpdated }, [lastUpdated])

  // Use refs to avoid stale closure in refresh
  const kaneRef = useRef(kane)
  const aiRef = useRef(ai)
  const loadingRef = useRef(loading)
  useEffect(() => { kaneRef.current = kane }, [kane])
  useEffect(() => { aiRef.current = ai }, [ai])
  useEffect(() => { loadingRef.current = loading }, [loading])

  const refresh = useCallback(async () => {
    const isInitial = kaneRef.current === null && aiRef.current === null && loadingRef.current
    if (isInitial) setLoading(true)
    else setIsRefreshing(true)

    const results = await Promise.allSettled([fetchKaneStatus(), fetchAiStatus()])

    if (!mountedRef.current) return

    let nextKane: KaneStatus | null = kaneRef.current
    let nextAi: AiStatus | null = aiRef.current
    let hasError = false
    let errMsg: string | null = null

    if (results[0].status === 'fulfilled') {
      nextKane = results[0].value
    } else {
      hasError = true
      errMsg = (results[0].reason as Error)?.message || 'Kane fetch failed'
    }

    if (results[1].status === 'fulfilled') {
      nextAi = results[1].value
    } else {
      hasError = true
      const m = (results[1].reason as Error)?.message || 'AI fetch failed'
      errMsg = errMsg ? `${errMsg}; ${m}` : m
    }

    // stale-while-revalidate: keep previous on error, update on success or change
    if (!hasError || nextKane !== kaneRef.current || nextAi !== aiRef.current) {
      setKane(nextKane)
      setAi(nextAi)
      if (!hasError) {
        const now = Date.now()
        setLastUpdated(now)
        saveCache(nextKane, nextAi)
      }
    }

    setError(hasError ? errMsg : null)
    setLoading(false)
    setIsRefreshing(false)
  }, [])

  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  useEffect(() => {
    mountedRef.current = true
    refreshRef.current()

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshRef.current()
      }
    }, POLL_INTERVAL)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const age = lastUpdatedRef.current ? Date.now() - lastUpdatedRef.current : Infinity
        if (age > POLL_INTERVAL) refreshRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mountedRef.current = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <StatusContext.Provider value={{ kane, ai, loading, isRefreshing, error, lastUpdated, refresh }}>
      {children}
    </StatusContext.Provider>
  )
}

export function useStatus(): StatusContextValue {
  const ctx = useContext(StatusContext)
  if (!ctx) throw new Error('useStatus must be used within StatusProvider')
  return ctx
}
