import { useState, useEffect, useCallback } from 'react'
import { fetchKaneStatus, fetchAiStatus, type KaneStatus, type AiStatus } from '../api'
import KaneStatusModal from './KaneStatusModal'
import SettingsModal from './SettingsModal'

interface StatusBadgesProps {
  onSettingsClick?: () => void
}

export default function StatusBadges({ onSettingsClick }: StatusBadgesProps) {
  const [kane, setKane] = useState<KaneStatus | null>(null)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [kaneModalOpen, setKaneModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const refresh = useCallback(() => {
    fetchKaneStatus().then(setKane).catch(() => setKane(null))
    fetchAiStatus().then(setAi).catch(() => setAi(null))
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setKaneModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5DEFA] hover:border-[#D9CCFB] hover:bg-[#FBFAFE] transition-colors text-xs font-medium"
          title="Kane CLI status"
        >
          <span className={`w-2 h-2 rounded-full ${kane?.authenticated ? 'bg-emerald-400' : kane?.available ? 'bg-amber-400' : 'bg-red-400'}`} />
          <span>Kane</span>
        </button>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5DEFA] text-xs font-medium"
          title={ai?.configured ? `AI: ${ai.baseUrl}` : 'AI not configured'}
        >
          <span className={`w-2 h-2 rounded-full ${ai?.configured ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span>AI</span>
        </div>
        <button
          onClick={() => { onSettingsClick?.(); setSettingsOpen(true) }}
          className="p-2 rounded-xl border border-[#E5DEFA] hover:border-[#D9CCFB] hover:bg-[#FBFAFE] transition-colors text-[#6E6480] hover:text-[#251F33]"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68 1.65 1.65 0 0010 3.17V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>

      {kaneModalOpen && <KaneStatusModal kane={kane} onClose={() => setKaneModalOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
