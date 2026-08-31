interface Props {
  fileCount: number
  framework: string | null
  truncated?: boolean
  loading?: boolean
  onScan: () => void
  aiConfigured?: boolean
  onConfigureAi?: () => void
}

export default function PrdEmptyState({ fileCount, framework, truncated, loading, onScan, aiConfigured = true, onConfigureAi }: Props) {
  if (loading) {
    return (
      <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6 flex items-center gap-4 animate-pulse">
        <div className="w-11 h-11 rounded-xl bg-[#F1ECFE] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-[#F1ECFE] rounded" />
          <div className="h-3 w-64 bg-[#FBFAFE] rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-dashed border-[#D9CCFB] rounded-2xl p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-[#F1ECFE] flex items-center justify-center shrink-0 text-[#7C5CFC]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#251F33]">No PRD yet — scan to generate</p>
          <p className="text-xs text-[#8A7FA6] mt-0.5">
            {fileCount.toLocaleString()} files{truncated ? '+' : ''} {framework ? `· ${framework}` : ''} · AI will read key files and draft a Kane-compatible PRD
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!aiConfigured && (
          <button
            onClick={onConfigureAi}
            className="text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 rounded-full px-3.5 py-1.5 hover:bg-amber-100 transition-colors"
          >
            Configure AI
          </button>
        )}
        <button
          onClick={onScan}
          disabled={!aiConfigured}
          className="text-xs font-semibold bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white rounded-full px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Scan with AI
        </button>
      </div>
    </div>
  )
}
