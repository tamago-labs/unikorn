interface ArtifactCardProps {
  title: string
  subtitle: string
  badge: string
  draft?: boolean
  onClick?: () => void
}

export default function ArtifactCard({ title, subtitle, badge, draft, onClick }: ArtifactCardProps) {
  return (
    <button
      onClick={onClick}
      className={`bg-white border border-[#EFEAFB] rounded-2xl overflow-hidden text-left transition-all hover:border-[#7C5CFC] hover:shadow-[0_2px_8px_-2px_rgba(124,92,252,0.15)] ${draft ? 'opacity-70' : ''}`}
    >
      <div className="aspect-[4/3] bg-gradient-to-br from-[#F1ECFE] to-[#E5DEFA] flex items-center justify-center">
        <span className="text-xs font-mono text-[#8A7FA6]">{badge}</span>
      </div>
      <div className="p-3.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-[#8A7FA6] mt-0.5">{subtitle}</p>
      </div>
    </button>
  )
}
