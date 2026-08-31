import { useEffect, useRef, useState } from 'react'
import {
  answerKaneJob,
  cancelKaneJob,
  fetchHealth,
  fetchKaneJob,
  fetchRuns,
  jsonFetch,
  kaneReview,
  serveEvidence,
  startKaneDesign,
  startKaneIngest,
  startKaneResume,
  startTestmdRun,
  type KaneJobState,
  type KaneRunRecord,
} from '../api'

interface Props {
  folder: string
}

interface Uc {
  _id: string
  _title: string
  _trusted: boolean
  trust?: string
  [k: string]: any
}

interface Assurance {
  ucs: Uc[]
  cover: any
  sessions: any
  tests: string[]
}

function qText(q: any): string {
  return q?.text || q?.question || q?.prompt || 'Kane needs your input'
}

function qRationale(q: any): string | null {
  return q?.rationale || null
}

function qOptions(q: any): string[] {
  const opts = q?.options || q?.choices || []
  return (Array.isArray(opts) ? opts : [])
    .map((o: any) => (typeof o === 'string' ? o : o?.label || o?.text || o?.value || ''))
    .filter(Boolean)
}

function qRecommended(q: any): string | null {
  if (q?.recommended != null) {
    return typeof q.recommended === 'string' ? q.recommended : q.recommended?.label || null
  }
  const idx = q?.recommended_index ?? q?.recommendedIndex
  const opts = qOptions(q)
  if (typeof idx === 'number' && opts[idx]) return opts[idx]
  return null
}

function describeEvent(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null
  switch (obj.type) {
    case 'run_start': return obj.use_case ? `Started — use-case ${obj.use_case}` : 'Started'
    case 'ingested': return `Source landed (${obj.status || 'ok'})`
    case 'corpus': return 'Requirements corpus ready'
    case 'source_start': return obj.total ? `Processing source ${obj.index ?? '?'}/${obj.total}` : 'Processing source'
    case 'source_skipped': return 'Source skipped'
    case 'plan': return 'Plan ready'
    case 'assumed_default': return 'Auto-answered a low-risk question with its recommended default'
    case 'agent_message': return obj.text ? String(obj.text).slice(0, 200) : null
    case 'warning': return `Warning: ${obj.message || obj.code || ''}`.trim()
    case 'validate_failed': return 'Validating — self-repairing…'
    case 'degraded': return 'Reduced duplicate detection — new items will be held for your review'
    case 'held':
    case 'update_held': return `${obj.count ?? 'Some'} item(s) held for your review`.trim()
    case 'commit': return 'Committed to the context graph'
    case 'receipt': {
      const phase = obj.phase ? ` (${obj.phase})` : ''
      const n = Array.isArray(obj.committed) ? ` — ${obj.committed.length} item(s)` : ''
      return `Phase committed${phase}${n}`
    }
    case 'message_sent': return 'Answer delivered'
    case 'session_complete': return 'Session complete'
    case 'session_paused': return 'Paused — Kane has a question'
    case 'gate_refused': return `Refused by a design gate: ${obj.message || 'see next commands'}`
    case 'ask_user': return 'Agent is asking for input — nobody can answer in headless mode; will auto-skip shortly'
    case 'step_start': return `Step ${obj.step ?? ''} started${obj.title ? `: ${obj.title}` : ''}`.trim()
    case 'step_end': return `Step ${obj.step ?? ''} done`
    case 'step_event': return obj.remark ? String(obj.remark) : null
    case 'describe_trigger': return null
    case 'error': return `Error: ${obj.message || obj.code || 'unknown'}`
    case 'done': return obj.status === 'paused' ? 'Paused — resume to continue' : `Finished (${obj.status || 'done'})`
    case 'agent_activity':
    case 'panel_resolved':
    case 'lock_steal':
      return null
    default:
      if (obj.type) return String(obj.type).replace(/_/g, ' ')
      if (obj.step != null) return `Step ${obj.step}${obj.status ? ` ${obj.status}` : ''}${obj.remark ? `: ${obj.remark}` : ''}`
      return null
  }
}

function currentActivity(events: any[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const o = events[i]
    if (o?.type === 'agent_activity' && (o.label || o.kind)) return String(o.label || o.kind)
  }
  return null
}

