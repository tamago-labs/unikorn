import { motion } from 'framer-motion'

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
    <div className="flex items-center gap-1.5 bg-[#F1ECFE] rounded-full p-1 w-fit relative">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.id ? 'text-white' : 'text-[#6E6480] hover:text-[#251F33]'
          }`}
        >
          {active === tab.id && (
            <motion.div
              layoutId="tab-pill"
              className="absolute inset-0 bg-[#251F33] rounded-full"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            {tab.label}
            <span className="opacity-60 font-mono text-xs ml-1">·{tab.count}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
