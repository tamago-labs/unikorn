import { useEffect, useState } from 'react'
import { fetchPrdContent } from '../api'

interface Props {
  open: boolean
  folder: string
  onClose: () => void
}

export default function PrdDrawer({ open, folder, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stripGenericTags = (text: string) =>
    text
      .replace(/<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>[\s\S]*?<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi, '')
      .replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file)\b[^>]*\/?>/gi, '')
      .trim()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetchPrdContent(folder)
      .then((r) => {
        const raw = r.content || ''
        const cleaned = stripGenericTags(raw)
        // if cleaned looks like valid PRD, use it; otherwise show cleaned with warning
        if (cleaned.length === 0 && raw.length > 0) {
          setError('PRD appears corrupted (only tool tags found). Please regenerate via Scan with AI.')
          setContent(null)
        } else {
          setContent(cleaned)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, folder])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-[#E5DEFA]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5DEFA] shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#251F33]">PRD</h2>
            <p className="text-xs text-[#8A7FA6] font-mono truncate max-w-[320px]">{folder}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => content && navigator.clipboard.writeText(content)}
              className="text-xs font-medium border border-[#E5DEFA] rounded-full px-3 py-1.5 hover:bg-[#F1ECFE] transition-colors"
            >
              Copy
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE]">
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-sm text-[#6E6480] flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-[#E5DEFA] border-t-[#7C5CFC] rounded-full animate-spin" />
              Loading PRD…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[#251F33] bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-4">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
