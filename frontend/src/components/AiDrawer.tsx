import { useEffect, useRef, useState } from 'react'
import { getWsUrl, type Inventory } from '../api'

interface Question {
  id: string
  question: string
  choices: string[]
  allowFreeText: boolean
}

interface ToolCall {
  tool: string
  args: any
  status: 'running' | 'result'
  result?: string
}

function cleanThinking(raw: string): string {
  // Generic provider-agnostic strip: hide raw tool XML leaks like <tool_call>, <longcat_tool_call>, <function_call>, <invoke>
  return raw
    .replace(/<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>[\s\S]*?<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi, '')
    .replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file|longcat_arg_key|longcat_arg_value)\b[^>]*\/?>/gi, '')
    .trim()
}

function friendlyToolLabel(tc: ToolCall): string {
  if (tc.tool === 'read_file' && tc.args?.path) return `Reading ${tc.args.path}`
  if (tc.tool === 'list_files') {
    const dir = tc.args?.dir ? tc.args.dir : 'project root'
    return `Listing ${dir}`
  }
  if (tc.tool === 'save_prd') return 'Saving PRD…'
  return tc.tool.replace(/_/g, ' ')
}

interface Props {
  open: boolean
  folder: string
  inventory: Inventory | null
  onClose: () => void
  onDone: () => void
}

