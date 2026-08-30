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
      <nav className="hidden sm:flex items-center gap-6 text-sm text-[#6E6480]">
        <a href="#how-it-works" className="hover:text-[#251F33]">
          How it works
        </a>
      </nav>
    </header>
  )
}
