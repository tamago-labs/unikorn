interface NewArtifactCardProps {
  label?: string
  onClick?: () => void
}

export default function NewArtifactCard({ label = 'New', onClick }: NewArtifactCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-dashed border-[#EFEAFB] rounded-2xl flex flex-col items-center justify-center gap-2 aspect-[4/3] hover:border-[#7C5CFC] transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-[#F1ECFE] flex items-center justify-center text-[#7C5CFC]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span className="text-xs text-[#8A7FA6] font-medium">{label}</span>
    </button>
  )
}
