import { useState } from 'react'

interface PipelineStep {
  id: string
  name: string
  description: string
  icon: string
  status: 'locked' | 'ready' | 'active' | 'done'
}

const pipeline: PipelineStep[] = [
  { id: 'prd', name: 'PRD', description: 'Draft from source code', icon: '📋', status: 'ready' },
  { id: 'test', name: 'Verify', description: 'Auto-test + screenshots', icon: '🧪', status: 'locked' },
  { id: 'tutorial', name: 'Tutorial', description: 'Step-by-step walkthrough', icon: '📖', status: 'locked' },
  { id: 'slides', name: 'Slides', description: 'Pitch deck & one-pager', icon: '📊', status: 'locked' },
  { id: 'marketing', name: 'Marketing', description: 'Landing page copy', icon: '📣', status: 'locked' },
]

export default function DesignApp() {
  const [steps, setSteps] = useState<PipelineStep[]>(pipeline)
  const [selected, setSelected] = useState<string>('prd')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activeStep = steps.find((s) => s.id === selected)!

  function handleGenerate(id: string) {
    setDrawerOpen(true)
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'active' } : s))
    )
    setTimeout(() => {
      setSteps((prev) =>
        prev.map((s, i) =>
          s.id === id
            ? { ...s, status: 'done' }
            : i > prev.findIndex((p) => p.id === id) && s.status === 'locked'
            ? { ...s, status: 'ready' }
            : s
        )
      )
    }, 3000)
  }

  return (
    <div className="h-screen flex flex-col bg-[#F8F7FC] overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-[#E5DEFA] bg-white flex items-center justify-between px-5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-[#251F33]">Unikorn Studio</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              AI Ready
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Kane Ready
            </span>
          </div>
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
        {/* Sidebar — Pipeline */}
        <aside className="w-64 shrink-0 border-r border-[#E5DEFA] bg-white flex flex-col">
          <div className="p-4 border-b border-[#E5DEFA]">
            <h2 className="text-xs font-semibold text-[#6E6480] uppercase tracking-wide">Pipeline</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => step.status !== 'locked' && setSelected(step.id)}
                disabled={step.status === 'locked'}
                className={`w-full text-left rounded-xl p-3 transition-all ${
                  selected === step.id
                    ? 'bg-[#F8F6FF] ring-2 ring-[#7C5CFC]'
                    : step.status === 'locked'
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-[#FBFAFE]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-lg bg-[#F1ECFE] flex items-center justify-center text-base">
                      {step.icon}
                    </div>
                    {step.status === 'done' && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </div>
                    )}
                    {step.status === 'active' && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#7C5CFC] flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#251F33]">{step.name}</p>
                    <p className="text-[11px] text-[#6E6480]">{step.description}</p>
                  </div>
                </div>
                {step.status === 'ready' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerate(step.id) }}
                    className="mt-2 w-full text-[11px] font-semibold text-white bg-[#7C5CFC] rounded-lg py-1.5 hover:opacity-90 transition-opacity"
                  >
                    Generate
                  </button>
                )}
                {i < steps.length - 1 && (
                  <div className="absolute left-[2.05rem] mt-1 w-0.5 h-2 bg-[#E5DEFA]" />
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-10 flex items-start justify-center">
            <div className="w-full max-w-3xl">
              {activeStep.status === 'done' ? (
                <div className="bg-white rounded-2xl border border-[#E5DEFA] shadow-[0_4px_16px_-4px_rgba(124,92,252,0.1)] overflow-hidden">
                  <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-lg">{activeStep.icon}</div>
                      <div>
                        <h3 className="text-lg font-bold text-[#251F33]">{activeStep.name}</h3>
                        <p className="text-xs text-[#6E6480]">{activeStep.description}</p>
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
              ) : activeStep.status === 'active' ? (
                <div className="bg-white rounded-2xl border border-[#E5DEFA] h-96 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-[#7C5CFC] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-[#6E6480] mt-3">Generating {activeStep.name}…</p>
                  </div>
                </div>
              ) : activeStep.status === 'locked' ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-[#E5DEFA] h-96 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl mb-2 opacity-20">{activeStep.icon}</div>
                    <p className="text-sm text-[#6E6480]">Complete previous step to unlock</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border-2 border-dashed border-[#E5DEFA] h-96 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl mb-2 opacity-20">{activeStep.icon}</div>
                    <p className="text-sm text-[#6E6480]">Click Generate to start</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* AI Drawer — only rendered when open */}
        {drawerOpen && (
          <aside className="w-96 shrink-0 border-l border-[#E5DEFA] bg-white flex flex-col animate-in slide-in-from-right duration-300">
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
              <div className="flex justify-start">
                <div className="bg-[#F1ECFE] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-[#251F33] max-w-[85%]">
                  Analyzing your codebase to build the PRD. This will take a moment…
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-[#F1ECFE] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFC] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
