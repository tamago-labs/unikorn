import { useEffect, useRef, useState } from 'react'
import { getWsUrl } from '../api'

interface Props {
  open: boolean
  folder: string
  prdContent: string | null
  onClose: () => void
  onDone: () => void
}

const DEFAULT_STYLE = 'Modern SaaS style: light background #FBFAFE, white cards with border #EFEAFB, purple accent gradient (135deg, #7C5CFC to #B79CFF), Manrope for text, JetBrains Mono for values, rounded-2xl, generous whitespace.'

type Status = 'idle' | 'working' | 'done' | 'error'

export default function ArtifactWizard({ open, folder, prdContent, onClose, onDone }: Props) {
  const [kind, setKind] = useState<'deck' | 'tutorial'>('deck')
  const [purpose, setPurpose] = useState<'pitch' | 'demo'>('pitch')
  const [topic, setTopic] = useState('Full product tour')
  const [audience, setAudience] = useState('Developer')
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState('')
  const [outline, setOutline] = useState<any | null>(null)
  const [result, setResult] = useState<{ id: string; url: string; pageCount: number; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const ucs = Array.from(prdContent?.matchAll(/### UC-\d+: (.+)/g) || []).map((m) => m[1].trim())

  useEffect(() => {
    if (!open) {
      wsRef.current?.close()
      wsRef.current = null
      return
    }
    setStatus('idle')
    setProgress('')
    setOutline(null)
    setResult(null)
    setError(null)
  }, [open])

  const start = () => {
    setStatus('working')
    setProgress('Connecting…')
    setOutline(null)
    setResult(null)
    setError(null)
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'artifact:start', folder, kind, purpose, topic, audience, stylePrompt }))
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'artifact:progress') {
          setProgress(msg.status)
        } else if (msg.type === 'artifact:outline') {
          setOutline(msg.outline)
        } else if (msg.type === 'artifact:done') {
          setResult(msg)
          setStatus('done')
          onDone()
        } else if (msg.type === 'artifact:error') {
          setError(msg.error)
          setStatus('error')
        } else if (msg.type === 'artifact:aborted') {
          setError('Cancelled')
          setStatus('error')
        }
      } catch {}
    }
    ws.onerror = () => {
      setError('WebSocket error — is the CLI server running?')
      setStatus('error')
    }
  }

  const handleCancel = () => {
    wsRef.current?.send(JSON.stringify({ type: 'prd:cancel' }))
    wsRef.current?.close()
    setStatus('idle')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={status === 'working' ? undefined : onClose} />
      <div className="relative w-full max-w-[480px] bg-white shadow-2xl h-full border-l border-[#E5DEFA] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEAFB] shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#251F33]">Create artifact</h2>
            <p className="text-xs text-[#8A7FA6] font-mono truncate max-w-[300px]">{folder}</p>
          </div>
          <button onClick={status === 'working' ? handleCancel : onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE]">
            {status === 'working' ? '■' : '×'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Kind */}
          <div>
            <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2">What are you building?</p>
            <div className="grid grid-cols-2 gap-2">
              {(['deck', 'tutorial'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  disabled={status === 'working'}
                  className={`text-sm font-bold rounded-xl px-3 py-2.5 border transition-colors disabled:opacity-50 ${kind === k ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]' : 'bg-white border-[#E5DEFA] text-[#251F33] hover:border-[#7C5CFC]'}`}
                >
                  {k === 'deck' ? 'Slide deck' : 'Tutorial'}
                </button>
              ))}
            </div>
          </div>

          {/* Purpose (deck only) */}
          {kind === 'deck' && (
            <div>
              <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2">Deck purpose</p>
              <div className="grid grid-cols-2 gap-2">
                {([['pitch', 'Pitch'], ['demo', 'Demo walkthrough']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setPurpose(v)}
                    disabled={status === 'working'}
                    className={`text-xs font-bold rounded-xl px-3 py-2 border transition-colors disabled:opacity-50 ${purpose === v ? 'bg-[#F1ECFE] text-[#7C5CFC] border-[#7C5CFC]' : 'bg-white border-[#E5DEFA] text-[#251F33] hover:border-[#7C5CFC]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Topic */}
          <div>
            <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2">Topic</p>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={status === 'working'}
              className="w-full text-sm border border-[#E5DEFA] rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#7C5CFC] disabled:opacity-50"
            >
              <option>Full product tour</option>
              {ucs.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            {ucs.length === 0 && <p className="text-[11px] text-[#8A7FA6] mt-1">No use-cases parsed from the PRD — "Full product tour" covers everything.</p>}
          </div>

          {/* Audience */}
          <div>
            <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2">Audience</p>
            <div className="flex gap-2">
              {['Developer', 'Investor', 'End user'].map((a) => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  disabled={status === 'working'}
                  className={`text-xs rounded-full px-3 py-1.5 border transition-colors disabled:opacity-50 ${audience === a ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]' : 'bg-white border-[#E5DEFA] text-[#251F33] hover:border-[#7C5CFC]'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Style prompt */}
          <div>
            <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2">Design direction</p>
            <textarea
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              disabled={status === 'working'}
              rows={4}
              placeholder="Describe the look: colors, fonts, mood, layout…"
              className="w-full text-sm border border-[#E5DEFA] rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#7C5CFC] disabled:opacity-50 resize-none"
            />
          </div>

          {/* Progress / outline / result */}
          {status === 'working' && (
            <div className="bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-3">
              <p className="text-xs font-medium text-[#7C5CFC] flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[#E5DEFA] border-t-[#7C5CFC] rounded-full animate-spin" />
                {progress}
              </p>
              {outline && Array.isArray(outline.sections) && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold text-[#251F33]">{outline.title}</p>
                  <ol className="mt-1 space-y-0.5">
                    {outline.sections.map((s: any, i: number) => (
                      <li key={s.id || i} className="text-[11px] text-[#6E6480]">{i + 1}. {s.title}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {status === 'done' && result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-bold text-emerald-700">Artifact ready ✓</p>
              <p className="text-xs text-[#6E6480] mt-0.5">{result.title} · {result.pageCount} pages</p>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-2 bg-[#7C5CFC] text-white text-xs font-bold rounded-full px-4 py-2 hover:opacity-90"
              >
                Open ↗
              </a>
            </div>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
        </div>

        <div className="p-4 border-t border-[#EFEAFB] shrink-0">
          {status === 'done' ? (
            <button onClick={() => setStatus('idle')} className="w-full py-2.5 rounded-xl bg-[#251F33] text-white text-sm font-semibold">
              Create another
            </button>
          ) : (
            <button
              onClick={start}
              disabled={status === 'working'}
              className="w-full py-2.5 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white text-sm font-semibold disabled:opacity-50"
            >
              {status === 'working' ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
