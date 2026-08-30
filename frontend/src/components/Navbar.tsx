import { useState, useEffect, useCallback } from 'react'
import { fetchKaneStatus, fetchAiStatus, type KaneStatus, type AiStatus } from '../api'
import KaneStatusModal from './KaneStatusModal'
import SettingsModal from './SettingsModal'

export default function Navbar() {
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
      <header className="max-w-5xl mx-auto w-full px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF]"
            aria-hidden
            style={{ filter: 'drop-shadow(0 1px 4px rgba(124,92,252,0.25))' }}
          />
          <span className="font-bold text-[15px]">Unikorn</span>
        </div>
        <nav className="hidden sm:flex items-center gap-4 text-sm text-[#6E6480]">
          <a href="#how-it-works" className="hover:text-[#251F33]">
            How it works
          </a>
          <a href="https://github.com/tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="hover:text-[#251F33] flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
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
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl border border-[#E5DEFA] hover:border-[#D9CCFB] hover:bg-[#FBFAFE] transition-colors text-[#6E6480] hover:text-[#251F33]"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68 1.65 1.65 0 0010 3.17V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </nav>
      </header>

      {kaneModalOpen && <KaneStatusModal kane={kane} onClose={() => setKaneModalOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
