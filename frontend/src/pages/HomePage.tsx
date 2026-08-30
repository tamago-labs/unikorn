import { useState } from 'react'
import Navbar from '../components/Navbar'
import HowItWorks from '../components/HowItWorks'

interface RecentProject {
  folder: string
  date: string
  artifacts: string[]
}

const recentProjects: RecentProject[] = [
  { folder: './my-saas-app', date: '2h ago', artifacts: ['PRD', 'One-Pager', 'Tutorial'] },
  { folder: './mobile-api', date: 'Yesterday', artifacts: ['PRD', 'Tutorial'] },
]

export default function HomePage() {
  const [folder, setFolder] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const canGenerate = folder.trim().length > 0

  function handleGenerate() {
    if (!canGenerate) return
    console.log('[unikorn] generate', folder.trim())
    setToast('Scanning folder — PRD generation starting…')
    setTimeout(() => setToast(null), 2500)
  }

  function handleRecentClick(folder: string) {
    setFolder(folder)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-12">
        <div className="w-full max-w-xl">
          <h1
            data-testid="hero-title"
            className="text-center text-[2rem] sm:text-[2.4rem] font-extrabold leading-tight"
          >
            You shipped the product.
            <br />
            We&apos;ll ship the story.
          </h1>
          <p className="text-center text-[#6E6480] mt-2.5 text-[15px]">
            Your agent + Kane shipped it. Unikorn makes it a PRD, a slide deck, and a tutorial.
          </p>

          <div className="glow mt-8 border border-[#E5DEFA] bg-white rounded-3xl shadow-[0_8px_24px_-8px_rgba(124,92,252,0.18)] p-2.5 transition-shadow focus-within:border-[#7C5CFC] focus-within:shadow-[0_0_0_4px_rgba(124,92,252,0.14)]">
            <div className="flex items-center gap-2">
              <input
                data-testid="unikorn-input"
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Paste full folder path…"
                className="flex-1 bg-transparent text-[15px] py-2.5 px-1 placeholder:text-[#B0A8C2] focus:outline-none min-h-[44px]"
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
              />
              <button
                data-testid="generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="shrink-0 h-10 px-4 rounded-2xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold"
                type="button"
              >
                Generate
              </button>
            </div>
          </div>

          {recentProjects.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#6E6480] uppercase tracking-wide">Recent</p>
              {recentProjects.map((p) => (
                <button
                  key={p.folder}
                  onClick={() => handleRecentClick(p.folder)}
                  className="w-full flex items-center justify-between border border-[#E5DEFA] bg-white rounded-2xl px-4 py-3 hover:border-[#D9CCFB] hover:bg-[#FBFAFE] transition-colors text-left"
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F1ECFE] text-[#7C5CFC] flex items-center justify-center text-sm">
                      📁
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#251F33]">{p.folder}</p>
                      <p className="text-xs text-[#6E6480]">{p.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {p.artifacts.map((a) => (
                      <span key={a} className="text-[10px] font-medium text-[#7C5CFC] bg-[#F1ECFE] rounded-full px-2 py-0.5">
                        {a}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {toast && (
            <div className="mt-4 text-center text-sm text-[#7C5CFC] bg-[#F1ECFE] border border-[#D9CCFB] rounded-2xl px-4 py-2">
              {toast}
            </div>
          )}
        </div>

        <HowItWorks />
      </main>
    </div>
  )
}
