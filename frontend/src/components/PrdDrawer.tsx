import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
      <div className="relative w-full max-w-3xl bg-white shadow-2xl flex flex-col h-full border-l border-[#E5DEFA]">
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
        <div className="flex-1 overflow-y-auto p-6 bg-[#FBFAFE]">
          {loading ? (
            <div className="text-sm text-[#6E6480] flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-[#E5DEFA] border-t-[#7C5CFC] rounded-full animate-spin" />
              Loading PRD…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
          ) : (
            <div className="bg-white border border-[#E5DEFA] rounded-xl p-6">
              <div className="prose prose-sm max-w-none prose-headings:text-[#251F33] prose-h1:text-xl prose-h1:font-bold prose-h1:mb-3 prose-h2:text-base prose-h2:font-bold prose-h2:mt-6 prose-h2:mb-2 prose-h3:text-sm prose-h3:font-bold prose-p:text-sm prose-p:text-[#251F33] prose-li:text-sm prose-blockquote:border-l-2 prose-blockquote:border-[#7C5CFC] prose-blockquote:bg-[#FBFAFE] prose-blockquote:px-3 prose-blockquote:py-2 prose-code:text-xs prose-code:bg-[#F1ECFE] prose-code:text-[#7C5CFC]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-xl font-bold text-[#251F33] mb-3 mt-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-[#251F33] mt-6 mb-2 pb-1 border-b border-[#EFEAFB]">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold text-[#7C5CFC] mt-4 mb-1">{children}</h3>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-[#7C5CFC] bg-[#FBFAFE] px-3 py-2 my-3 text-sm text-[#6E6480] rounded-r-lg">{children}</blockquote>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                    li: ({ children }) => <li className="text-sm text-[#251F33] leading-relaxed">{children}</li>,
                    code: ({ children }) => <code className="text-xs bg-[#F1ECFE] text-[#7C5CFC] px-1 py-0.5 rounded font-mono">{children}</code>,
                    strong: ({ children }) => <strong className="font-bold text-[#251F33]">{children}</strong>,
                    p: ({ children }) => <p className="text-sm text-[#251F33] leading-relaxed my-2">{children}</p>,
                  }}
                >
                  {content || ''}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
