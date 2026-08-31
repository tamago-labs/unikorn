import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import HowItWorks from '../components/HowItWorks'
import { fetchWorkingFolder } from '../api'

interface RecentProject {
  folder: string
  date: string
  artifacts: string[]
}

export default function HomePage() {
  const [folder, setFolder] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  useEffect(() => {
    fetchWorkingFolder().then((r) => setFolder(r.folder)).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/recent')
      .then((r) => r.json())
      .then((j) => setRecentProjects(j.projects || []))
      .catch(() => setRecentProjects([]))
      .finally(() => setRecentLoading(false))
  }, [])

  const canGenerate = folder.trim().length > 0

  const navigate = useNavigate()

  function handleGenerate() {
    if (!canGenerate) return
    navigate(`/design?folder=${encodeURIComponent(folder.trim())}`)
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
            Your agent + Kane AI made the product. Unikorn turns it into the PRD, tutorial, pitch deck, and everything needed to explain what you shipped.
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
                className="shrink-0 h-10 px-3 rounded-2xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold"
                type="button"
              >
                Next
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {recentLoading ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#6E6480] uppercase tracking-wide">Recent</p>
              <div className="w-full border border-[#E5DEFA] bg-white rounded-2xl px-4 py-3 animate-pulse">
                <div className="h-4 w-32 bg-[#F1ECFE] rounded" />
              </div>
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#6E6480] uppercase tracking-wide">Recent</p>
              {recentProjects.map((p) => (
                <button
                  key={p.folder}
                  onClick={() => handleRecentClick(p.folder)}
                  className="w-full flex items-center border border-[#E5DEFA] bg-white rounded-2xl px-4 py-3 hover:border-[#D9CCFB] hover:bg-[#FBFAFE] transition-colors text-left"
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
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 text-center text-xs text-[#8A7FA6]">No recent projects — paste a folder above to start</div>
          )}

          {toast && (
            <div className="mt-4 text-center text-sm text-[#7C5CFC] bg-[#F1ECFE] border border-[#D9CCFB] rounded-2xl px-4 py-2">
              {toast}
            </div>
          )}
        </div>

        <HowItWorks />
        <WhatYouGet />
        <WhyKane />
        <CtaNpx />
      </main>
      <footer className="max-w-5xl mx-auto w-full px-6 py-6 flex items-center justify-between text-xs text-[#8A7FA6] border-t border-[#EFEAFB]">
        <span>© {new Date().getFullYear()} Tamago Labs</span>
        <span className="flex items-center gap-3">
          <a href="https://github.com/tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="hover:text-[#251F33]">GitHub</a>
          <span>·</span>
          <a href="https://www.npmjs.com/package/@tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="hover:text-[#251F33]">npm</a>
          <span>·</span>
          <span>Apache-2.0</span>
        </span>
      </footer>
    </div>
  )
}

function WhatYouGet() {
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <h2 className="text-center text-2xl font-extrabold">What you get</h2>
      <p className="text-center text-sm text-[#6E6480] mt-2 max-w-2xl mx-auto">From a cited PRD to verified proof and shareable tutorials and decks — everything is grounded in what your product actually does.</p>
      <div className="mt-8 max-w-3xl mx-auto">
        <div className="bg-white border border-[#E5DEFA] rounded-2xl overflow-hidden">
          <div className="relative h-[200px] sm:h-[420px] overflow-hidden bg-[#FBFAFE]">
            <iframe
              title="Tutorial preview"
              src="/sample-tutorial/slide-01.html"
              className="absolute top-0 left-0 w-[1024px] h-[560px] border-0 pointer-events-none scale-[0.35] sm:scale-[0.75] origin-top-left"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div className="px-4 py-2 bg-white border-t border-[#E5DEFA] text-center text-[11px] text-[#8A7FA6]">
            Tutorial generated by Unikorn, verified with Kane, and captured from real product behavior.
          </div>
        </div>
      </div>
    </section>
  )
}

function WhyKane() {
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <div className="grid lg:grid-cols-[1.4fr_0.9fr] gap-6 lg:gap-8 items-start">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#7C5CFC] uppercase">Powered by Kane CLI</p>
          <h2 className="text-2xl font-extrabold mt-2">Real browser proof behind every story</h2>
          <p className="text-sm text-[#6E6480] mt-3 leading-relaxed">
            Kane gives Unikorn a way to go beyond reading code. It tests the product in a real browser, captures what actually happens, and turns verified behavior into evidence Unikorn can build from.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div>
              <p className="text-sm font-bold text-[#251F33]">Real browser</p>
              <p className="text-xs text-[#6E6480] mt-1">Not mocked behavior or assumptions.</p>
            </div>
            <div>
              <p className="text-sm font-bold text-[#251F33]">Captured evidence</p>
              <p className="text-xs text-[#6E6480] mt-1">Screenshots and run data from the product itself.</p>
            </div>
            <div>
              <p className="text-sm font-bold text-[#251F33]">Designed × proven</p>
              <p className="text-xs text-[#6E6480] mt-1">See what was tested and what actually passed.</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-[#E5DEFA] rounded-2xl p-5">
          <p className="text-xs font-bold tracking-wide text-[#7C5CFC]">EXAMPLE PRD — CALCULATOR APP</p>
          <p className="text-[11px] text-[#8A7FA6] mt-1">UC-1 Basic Arithmetic Operations — every claim cited</p>
          <div className="mt-3 bg-[#FBFAFE] border border-[#E5DEFA] rounded-xl p-3 font-mono text-[11px] leading-relaxed">
            <p className="font-bold text-[#251F33]">### UC-1: Basic Arithmetic Operations</p>
            <p className="mt-2 text-[#6E6480]">- AC-1.1 Given clicks 0-9 then digits appear <span className="text-[#7C5CFC]">[src: useCalculator.ts]</span></p>
            <p className="text-[#6E6480]">- AC-1.2 … operator highlighted <span className="text-[#7C5CFC]">[src: Button.tsx]</span></p>
            <p className="text-[#6E6480]">- AC-1.3 … equals shows result <span className="text-[#7C5CFC]">[src: calculate.ts]</span></p>
            <p className="text-[#6E6480]">- AC-1.4 … prevents repeated calc <span className="text-[#7C5CFC]">[src: useCalculator.ts]</span></p>
          </div>
          <p className="text-[11px] text-[#8A7FA6] mt-3">Every line ends with <span className="font-mono text-xs bg-[#F1ECFE] px-1 rounded">[src: path]</span> — Kane verifies each in a real browser.</p>
        </div>
      </div>
    </section>
  )
}

function CtaNpx() {
  const [copied, setCopied] = useState(false)
  const cmd = 'npx @tamago-labs/unikorn'
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-16">
      <div className="bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] rounded-3xl p-6 sm:p-8 text-white">
        <h2 className="text-2xl font-extrabold">Your product is built. Now ship the story.</h2>
        <p className="text-sm text-white/80 mt-2">Run Unikorn on your codebase and turn working software into a verified PRD, tutorials, decks, and more.</p>
        <div className="mt-6 flex items-center gap-3 bg-black/20 rounded-2xl p-2 pl-4">
          <code className="flex-1 font-mono text-sm">{cmd}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="shrink-0 bg-white text-[#7C5CFC] text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/90"
            type="button"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </section>
  )
}
