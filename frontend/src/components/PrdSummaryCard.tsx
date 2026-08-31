interface Props {
  title: string
  overview: string
  ucCount: number
  acCount: number
  startUrl: string | null
  hasAuth: boolean
  source: string
  updatedAt: string | null
  onView: () => void
  onVerify?: () => void
}

export default function PrdSummaryCard({ title, overview, ucCount, acCount, startUrl, hasAuth, source, updatedAt, onView, onVerify }: Props) {
  return (
    <div className="bg-white border border-[#EFEAFB] rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#EAFBF1] flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.3">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#251F33] truncate">{title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] font-medium bg-[#F1ECFE] text-[#7C5CFC] rounded-full px-2 py-0.5">{ucCount} UCs</span>
              <span className="text-[11px] font-medium bg-[#F1ECFE] text-[#7C5CFC] rounded-full px-2 py-0.5">{acCount} ACs</span>
              {startUrl && <span className="text-[11px] font-mono bg-[#FBFAFE] border border-[#E5DEFA] text-[#6E6480] rounded-full px-2 py-0.5">{startUrl}</span>}
            </div>
            <p className="text-[11px] text-[#8A7FA6] mt-2 font-mono truncate">source: {source}{updatedAt ? ` · ${new Date(updatedAt).toLocaleDateString()}` : ''} · Run: npm run dev</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Progress ring prepared for testing phase — hidden until kane test runs */}
          <div className="hidden w-12 h-12 rounded-full border-4 border-[#EFEAFB] flex-col items-center justify-center bg-white">
            <span className="text-xs font-bold text-[#7C5CFC] leading-none">0%</span>
            <span className="text-[8px] text-[#8A7FA6]">tested</span>
          </div>
          {onVerify && (
            <button
              onClick={onVerify}
              className="text-xs font-bold bg-[#7C5CFC] text-white rounded-full px-4 py-1.5 hover:opacity-90 transition-opacity"
            >
              Verify with Kane →
            </button>
          )}
          <button
            onClick={onView}
            className="text-xs font-medium border border-[#E5DEFA] rounded-full px-4 py-1.5 hover:bg-[#F1ECFE] transition-colors"
          >
            View PRD
          </button>
        </div>
      </div>
    </div>
  )
}

export function parsePrdMarkdown(md: string) {
  const titleMatch = md.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : 'PRD'
  // Overview is after ## 1. Overview until next ##
  const overviewMatch = md.match(/##\s*1\.\s*Overview\s*\n+([\s\S]*?)\n+##\s/m)
  let overview = ''
  if (overviewMatch) {
    overview = overviewMatch[1].replace(/\[src:[^\]]+\]/g, '').replace(/\n+/g, ' ').trim()
    if (overview.length > 180) overview = overview.slice(0, 180) + '…'
  } else {
    // fallback: first blockquote
    const bq = md.match(/^>\s*(.+)$/m)
    if (bq) overview = bq[1].trim()
  }
  const ucCount = (md.match(/^###\s+UC-/gm) || []).length
  const acCount = (md.match(/^\s*-\s+\*\*AC-/gm) || []).length
  const envMatch = md.match(/##\s*6\.\s*Environment[\s\S]*?Start URL:\s*([^\n]+)/i)
  const startUrl = envMatch ? envMatch[1].replace(/\[src:[^\]]+\]/g, '').trim().split(' ')[0] : null
  const hasAuth = /Auth:\s*.*yes|required|login/i.test(md) && !/Auth:\s*None/i.test(md)
  return { title, overview, ucCount, acCount, startUrl, hasAuth }
}
