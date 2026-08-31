import StatusBadges from './StatusBadges'

export default function Navbar() {
  return (
    <header className="max-w-5xl mx-auto w-full px-6 pt-8 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF] flex items-center justify-center"
          aria-hidden
          style={{ filter: 'drop-shadow(0 1px 4px rgba(124,92,252,0.25))' }}
        >
          <span style={{ fontSize: '15px', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(37,31,51,0.3))' }}>
            🦄
          </span>
        </div>
        <span className="font-bold text-[15px]">Unikorn</span>
      </div>
      <nav className="hidden sm:flex items-center gap-4 text-sm text-[#6E6480]">
        <a
          href="#how-it-works"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="hover:text-[#251F33]"
        >
          How it works
        </a>
        <a href="https://github.com/tamago-labs/unikorn" target="_blank" rel="noopener noreferrer" className="hover:text-[#251F33] flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
        <StatusBadges />
      </nav>
    </header>
  )
}
