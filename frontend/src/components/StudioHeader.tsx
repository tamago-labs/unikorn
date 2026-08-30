interface StudioHeaderProps {
  projectName: string
  onRescan?: () => void
}

export default function StudioHeader({ projectName, onRescan }: StudioHeaderProps) {
  return (
    <header className="border-b border-[#EFEAFB] bg-white">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF]" />
          <span className="font-extrabold text-[15px]">Unikorn</span>
          <span className="text-[#D6CCF2]">/</span>
          <span className="text-sm text-[#6E6480] font-mono">{projectName}</span>
        </div>
        <button
          onClick={onRescan}
          className="text-xs font-medium border border-[#E5DEFA] rounded-full px-3.5 py-1.5 hover:bg-[#F1ECFE] transition-colors"
        >
          Re-scan repo
        </button>
      </div>
    </header>
  )
}
