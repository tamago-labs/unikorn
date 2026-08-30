import StatusBadges from './StatusBadges'

interface StudioHeaderProps {
  projectName: string
}

export default function StudioHeader({ projectName }: StudioHeaderProps) {
  return (
    <header className="border-b border-[#EFEAFB] bg-white">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF] flex items-center justify-center"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(124,92,252,0.25))' }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(37,31,51,0.3))' }}>
              🦄
            </span>
          </div>
          <span className="font-extrabold text-[15px]">Unikorn</span>
          <span className="text-[#D6CCF2]">/</span>
          <span className="text-sm text-[#6E6480] font-mono">{projectName}</span>
        </div>
        <StatusBadges />
      </div>
    </header>
  )
}

