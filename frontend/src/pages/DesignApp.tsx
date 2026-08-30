import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface Artifact {
  id: string
  name: string
  description: string
  icon: string
  color: string
  status: 'ready' | 'generating' | 'idle'
  thumbnail?: string
}

interface QA {
  question: string
  options: string[]
}

interface ChatMessage {
  role: 'ai' | 'user'
  text: string
  options?: string[]
  selected?: string
}

const artifacts: Artifact[] = [
  { id: 'prd', name: 'PRD', description: 'Product Requirements Document', icon: '📋', color: '#7C5CFC', status: 'idle' },
  { id: 'slides', name: 'Slides', description: 'Pitch deck & one-pager', icon: '📊', color: '#9B7CFF', status: 'idle' },
  { id: 'tutorial', name: 'Tutorial', description: 'Step-by-step walkthrough', icon: '📖', color: '#6E6480', status: 'idle' },
]

const mockQA: Record<string, QA[]> = {
  prd: [
    { question: 'What is the primary goal of this product?', options: ['Solve a specific pain point', 'Enter a new market', 'Improve existing workflow', 'Explore new technology'] },
    { question: 'Who is your target user?', options: ['Developers', 'Small businesses', 'Enterprise teams', 'General consumers'] },
    { question: 'What stage is the product in?', options: ['Idea / MVP', 'Early traction', 'Growth mode', 'Mature / optimizing'] },
  ],
  slides: [
    { question: 'What is the main purpose of the deck?', options: ['Fundraising', 'Sales pitch', 'Conference talk', 'Internal update'] },
    { question: 'How long should the presentation be?', options: ['1-2 min (elevator)', '5-10 min (standard)', '15-20 min (deep dive)', '30+ min (workshop)'] },
  ],
  tutorial: [
    { question: 'Who is the audience for this tutorial?', options: ['Complete beginners', 'Intermediate users', 'Advanced developers', 'Mixed levels'] },
    { question: 'What format works best?', options: ['Written guide', 'Video walkthrough', 'Interactive demo', 'Code-along project'] },
  ],
}