function totalCredits(events: any[]): number | null {
  let last: any = null
  for (const o of events) if (o?.type === 'usage') last = o
  if (!last) return null
  const t = last.total_credits ?? last.totalCredits
  return typeof t === 'number' ? t : null
}

function collectNext(events: any[]): string[] {
  const out: string[] = []
  for (const o of events) {
    const n = o?.next
    if (!n) continue
    for (const item of Array.isArray(n) ? n : []) {
      if (typeof item === 'string') out.push(item)
      else if (item?.cmd) out.push(String(item.cmd))
    }
  }
  return [...new Set(out)]
}

export default function KaneFlow({ folder }: Props) {
  const [data, setData] = useState<Assurance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [job, setJob] = useState<KaneJobState | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [runs, setRuns] = useState<KaneRunRecord[]>([])
  const [devStatus, setDevStatus] = useState<{ running: boolean; port: number; startUrl: string } | null>(null)
  const [devLoading, setDevLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [designProgress, setDesignProgress] = useState<{ done: number; total: number } | null>(null)
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null)
  const stopRunsRef = useRef(false)
  const [backendStale, setBackendStale] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settledRef = useRef<((j: KaneJobState) => void) | null>(null)
  const autoSkipRef = useRef<string | null>(null)
  const [runDetail, setRunDetail] = useState<KaneRunRecord | null>(null)
  const [evLoading, setEvLoading] = useState(false)

  const fetchAssurance = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await jsonFetch(`/api/kane/assurance?folder=${encodeURIComponent(folder)}`)
      setData(d)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchRunsData = async () => {
    if (!folder) return
    try {
      const r = await fetchRuns(folder)
      setRuns(r.runs || [])
    } catch {}
  }

  const fetchDevStatus = async () => {
    if (!folder) return
    try {
      const j = await jsonFetch(`/api/kane/prepare/status?folder=${encodeURIComponent(folder)}`)
      setDevStatus(j)
    } catch {}
  }

  useEffect(() => {
    fetchHealth().then((h) => setBackendStale(!h?.kaneJobs)).catch(() => setBackendStale(true))
    fetchAssurance()
    fetchRunsData()
    fetchDevStatus()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      settledRef.current = null
    }
  }, [folder])

  const afterJobSettled = (j: KaneJobState) => {
    if (j.type === 'testmd') fetchRunsData()
    else fetchAssurance()
  }

  useEffect(() => {
    if (job?.status !== 'running') return
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [job?.status, jobId])

  const pollJob = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const tick = async () => {
      try {
        const j = await fetchKaneJob(id)
        setJob(j)
        // Auto-skip: headless testmd runs can stall forever on ask_user (nothing to answer)
        if (j.status === 'running' && j.type === 'testmd') {
          const idle = Date.now() - Date.parse(j.updatedAt)
          const last = j.events[j.events.length - 1]
          const stuckAsk = last?.type === 'ask_user' && idle > 90000
          const stuckIdle = idle > 300000
          if ((stuckAsk || stuckIdle) && autoSkipRef.current !== j.id) {
            autoSkipRef.current = j.id
            setActionMsg(stuckAsk
              ? 'Test stuck on an ask_user prompt — cancelling and continuing with the next test…'
              : 'Test idle for 5 minutes — cancelling and continuing…')
            cancelKaneJob(j.id).catch(() => {})
          }
        }
        if (j.status === 'running') {
          timerRef.current = setTimeout(tick, 1200)
          return
        }
        afterJobSettled(j)
        const cb = settledRef.current
        settledRef.current = null
        cb?.(j)
      } catch {
        timerRef.current = setTimeout(tick, 2500)
      }
    }
    tick()
  }

  const runJob = async (start: Promise<{ jobId: string }>): Promise<KaneJobState> => {
    const { jobId: id } = await start
    setJobId(id)
    setJob(null)
    setDrafts({})
    setStartedAt(Date.now())
    return new Promise<KaneJobState>((resolve) => {
      settledRef.current = resolve
      pollJob(id)
    })
  }

  // ---- actions ----
  const handleIngest = async () => {
    setBusy('ingest')
    setActionMsg(null)
    try {
      const j = await runJob(startKaneIngest(folder))
      if (j.status === 'done') setActionMsg('Ingest complete — use-cases extracted.')
      else if (j.status === 'error') setActionMsg(`Ingest failed: ${j.error}`)
    } catch (e: any) {
      setActionMsg(`Ingest failed: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const handleReview = async () => {
    setBusy('review')
    setActionMsg(null)
    try {
      const r = await kaneReview(folder, { approveAll: true })
      setActionMsg(r.message || (r.ok ? 'Use-cases approved.' : `Review failed: ${(r.stdout || '').slice(-200)}`))
      fetchAssurance()
    } catch (e: any) {
      setActionMsg(`Review failed: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const handleDesignAll = async () => {
    const trusted = (data?.ucs || []).filter((u) => u._trusted)
    if (!trusted.length) return
    setBusy('design')
    setActionMsg(null)
    setDesignProgress({ done: 0, total: trusted.length })
    let paused = false
    let failures = 0
    for (let i = 0; i < trusted.length; i++) {
      try {
        const { jobId: id } = await startKaneDesign(folder, trusted[i]._id, 8)
        setJobId(id)
        setJob(null)
        setDrafts({})
        setStartedAt(Date.now())
        const j = await new Promise<KaneJobState>((resolve) => {
          settledRef.current = resolve
          pollJob(id)
        })
        if (j.status === 'paused') { paused = true; break }
        if (j.status === 'error') failures++
      } catch (e: any) {
        failures++
      }
      setDesignProgress({ done: i + 1, total: trusted.length })
    }
    setBusy(null)
    if (paused) setActionMsg('Design paused — answer Kane\'s question below, then press Design again to continue.')
    else setActionMsg(`Design finished${failures ? ` — ${failures} use-case(s) need attention` : ''}.`)
    if (!paused) setDesignProgress(null)
    fetchAssurance()
  }

  const handleTestRun = async (file: string) => {
    setBusy(`test-${file}`)
    setActionMsg(null)
    try {
      const j = await runJob(startTestmdRun(folder, file))
      if (j.runEnd) setActionMsg(`Test ${j.runEnd.status || 'finished'} — info saved for slides/tutorial.`)
      else if (j.status === 'error') setActionMsg(`Test failed: ${j.error}`)
    } catch (e: any) {
      setActionMsg(`Test run failed: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const runTests = async (list: string[]) => {
    if (!list.length) return
    if (!devStatus?.running) {
      setActionMsg('Start the dev server first — the tests drive the running app.')
      return
    }
    setBusy('runall')
    setActionMsg(null)
    stopRunsRef.current = false
    setRunProgress({ done: 0, total: list.length })
    let oks = 0, fails = 0
    for (let i = 0; i < list.length; i++) {
      if (stopRunsRef.current) break
      try {
        const j = await runJob(startTestmdRun(folder, list[i]))
        if (j.runEnd?.status === 'passed') oks++
        else fails++
      } catch {
        fails++
      }
      setRunProgress({ done: i + 1, total: list.length })
    }
    const stopped = stopRunsRef.current
    setBusy(null)
    setRunProgress(null)
    setActionMsg(`Runs finished${stopped ? ' (stopped early)' : ''}: ${oks} passed · ${fails} failed — results saved for slides/tutorial.`)
    fetchRunsData()
    fetchAssurance()
  }

  const handleRunAll = async () => runTests(tests)

  const handleRunRemaining = async () => runTests(remaining)

  const handleAnswer = async () => {
    if (!job || job.status !== 'paused') return
    const hasQs = (job.questions || []).length > 0
    const parts = job.questions.map((q: any, i: number) => (drafts[i]?.trim()) || qRecommended(q) || '')
    const message = hasQs ? parts.filter(Boolean).join('\n') : ''
    if (hasQs && !message) return
    try {
      const j = await answerKaneJob(job.id, message)
      setJob(j)
      setDrafts({})
      if (j.status === 'running') pollJob(j.id)
    } catch (e: any) {
      setActionMsg(`Resume failed: ${e.message}`)
    }
  }

  const handleResumeSession = async (sid: string, verb: string) => {
    setBusy(`resume-${sid}`)
    setActionMsg(null)
    try {
      await runJob(startKaneResume(folder, sid, verb))
    } catch (e: any) {
      setActionMsg(`Resume failed: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const handleCancelJob = async () => {
    if (!job) return
    try { await cancelKaneJob(job.id) } catch {}
  }

  const handleOpenEvidence = async (pack: string) => {
    setEvLoading(true)
    try {
      const r = await serveEvidence(pack)
      window.open(r.viewer, '_blank')
    } catch (e: any) {
      setActionMsg(`Evidence viewer failed: ${e.message}`)
    } finally {
      setEvLoading(false)
    }
  }

  const handlePrepare = async () => {
    setDevLoading(true)
    try {
      const j = await jsonFetch('/api/kane/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      if (j.ok) {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500))
          const s = await jsonFetch(`/api/kane/prepare/status?folder=${encodeURIComponent(folder)}`)
          setDevStatus(s)
          if (s.running) break
        }
      } else setActionMsg(j.error || 'Prepare failed')
    } catch (e: any) {
      setActionMsg(e.message)
    } finally {
      setDevLoading(false)
      fetchDevStatus()
    }
  }

  const handleStopDev = async () => {
    setDevLoading(true)
    try {
      await jsonFetch('/api/kane/prepare/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      setDevStatus((s) => (s ? { ...s, running: false } : s))
    } catch {}
    finally {
      setDevLoading(false)
      fetchDevStatus()
    }
  }

  if (backendStale) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl p-6">
        <p className="text-sm font-bold text-amber-800">CLI server is out of date</p>
        <p className="text-xs text-[#6E6480] mt-1">The running Unikorn CLI doesn't have the Kane automation endpoints. Restart it and refresh this page:</p>
        <pre className="mt-2 text-xs font-mono bg-[#FBFAFE] border border-[#E5DEFA] rounded-lg p-2 inline-block">npm run dev</pre>
        <button onClick={() => { setBackendStale(false); fetchHealth().then((h) => setBackendStale(!h?.kaneJobs)).catch(() => setBackendStale(true)); fetchAssurance(); fetchRunsData() }} className="ml-2 text-xs border border-[#E5DEFA] rounded-full px-3 py-1.5">
          Re-check
        </button>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6">
        <div className="flex items-center gap-2 text-sm text-[#6E6480]">
          <span className="w-4 h-4 border-2 border-[#E5DEFA] border-t-[#7C5CFC] rounded-full animate-spin" />
          Loading Kane assurance…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchAssurance} className="mt-2 text-xs border border-[#E5DEFA] rounded-full px-3 py-1.5">
          Retry
        </button>
      </div>
    )
  }

  const ucs = data?.ucs || []
  const trusted = ucs.filter((u) => u._trusted)
  const derived = ucs.filter((u) => !u._trusted)
  const tests = data?.tests || []
  const coverPct: number | null = data?.cover?.design_completeness?.pct ?? null
  const gap = data?.cover?.other?.[0]
  const jobRunning = !!jobId && (job == null || job.status === 'running')
  const disableAll = !!busy || jobRunning

  const steps = [
    { id: 'ingest', label: 'Ingest PRD', desc: `${ucs.length} use-case${ucs.length === 1 ? '' : 's'} extracted`, done: ucs.length > 0, actionLabel: ucs.length ? 'Re-ingest' : 'Ingest', action: handleIngest },
    { id: 'review', label: 'Review use-cases', desc: derived.length ? `${derived.length} awaiting approval` : `${trusted.length} trusted`, done: trusted.length > 0, actionLabel: 'Approve all', action: handleReview, disabled: derived.length === 0 },
    { id: 'design', label: 'Design tests', desc: designProgress ? `Designing ${designProgress.done}/${designProgress.total}…` : `${trusted.length} trusted use-case${trusted.length === 1 ? '' : 's'}`, done: false, actionLabel: designProgress ? `${designProgress.done}/${designProgress.total}` : 'Design all trusted', action: handleDesignAll, disabled: trusted.length === 0 || !!designProgress },
    { id: 'author', label: 'Run tests — collect info', desc: runProgress ? `Running ${runProgress.done}/${runProgress.total}…` : `${tests.length} test file${tests.length === 1 ? '' : 's'} · ${runs.length} run${runs.length === 1 ? '' : 's'} collected`, done: runs.length > 0, action: null, actionLabel: '' },
    { id: 'cover', label: 'Coverage', desc: coverPct != null ? `${coverPct}% designed` : 'run Kane to measure', done: false, actionLabel: 'Refresh', action: fetchAssurance },
  ]

  const jobEvents = (job?.events || []).map(describeEvent).filter(Boolean) as string[]
  const activity = job ? currentActivity(job.events) : null
  const credits = job ? totalCredits(job.events) : null
  const nextCmds = job ? collectNext(job.events) : []
  const elapsedS = startedAt && job?.status === 'running' ? Math.floor((nowTick - startedAt) / 1000) : null
  const lastAgeS = job?.status === 'running' && job?.updatedAt ? Math.floor((nowTick - Date.parse(job.updatedAt)) / 1000) : null
  const pausedQuestions = job?.status === 'paused' ? (job.questions || []) : []
  const rawSessions = data?.sessions
  const resumableSessions = (Array.isArray(rawSessions) ? rawSessions : rawSessions ? [rawSessions] : [])
    .filter((s: any) => s?.sid && s?.resume && !jobId)
  const lastRunByFile = new Map<string, KaneRunRecord>()
  for (const r of runs) if (!lastRunByFile.has(r.file)) lastRunByFile.set(r.file, r)
  const remaining = tests.filter((t) => !lastRunByFile.has(t))
  const askWaiting = job?.status === 'running' && job?.type === 'testmd' && job?.events[job.events.length - 1]?.type === 'ask_user'

  return (
    <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#251F33]">Kane Assurance</h3>
        <button onClick={fetchAssurance} className="text-xs border border-[#E5DEFA] rounded-full px-3 py-1">
          Refresh
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-3">
        <div>
          <p className="text-xs font-medium text-[#251F33]">Dev server {devStatus?.running ? '● running' : '○ stopped'}</p>
          <p className="text-[11px] text-[#8A7FA6] font-mono">{devStatus?.startUrl || 'http://localhost:5173'} {devStatus?.running ? '· ready' : '· not reachable'}</p>
        </div>
        <div className="flex items-center gap-2">
          {devStatus?.running && (
            <button onClick={handleStopDev} disabled={devLoading} className="text-xs border border-[#E5DEFA] rounded-full px-3 py-1.5 hover:bg-[#F1ECFE] disabled:opacity-50">
              Stop
            </button>
          )}
          <button
            onClick={handlePrepare}
            disabled={devLoading}
            className={`text-xs font-bold rounded-full px-3 py-1.5 ${devStatus?.running ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#7C5CFC] text-white'}`}
          >
            {devLoading ? 'Working…' : devStatus?.running ? 'Running ✓' : 'Prepare dev server'}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="mb-4 text-xs bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-3 text-[#251F33]">
          {actionMsg}
        </div>
      )}

      {/* Active job panel with live events + pause questions */}
      {jobId && (
        <div className="mb-4 border border-[#E5DEFA] rounded-xl p-3 bg-[#FBFAFE]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#251F33] flex items-center gap-2 flex-wrap">
              <span>
                kane {job?.type || 'job'} · <span className={job?.status === 'error' ? 'text-red-600' : job?.status === 'paused' ? 'text-amber-600' : job?.status === 'done' ? 'text-emerald-600' : 'text-[#7C5CFC]'}>{job?.status || 'starting…'}</span>
              </span>
              {job?.status === 'running' && (
                <span className="flex items-center gap-1.5 font-normal text-[#6E6480]">
                  <span className="w-2 h-2 rounded-full bg-[#7C5CFC] animate-pulse" />
                  {elapsedS != null && <span>{elapsedS < 60 ? `${elapsedS}s` : `${Math.floor(elapsedS / 60)}m ${elapsedS % 60}s`}</span>}
                  <span>·</span>
                  <span>{lastAgeS != null && lastAgeS > 30 ? `idle ${lastAgeS}s` : 'active'}</span>
                </span>
              )}
              {credits != null && <span className="font-normal text-[#8A7FA6]">· credits so far: {credits}</span>}
            </p>
            {job?.status === 'running' && (
              <button onClick={handleCancelJob} className="text-[11px] text-[#8A7FA6] hover:text-red-600">Cancel</button>
            )}
          </div>

          {job?.status === 'running' && activity && (
            <p className="mt-1 text-[11px] text-[#7C5CFC] font-medium">Working: {activity}</p>
          )}

          {askWaiting && (
            <p className="mt-1 text-[11px] text-amber-700 font-medium">
              Waiting on an agent question — auto-skip engages after 90s idle and continues with the next test.
            </p>
          )}

          {nextCmds.length > 0 && (job?.status === 'error' || job?.status === 'paused') && (
            <div className="mt-2 bg-white border border-[#E5DEFA] rounded-lg p-2">
              <p className="text-[11px] font-bold text-[#251F33]">Suggested next steps:</p>
              {nextCmds.slice(0, 3).map((c, i) => (
                <code key={i} className="block text-[10px] font-mono text-[#6E6480] mt-0.5 break-all">{c}</code>
              ))}
            </div>
          )}

          {job?.status === 'paused' && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {pausedQuestions.length === 0 ? (
                <>
                  <p className="text-xs font-bold text-amber-800">Kane paused mid-design — nothing to answer.</p>
                  <p className="text-[11px] text-[#6E6480] mt-0.5">Committed phases are saved. Resuming continues from kane's checkpoint.</p>
                  <button
                    onClick={handleAnswer}
                    className="mt-2 bg-[#7C5CFC] text-white text-xs font-bold rounded-full px-3.5 py-1.5 hover:opacity-90"
                  >
                    Resume design
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-amber-800 mb-2">Kane paused and needs your answer:</p>
                  {pausedQuestions.map((q: any, i: number) => {
                    const opts = qOptions(q)
                    const rec = qRecommended(q)
                    const why = qRationale(q)
                    return (
                      <div key={i} className="mb-3 last:mb-0">
                        <p className="text-xs text-[#251F33]">{qText(q)}</p>
                        {why && <p className="text-[11px] text-[#8A7FA6] mt-0.5">{why}</p>}
                        {rec && <p className="text-[11px] text-amber-700 mt-0.5">Recommended: {rec}</p>}
                        {opts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {opts.map((o, oi) => (
                              <button
                                key={oi}
                                onClick={() => setDrafts((d) => ({ ...d, [i]: o }))}
                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${drafts[i] === o ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]' : 'bg-white border-[#E5DEFA] hover:border-[#7C5CFC]'}`}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                        )}
                        <input
                          type="text"
                          placeholder="Or type your answer…"
                          value={drafts[i] || ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                          className="w-full mt-1.5 text-xs border border-[#E5DEFA] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7C5CFC] bg-white"
                        />
                      </div>
                    )
                  })}
                  <button
                    onClick={handleAnswer}
                    disabled={Object.values(drafts).every((v) => !v?.trim()) && pausedQuestions.every((q: any) => !qRecommended(q))}
                    className="mt-1 bg-[#7C5CFC] text-white text-xs font-bold rounded-full px-3.5 py-1.5 hover:opacity-90 disabled:opacity-40"
                  >
                    Answer &amp; resume
                  </button>
                </>
              )}
            </div>
          )}

          {job?.error && <p className="text-xs text-red-600 mt-1.5">{job.error}</p>}

          {jobEvents.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto font-mono text-[10px] leading-relaxed text-[#6E6480] space-y-0.5">
              {jobEvents.slice(-8).map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resumable sessions — persisted in kane's store, survives backend restarts */}
      {resumableSessions.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-bold text-amber-800">Paused kane session(s) — work is saved, resume anytime (24h)</p>
          {resumableSessions.map((s: any) => (
            <div key={s.sid} className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-[#6E6480] truncate">{s.verb || 'design'} · {s.use_case || s.sid}</span>
              <button
                onClick={() => handleResumeSession(s.sid, s.verb === 'extract' ? 'extract' : 'design')}
                disabled={disableAll}
                className="shrink-0 text-[11px] font-bold text-white bg-[#7C5CFC] rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-40"
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      )}

      {ucs.length === 0 && (
        <div className="mb-6 bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] rounded-2xl p-5 text-white">
          <h4 className="text-sm font-bold">Get started with Kane</h4>
          <p className="text-xs opacity-90 mt-1">No use-cases yet. Ingest the generated PRD — Kane extracts use-cases, then you review, design tests, and run them to collect info.</p>
          <button
            onClick={handleIngest}
            disabled={disableAll}
            className="mt-3 bg-white text-[#7C5CFC] text-xs font-bold rounded-full px-4 py-2 hover:bg-[#F1ECFE] transition-colors disabled:opacity-50"
          >
            {busy === 'ingest' ? 'Ingesting…' : 'Ingest PRD & Start →'}
          </button>
          <p className="text-[11px] opacity-75 mt-2">Kane may pause with a question — you'll answer it right here.</p>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((s, idx) => (
          <div key={s.id} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-[#F1ECFE] text-[#7C5CFC]'}`}>
              {s.done ? '✓' : idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#251F33]">{s.label}</p>
              <p className="text-xs text-[#8A7FA6]">{s.desc}</p>

              {s.id === 'review' && derived.length > 0 && (
                <div className="mt-1 space-y-1">
                  {derived.slice(0, 5).map((u) => (
                    <div key={u._id} className="text-xs font-mono bg-[#FBFAFE] border border-[#E5DEFA] rounded px-2 py-1 truncate">
                      {u._title}
                    </div>
                  ))}
                  {derived.length > 5 && <p className="text-[11px] text-[#8A7FA6]">+{derived.length - 5} more</p>}
                </div>
              )}

              {s.id === 'design' && gap?.why && (
                <div className="mt-1 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-amber-700">Gap: {gap.why}</p>
                </div>
              )}

              {s.id === 'author' && tests.length > 0 && (
                <div className="mt-1 space-y-1">
                  {tests.slice(0, 6).map((t) => {
                    const last = lastRunByFile.get(t)
                    return (
                      <div key={t} className="flex items-center justify-between gap-2 text-xs bg-[#FBFAFE] border border-[#E5DEFA] rounded px-2 py-1">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${last ? (last.status === 'passed' ? 'bg-emerald-500' : 'bg-red-400') : 'bg-[#D6CCF2]'}`} />
                          <span className="font-mono truncate">{t.replace('.testmuai/tests/', '').replace('_test.md', '')}</span>
                        </span>
                        <button
                          onClick={() => handleTestRun(t)}
                          disabled={disableAll}
                          className="shrink-0 text-[11px] font-bold text-[#7C5CFC] border border-[#E5DEFA] rounded-full px-2.5 py-0.5 hover:bg-[#F1ECFE] disabled:opacity-40"
                        >
                          {busy === `test-${t}` ? 'Running…' : 'Run'}
                        </button>
                      </div>
                    )
                  })}
                  {tests.length > 6 && <p className="text-[11px] text-[#8A7FA6]">+{tests.length - 6} more</p>}
                </div>
              )}
            </div>
            {s.id === 'author' && tests.length > 0 && (
              <div className="flex flex-col gap-1.5 shrink-0 items-end">
                {runProgress ? (
                  <button
                    onClick={() => { stopRunsRef.current = true }}
                    className="text-xs font-bold text-white bg-red-500 rounded-full px-3 py-1 hover:opacity-90 whitespace-nowrap"
                  >
                    Stop ({runProgress.done}/{runProgress.total})
                  </button>
                ) : (
                  <>
                    {remaining.length > 0 && (
                      <button
                        onClick={handleRunRemaining}
                        disabled={disableAll}
                        className="text-xs font-bold text-white bg-[#7C5CFC] rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                      >
                        Run remaining ({remaining.length})
                      </button>
                    )}
                    <button
                      onClick={handleRunAll}
                      disabled={disableAll}
                      className="text-xs border border-[#E5DEFA] rounded-full px-3 py-1 hover:bg-[#F1ECFE] disabled:opacity-40 whitespace-nowrap"
                    >
                      Run all ({tests.length})
                    </button>
                  </>
                )}
              </div>
            )}
            {s.action && (
              <button
                onClick={s.action}
                disabled={(disableAll && !(s.id === 'author' && runProgress)) || (s as any).disabled}
                className="text-xs border border-[#E5DEFA] rounded-full px-3 py-1 hover:bg-[#F1ECFE] disabled:opacity-40"
              >
                {busy === s.id ? '…' : s.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="mt-4 p-3 bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl">
          <p className="text-xs font-medium text-[#251F33]">Collected info from runs — click one for details</p>
          <div className="mt-1.5 space-y-1">
            {runs.slice(0, 6).map((r, i) => (
              <button
                key={i}
                onClick={() => { setRunDetail(r); setEvLoading(false) }}
                className="w-full flex items-center gap-2 text-[11px] text-[#6E6480] text-left hover:bg-white rounded px-1 py-0.5 transition-colors"
              >
                <span className={r.status === 'passed' ? 'text-emerald-600' : 'text-red-500'}>{r.status === 'passed' ? '✓' : '✗'}</span>
                <span className="font-mono truncate">{r.file.replace('.testmuai/tests/', '').replace('_test.md', '')}</span>
                <span className="text-[#8A7FA6]">{new Date(r.finishedAt).toLocaleString()}</span>
                {r.finalState && Object.keys(r.finalState).length > 0 && (
                  <span className="text-[#7C5CFC]">· {Object.keys(r.finalState).length} stored value(s)</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#8A7FA6] mt-1.5">Saved with the PRD — feeds tutorial/slide generation.</p>
        </div>
      )}

      <div className="mt-4 text-[11px] text-[#8A7FA6]">
        <p>Pipeline: PRD → ingest → review → design → run tests → collect info. Every step streams live; when Kane pauses, answer inline.</p>
      </div>

      {/* Run result drawer */}
      {runDetail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setRunDetail(null)} />
          <div className="relative w-full max-w-[460px] bg-white shadow-2xl h-full border-l border-[#E5DEFA] flex flex-col">
            <div className="px-5 py-4 border-b border-[#EFEAFB] flex items-start justify-between shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#251F33] flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs shrink-0 ${runDetail.status === 'passed' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    {runDetail.status === 'passed' ? '✓' : '✗'}
                  </span>
                  {runDetail.status}
                  {runDetail.duration != null && <span className="font-normal text-xs text-[#8A7FA6]">· {runDetail.duration}s</span>}
                </p>
                <p className="text-[11px] font-mono text-[#8A7FA6] break-all mt-0.5">{runDetail.file}</p>
              </div>
              <button onClick={() => setRunDetail(null)} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE] shrink-0">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-[#251F33]">
              <div>
                <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">Finished</p>
                <p className="text-xs mt-0.5">{new Date(runDetail.finishedAt).toLocaleString()}</p>
              </div>

              {runDetail.oneLiner && (
                <div>
                  <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">Result</p>
                  <p className="text-xs mt-0.5">{runDetail.oneLiner}</p>
                </div>
              )}

              {runDetail.summary && (
                <div>
                  <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">What happened</p>
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-3 mt-1">{runDetail.summary}</pre>
                </div>
              )}

              {runDetail.finalState && Object.keys(runDetail.finalState).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">Collected values (final_state)</p>
                  <div className="mt-1 space-y-1">
                    {Object.entries(runDetail.finalState).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-2 text-xs bg-[#FBFAFE] border border-[#E5DEFA] rounded px-2.5 py-1.5">
                        <span className="font-mono text-[#7C5CFC] shrink-0">{k}</span>
                        <span className="font-mono truncate text-right">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {runDetail.error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{runDetail.error}</div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">Links</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {runDetail.testUrl && (
                    <a href={runDetail.testUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#7C5CFC] border border-[#E5DEFA] rounded-full px-3 py-1.5 hover:bg-[#F1ECFE]">
                      Open Test Manager ↗
                    </a>
                  )}
                  {runDetail.evidencePack && (
                    <button
                      onClick={() => handleOpenEvidence(runDetail.evidencePack!)}
                      disabled={evLoading}
                      className="text-xs font-bold text-white bg-[#7C5CFC] rounded-full px-3 py-1.5 hover:opacity-90 disabled:opacity-40"
                    >
                      {evLoading ? 'Serving…' : 'Open evidence viewer ↗'}
                    </button>
                  )}
                  {!runDetail.testUrl && !runDetail.evidencePack && (
                    <p className="text-xs text-[#8A7FA6]">No links for this run (recorded before evidence capture) — re-run to get one.</p>
                  )}
                </div>
                {runDetail.evidencePack && (
                  <p className="text-[11px] text-[#8A7FA6] mt-1">Evidence viewer shows per-step screenshots, console &amp; network logs. Local-only — nothing uploads.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
