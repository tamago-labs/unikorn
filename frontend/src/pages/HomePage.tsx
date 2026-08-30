import { useRef, useState } from 'react'

export default function HomePage() {
  const [value, setValue] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canGenerate = value.trim().length > 0 || !!fileName

  function handleGenerate() {
    if (!canGenerate) return
    const payload = fileName ? `${fileName} — ${value.trim()}` : value.trim()
    console.log('[unikorn] generate', payload)
    setToast('Coming soon — scanner in next step')
    setTimeout(() => setToast(null), 2500)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  function handleChip(text: string) {
    setValue(text)
    textareaRef.current?.focus()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFileName(f.name)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-5xl mx-auto w-full px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF]" aria-hidden />
          <span className="font-bold text-[15px]">Unikorn</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-[#6E6480]">
          <a href="#" className="hover:text-[#251F33]">
            How it works
          </a>
          <a
            href="#"
            className="bg-[#251F33] text-white rounded-full px-4 py-1.5 hover:bg-[#7C5CFC] transition-colors"
          >
            Sign in
          </a>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-xl -mt-10">
          <h1
            data-testid="hero-title"
            className="text-center text-[2rem] sm:text-[2.4rem] font-extrabold leading-tight"
          >
            What did you build today?
          </h1>
          <p className="text-center text-[#6E6480] mt-2.5 text-[15px]">
            Drop in your code — Unikorn turns it into slides you can actually show.
          </p>

          <div className="glow mt-8 border border-[#E5DEFA] bg-white rounded-3xl shadow-[0_8px_24px_-8px_rgba(124,92,252,0.18)] p-2.5 transition-shadow focus-within:border-[#7C5CFC] focus-within:shadow-[0_0_0_4px_rgba(124,92,252,0.14)]">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-[#7C5CFC] bg-[#F1ECFE] hover:bg-[#E5DEFA] transition-colors"
                aria-label="Attach code or folder"
                type="button"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept=".zip,.md,.txt" />
              <textarea
                ref={textareaRef}
                data-testid="unikorn-input"
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste a repo link, or just tell me what you made…"
                className="flex-1 resize-none bg-transparent text-[15px] py-2.5 px-1 placeholder:text-[#B0A8C2] focus:outline-none min-h-[44px] max-h-[96px]"
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 96) + 'px'
                }}
              />
              <button
                data-testid="generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Generate"
                type="button"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            {fileName && (
              <div className="mt-2 text-xs text-[#7C5CFC] bg-[#F1ECFE] rounded-full px-3 py-1 inline-flex items-center gap-2">
                {fileName}
                <button onClick={() => setFileName(null)} className="hover:text-[#251F33]">
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button
              data-testid="chip-folder"
              onClick={() => handleChip('Attach folder: ./my-app')}
              className="chip text-xs text-[#6E6480] border border-[#E5DEFA] bg-white rounded-full px-3.5 py-1.5 hover:bg-[#F1ECFE] hover:border-[#D9CCFB] transition-colors"
              type="button"
            >
              📁 Attach folder
            </button>
            <button
              data-testid="chip-github"
              onClick={() => handleChip('https://github.com/tamago-labs/everclaw')}
              className="chip text-xs text-[#6E6480] border border-[#E5DEFA] bg-white rounded-full px-3.5 py-1.5 hover:bg-[#F1ECFE] hover:border-[#D9CCFB] transition-colors"
              type="button"
            >
              🔗 GitHub repo
            </button>
            <button
              data-testid="chip-snippet"
              onClick={() => handleChip('Paste a snippet: function hello() { return "world" }')}
              className="chip text-xs text-[#6E6480] border border-[#E5DEFA] bg-white rounded-full px-3.5 py-1.5 hover:bg-[#F1ECFE] hover:border-[#D9CCFB] transition-colors"
              type="button"
            >
              Paste a snippet
            </button>
          </div>
          {toast && (
            <div className="mt-4 text-center text-sm text-[#7C5CFC] bg-[#F1ECFE] border border-[#D9CCFB] rounded-2xl px-4 py-2">
              {toast}
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-[#B0A8C2] pb-8">Every claim checked by Kane CLI</footer>
    </div>
  )
}