export default function DesignApp() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string>('prd')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'asking' | 'done'>('idle')
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [currentQA, setCurrentQA] = useState<QA | null>(null)
  const [qaIndex, setQaIndex] = useState(0)
  const [artifactStatuses, setArtifactStatuses] = useState<Record<string, Artifact['status']>>({
    prd: 'idle', slides: 'idle', tutorial: 'idle',
  })
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, aiStatus])

  function startGeneration(id: string) {
    setSelected(id)
    setDrawerOpen(true)
    setAiStatus('thinking')
    setChat([{ role: 'ai', text: `I'm analyzing your codebase to build the ${artifacts.find(a => a.id === id)?.name}. Let me ask a few questions first…` }])
    setQaIndex(0)

    setTimeout(() => {
      const questions = mockQA[id]
      if (questions && questions.length > 0) {
        setCurrentQA(questions[0])
        setAiStatus('asking')
      }
    }, 1500)
  }

  function handleSelectOption(option: string) {
    if (!currentQA) return
    setChat((prev) => [...prev, { role: 'user', text: option }])
    setCurrentQA(null)
    setAiStatus('thinking')

    const questions = mockQA[selected]
    const nextIndex = qaIndex + 1

    setTimeout(() => {
      if (questions && nextIndex < questions.length) {
        setCurrentQA(questions[nextIndex])
        setQaIndex(nextIndex)
        setAiStatus('asking')
      } else {
        setAiStatus('done')
        setChat((prev) => [...prev, { role: 'ai', text: 'All set! Generating your artifact now…' }])
        setArtifactStatuses((prev) => ({ ...prev, [selected]: 'generating' }))
        setTimeout(() => {
          setArtifactStatuses((prev) => ({ ...prev, [selected]: 'ready' }))
          setChat((prev) => [...prev, { role: 'ai', text: 'Done! Your artifact is ready on the canvas.' }])
        }, 2000)
      }
    }, 1200)
  }

  const current = artifacts.find((a) => a.id === selected)!
  const status = artifactStatuses[selected]

  return (
    <div className="h-screen flex flex-col bg-[#F8F7FC] overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-[#E5DEFA] bg-white flex items-center justify-between px-5 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-lg hover:bg-[#F1ECFE] flex items-center justify-center transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[#251F33]">Unikorn Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 rounded-lg border border-[#E5DEFA] text-xs font-semibold text-[#6E6480] hover:bg-[#FBFAFE] transition-colors">
            Export
          </button>
          <button className="h-8 px-3 rounded-lg bg-[#7C5CFC] text-xs font-semibold text-white hover:opacity-90 transition-opacity">
            Publish
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-[#E5DEFA] bg-white flex flex-col">
          <div className="p-4 border-b border-[#E5DEFA]">
            <h2 className="text-xs font-semibold text-[#6E6480] uppercase tracking-wide">Artifacts</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {artifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`w-full text-left rounded-2xl p-3.5 border-2 transition-all ${
                  selected === a.id
                    ? 'border-[#7C5CFC] bg-[#F8F6FF] shadow-[0_2px_8px_-2px_rgba(124,92,252,0.2)]'
                    : 'border-[#E5DEFA] bg-white hover:border-[#D9CCFB] hover:bg-[#FBFAFE]'
                }`}
              >
                {/* Thumbnail */}
                <div
                  className="w-full h-24 rounded-xl mb-2.5 flex items-center justify-center text-2xl"
                  style={{ backgroundColor: a.color + '14' }}
                >
                  {a.icon}
                </div>
                <p className="text-sm font-semibold text-[#251F33]">{a.name}</p>
                <p className="text-[11px] text-[#6E6480] mt-0.5">{a.description}</p>
                <div className="mt-2">
                  {artifactStatuses[a.id] === 'ready' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ready
                    </span>
                  )}
                  {artifactStatuses[a.id] === 'generating' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#7C5CFC] bg-[#F1ECFE] rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-pulse" />
                      Generating
                    </span>
                  )}
                  {artifactStatuses[a.id] === 'idle' && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-[#7C5CFC] rounded-full px-2.5 py-0.5 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); startGeneration(a.id) }}
                    >
                      Generate
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-8 flex items-start justify-center">
            <div className="w-full max-w-3xl">
              {status === 'ready' ? (
                <div className="bg-white rounded-2xl border border-[#E5DEFA] shadow-[0_4px_16px_-4px_rgba(124,92,252,0.1)] overflow-hidden">
                  <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-lg">{current.icon}</div>
                      <div>
                        <h3 className="text-lg font-bold text-[#251F33]">{current.name}</h3>
                        <p className="text-xs text-[#6E6480]">{current.description}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 bg-[#F1ECFE] rounded-full w-full" />
                      <div className="h-4 bg-[#F1ECFE] rounded-full w-4/5" />
                      <div className="h-4 bg-[#F1ECFE] rounded-full w-3/5" />
                      <div className="h-3 bg-[#E5DEFA] rounded-full w-full mt-5" />
                      <div className="h-3 bg-[#E5DEFA] rounded-full w-5/6" />
                      <div className="h-3 bg-[#E5DEFA] rounded-full w-2/3" />
                    </div>
                  </div>
                </div>
              ) : status === 'generating' ? (
                <div className="bg-white rounded-2xl border border-[#E5DEFA] h-80 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-[#7C5CFC] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-[#6E6480] mt-3">Generating {current.name}…</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border-2 border-dashed border-[#E5DEFA] h-80 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-3 opacity-30">{current.icon}</div>
                    <p className="text-sm text-[#6E6480]">Select an artifact and click Generate</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* AI Drawer */}
        <aside
          className={`w-96 shrink-0 border-l border-[#E5DEFA] bg-white flex flex-col transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ marginRight: drawerOpen ? 0 : -384 }}
        >
          <div className="h-14 border-b border-[#E5DEFA] flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#7C5CFC] flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <span className="text-sm font-semibold text-[#251F33]">Assistant</span>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="w-7 h-7 rounded-md hover:bg-[#F1ECFE] flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6480" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chat.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#7C5CFC] text-white rounded-br-md'
                      : 'bg-[#F1ECFE] text-[#251F33] rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {aiStatus === 'thinking' && (
              <div className="flex justify-start">
                <div className="bg-[#F1ECFE] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {aiStatus === 'asking' && currentQA && (
              <div className="pt-1">
                <div className="flex flex-wrap gap-2">
                  {currentQA.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSelectOption(opt)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#D9CCFB] bg-white text-[#251F33] hover:bg-[#7C5CFC] hover:text-white hover:border-[#7C5CFC] transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </aside>
      </div>
    </div>
  )
}
