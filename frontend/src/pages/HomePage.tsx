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
        <HowItDiffers />
        <CtaNpx />
      </main>
    </div>
  )
}

function WhatYouGet() {
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <h2 className="text-center text-2xl font-extrabold">What you get</h2>
      <p className="text-center text-sm text-[#6E6480] mt-2">Self-contained HTML — no build, no hosting. Every claim traces to real code.</p>
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        <div className="bg-white border border-[#E5DEFA] rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-sm">📄</div>
          <h3 className="font-bold text-sm mt-3">PRD — cited</h3>
          <p className="text-sm text-[#6E6480] mt-1.5 leading-relaxed">Overview, Users, Use Cases with Given/When/Then. Every line ends with <span className="font-mono text-xs bg-[#F1ECFE] px-1 rounded">[src: path]</span>.</p>
        </div>
        <div className="bg-white border border-[#E5DEFA] rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-sm">📚</div>
          <h3 className="font-bold text-sm mt-3">Tutorial</h3>
          <p className="text-sm text-[#6E6480] mt-1.5 leading-relaxed">Step per use-case, screenshots inlined as base64. One HTML per step, nav built-in.</p>
        </div>
        <div className="bg-white border border-[#E5DEFA] rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-sm">🎨</div>
          <h3 className="font-bold text-sm mt-3">Slide Deck</h3>
          <p className="text-sm text-[#6E6480] mt-1.5 leading-relaxed">Pitch / demo walkthrough. Tailwind + Manrope, fully offline. Your design prompt honored verbatim.</p>
        </div>
      </div>
    </section>
  )
}

function WhyKane() {
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <h2 className="text-center text-2xl font-extrabold">Why Kane?</h2>
      <p className="text-center text-sm text-[#6E6480] mt-2">AI drafts. Kane proves. You ship the story.</p>
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        <div className="bg-[#FBFAFE] border border-[#E5DEFA] rounded-2xl p-5">
          <p className="text-xs font-bold tracking-wide text-[#7C5CFC]">01 — AI DRAFTS</p>
          <h3 className="font-bold text-sm mt-2">Inventory → PRD</h3>
          <p className="text-sm text-[#6E6480] mt-1.5">Framework, routes, ports, auth hints fed to any OpenAI-compatible API. Clarifying questions pause the stream.</p>
        </div>
        <div className="bg-white border border-[#7C5CFC]/20 rounded-2xl p-5 shadow-[0_8px_24px_-8px_rgba(124,92,252,0.18)]">
          <p className="text-xs font-bold tracking-wide text-[#7C5CFC]">02 — KANE PROVES</p>
          <h3 className="font-bold text-sm mt-2">Real browser, real proof</h3>
          <p className="text-sm text-[#6E6480] mt-1.5"><span className="font-mono text-xs">context ingest → review → design tests → testmd run</span> with screenshots, logs, <span className="font-mono text-xs">final_state</span>.</p>
        </div>
        <div className="bg-[#FBFAFE] border border-[#E5DEFA] rounded-2xl p-5">
          <p className="text-xs font-bold tracking-wide text-[#7C5CFC]">03 — YOU SHIP</p>
          <h3 className="font-bold text-sm mt-2">Verified badges quote reality</h3>
          <p className="text-sm text-[#6E6480] mt-1.5">Every ✓ verified badge quotes a value a run observed. Footer: <span className="font-mono text-xs">Verified by Kane · N/M checks passed</span>.</p>
        </div>
      </div>
    </section>
  )
}

function HowItDiffers() {
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <h2 className="text-center text-2xl font-extrabold">How it differs</h2>
      <p className="text-center text-sm text-[#6E6480] mt-2">Don’t guess. Prove.</p>
      <div className="mt-8 overflow-hidden border border-[#E5DEFA] rounded-2xl bg-white">
        <div className="grid grid-cols-4 text-xs font-bold tracking-wide">
          <div className="p-3 text-[#8A7FA6]"></div>
          <div className="p-3 text-center text-[#6E6480]">Manual PRD</div>
          <div className="p-3 text-center text-[#6E6480]">AI-only</div>
          <div className="p-3 text-center bg-[#F1ECFE] text-[#7C5CFC] rounded-tr-2xl">Unikorn</div>
        </div>
        {[
          ['PRD source', 'Hand-written', 'Guessed', 'Grounded in code scan [src: path]'],
          ['Verification', '—', '—', 'Kane real browser tests'],
          ['Evidence', '—', '—', 'Screenshots + logs, cover gaps'],
          ['Output', 'Doc', 'Doc', 'Tutorial + deck, self-contained HTML'],
        ].map(([feat, a, b, c]) => (
          <div key={feat} className="grid grid-cols-4 text-sm border-t border-[#E5DEFA]">
            <div className="p-3 font-semibold bg-[#FBFAFE]">{feat}</div>
            <div className="p-3 text-center text-[#6E6480]">{a}</div>
            <div className="p-3 text-center text-[#6E6480]">{b}</div>
            <div className="p-3 text-center font-semibold bg-[#F1ECFE]/40">{c}</div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-[#8A7FA6] mt-3">Every claim traces back to real code. Every verified badge quotes a real run.</p>
    </section>
  )
}

function CtaNpx() {
  const [copied, setCopied] = useState(false)
  const cmd = 'npx @tamago-labs/unikorn'
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-16">
      <div className="bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] rounded-3xl p-6 sm:p-8 text-white">
        <h2 className="text-2xl font-extrabold">Run it locally</h2>
        <p className="text-sm text-white/80 mt-2">No cloud. Your code stays on your machine. Then open http://localhost:3001</p>
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
        <div className="flex flex-wrap gap-3 mt-4 text-xs">
          <a href="https://www.npmjs.com/package/@tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full">npm → @tamago-labs/unikorn</a>
          <a href="https://github.com/tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full">GitHub → tamago-labs/unikorn</a>
          <span className="bg-white/10 px-3 py-1.5 rounded-full">Node ≥18 · kane-cli ≥0.6.1</span>
        </div>
      </div>
    </section>
  )
}
