interface VerifiedCardProps {
  claimsProved: number
  totalClaims: number
  source: string
  runId: string
  onView?: () => void
}

export default function VerifiedCard({ claimsProved, totalClaims, source, runId, onView }: VerifiedCardProps) {
  const percent = Math.round((claimsProved / totalClaims) * 100)

  return (
    <div className="bg-white border border-[#EFEAFB] rounded-2xl p-5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-[#EAFBF1] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.3">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold">PRD verified — {claimsProved} of {totalClaims} claims proved</p>
          <p className="text-xs text-[#8A7FA6] mt-0.5 font-mono">source: {source} · kane-cli run #{runId}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full border-4 border-[#22C55E] flex items-center justify-center text-[11px] font-bold">
          {percent}%
        </div>
        <button
          onClick={onView}
          className="text-xs font-medium border border-[#E5DEFA] rounded-full px-3.5 py-1.5 hover:bg-[#F1ECFE] transition-colors"
        >
          View PRD
        </button>
      </div>
    </div>
  )
}
