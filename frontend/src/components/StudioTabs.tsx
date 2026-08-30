interface StudioTab {
  id: string
  label: string
  count: number
}

interface StudioTabsProps {
  tabs: StudioTab[]
  active: string
  onChange: (id: string) => void
}

export default function StudioTabs({ tabs, active, onChange }: StudioTabsProps) {
  return (
    <div className="flex items-center gap-1.5 bg-[#F1ECFE] rounded-full p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
            active === tab.id
              ? 'bg-[#251F33] text-white'
              : 'text-[#6E6480] hover:bg-[#E5DEFA]'
          }`}
        >
          {tab.label}
          <span className="opacity-60 font-mono text-xs ml-1">·{tab.count}</span>
        </button>
      ))}
    </div>
  )
}