export default function AiDrawer({ open, folder, inventory, onClose, onDone }: Props) {
  const [thinking, setThinking] = useState('')
  const [content, setContent] = useState('')
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'streaming' | 'awaiting' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }

  const onScroll = () => {
    const el = contentRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(nearBottom)
  }

  useEffect(() => {
    if (atBottom) scrollToBottom(false)
  }, [thinking, content, toolCalls, questions, atBottom])

  // auto-expand thinking briefly, then collapse when content starts
  useEffect(() => {
    if (content.length > 0) setThinkingExpanded(false)
    else if (thinking.length > 0) setThinkingExpanded(true)
  }, [content, thinking])

  useEffect(() => {
    if (!open) {
      wsRef.current?.close()
      wsRef.current = null
      return
    }
    setThinking('')
    setContent('')
    setToolCalls([])
    setQuestions([])
    setAnswers({})
    setError(null)
    setStatus('streaming')

    const wsUrl = getWsUrl()
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'prd:start', folder }))
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'prd:thinking' && msg.delta) {
          const cleaned = cleanThinking(msg.delta)
          // drop empty deltas that were only XML tags
          if (cleaned || msg.delta.trim().length < 20) {
            // if cleaned empty but delta was XML, don't append raw XML
            if (cleaned) setThinking((p) => p + cleaned)
          } else if (!msg.delta.toLowerCase().includes('tool_call') && !msg.delta.toLowerCase().includes('invoke')) {
            setThinking((p) => p + msg.delta)
          }
        } else if (msg.type === 'prd:content' && msg.delta) {
          // also strip any leaked tool tags from content (generic)
          const cleaned = msg.delta
            .replace(/<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>[\s\S]*?<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi, '')
            .replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file)\b[^>]*\/?>/gi, '')
          if (cleaned) {
            setContent((p) => p + cleaned)
            setStatus('streaming')
          }
        } else if (msg.type === 'prd:tool_call') {
          setToolCalls((prev) => {
            const idx = prev.findIndex((t) => t.tool === msg.tool && JSON.stringify(t.args) === JSON.stringify(msg.args) && t.status === 'running')
            if (msg.status === 'running') return [...prev, { tool: msg.tool, args: msg.args, status: 'running' }]
            if (idx >= 0) {
              const copy = [...prev]
              copy[idx] = { ...copy[idx], status: 'result', result: msg.result }
              return copy
            }
            return [...prev, { tool: msg.tool, args: msg.args, status: 'result', result: msg.result }]
          })
        } else if (msg.type === 'prd:question') {
          setQuestions((prev) => (prev.find((q) => q.id === msg.id) ? prev : [...prev, msg as Question]))
          setStatus('awaiting')
        } else if (msg.type === 'prd:awaiting_answers') {
          setStatus('awaiting')
        } else if (msg.type === 'prd:done') {
          setStatus('done')
          // keep content
          onDone()
        } else if (msg.type === 'prd:error') {
          setError(msg.error)
          setStatus('error')
        } else if (msg.type === 'prd:aborted') {
          setError('Cancelled')
          setStatus('error')
        } else if (msg.type === 'prd:inventory') {
          // ignore for now
        }
      } catch {}
    }
    ws.onerror = () => {
      setError('WebSocket error')
      setStatus('error')
    }
    ws.onclose = () => {
      if (status !== 'done' && status !== 'error' && status !== 'awaiting') {
        // keep
      }
    }
    return () => ws.close()
  }, [open, folder])

  const submitAnswers = () => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const q of questions) {
      const ans = answers[q.id] || ''
      if (!ans) return // require all
      ws.send(JSON.stringify({ type: 'prd:answer', id: q.id, answer: ans }))
    }
    setStatus('streaming')
  }

  const handleCancel = () => {
    wsRef.current?.send(JSON.stringify({ type: 'prd:cancel' }))
    wsRef.current?.close()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-white shadow-2xl flex flex-col h-full border-l border-[#E5DEFA]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5DEFA] shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#251F33] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7C5CFC] animate-pulse" />
              Unikorn AI
            </h2>
            <p className="text-xs text-[#8A7FA6] font-mono truncate max-w-[300px]">{folder} {inventory ? `· ${inventory.fileCount} files` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-[#F1ECFE] text-[#7C5CFC]">{status}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE]">×</button>
          </div>
        </div>

        <div ref={contentRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-5 space-y-4 scroll-smooth">
          {cleanThinking(thinking) && (
            <div className="bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl overflow-hidden">
              <button
                onClick={() => setThinkingExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">
                  {status === 'streaming' && !content ? (
                    <span className="w-3 h-3 border-2 border-[#E5DEFA] border-t-[#7C5CFC] rounded-full animate-spin" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-[#E5DEFA] flex items-center justify-center text-[9px]">◯</span>
                  )}
                  {status === 'streaming' && !content ? 'Analyzing codebase…' : 'Analysis'}
                  {cleanThinking(thinking).length > 120 && !thinkingExpanded && (
                    <span className="font-normal normal-case text-[11px] text-[#8A7FA6]">· {cleanThinking(thinking).length} chars</span>
                  )}
                </span>
                <span className="text-[11px] text-[#8A7FA6]">{thinkingExpanded ? '−' : '+'}</span>
              </button>
              {thinkingExpanded && (
                <pre className="px-3 pb-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#6E6480] max-h-40 overflow-y-auto">{cleanThinking(thinking).slice(-4000)}</pre>
              )}
            </div>
          )}

          {(() => {
            const saveCall = toolCalls.find((tc) => tc.tool === 'save_prd')
            const fileCalls = toolCalls.filter((tc) => tc.tool !== 'save_prd')
            return (
              <>
                {saveCall && (
                  <div className={`flex items-center gap-3 text-sm border rounded-xl px-4 py-3 ${saveCall.status === 'result' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${saveCall.status === 'result' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'}`}>
                      {saveCall.status === 'result' ? '✓' : '…'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${saveCall.status === 'result' ? 'text-emerald-700' : 'text-amber-700'}`}>{saveCall.status === 'result' ? 'PRD saved' : 'Saving PRD…'}</p>
                      <p className="text-xs text-[#6E6480] truncate">{saveCall.status === 'result' ? 'Ready to view' : 'Writing markdown via save_prd tool'}</p>
                    </div>
                  </div>
                )}
                {fileCalls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide">Files checked</p>
                    {fileCalls.map((tc, i) => {
                      const done = tc.status === 'result'
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs border border-[#EFEAFB] rounded-full px-3 py-1.5 bg-white">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'}`}>
                            {done ? '✓' : '…'}
                          </span>
                          <span className="font-medium text-[#251F33] truncate">{friendlyToolLabel(tc)}</span>
                          <span className="text-[#8A7FA6] truncate font-mono text-[11px]">{tc.args?.path || tc.args?.dir || ''}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}

          {content && (
            <div className="border border-[#E5DEFA] rounded-xl p-4 bg-white">
              <p className="text-[11px] font-semibold text-[#8A7FA6] uppercase tracking-wide mb-2 flex items-center gap-2">
                {status === 'streaming' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Drafting PRD…
                  </>
                ) : status === 'done' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    PRD draft
                  </>
                ) : (
                  'PRD draft'
                )}
              </p>
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#251F33]">
                {content}
                {status === 'streaming' && <span className="inline-block w-2 h-4 bg-[#7C5CFC] ml-0.5 animate-pulse align-middle" />}
              </pre>
            </div>
          )}

          {questions.length > 0 && (
            <div className="space-y-3 border border-[#D9CCFB] bg-[#FBFAFE] rounded-xl p-4">
              <p className="text-sm font-semibold text-[#251F33]">Clarify before generating</p>
              {questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm text-[#251F33]">{q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.choices.map((c, idx) => (
                      <button
                        key={idx}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: c }))}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${answers[q.id] === c ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]' : 'bg-white border-[#E5DEFA] hover:border-[#7C5CFC] text-[#251F33]'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {q.allowFreeText && (
                    <input
                      type="text"
                      placeholder="Or type your answer…"
                      value={answers[q.id] && !q.choices.includes(answers[q.id]) ? answers[q.id] : ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      className="w-full text-sm border border-[#E5DEFA] rounded-xl px-3 py-2 focus:outline-none focus:border-[#7C5CFC]"
                    />
                  )}
                  {answers[q.id] && <p className="text-xs text-emerald-600">Selected: {answers[q.id]}</p>}
                </div>
              ))}
              <button
                onClick={submitAnswers}
                disabled={questions.some((q) => !answers[q.id])}
                className="w-full mt-2 py-2 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white text-sm font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
          {status === 'done' && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">PRD saved ✓ — collapse and View PRD anytime.</div>}
          <div ref={bottomRef} />
        </div>
        {!atBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 right-6 bg-[#251F33] text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 hover:bg-black transition-colors"
          >
            ↓ Jump to bottom
          </button>
        )}

        <div className="p-4 border-t border-[#E5DEFA] flex gap-2 shrink-0">
          <button onClick={handleCancel} className="flex-1 py-2 rounded-xl border border-[#E5DEFA] text-sm font-medium text-[#6E6480] hover:bg-[#FBFAFE]">
            {status === 'done' ? 'Close' : 'Cancel'}
          </button>
          {status === 'done' && (
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[#251F33] text-white text-sm font-semibold">
              View PRD
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
