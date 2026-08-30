// Separate component — 3 variants via `variant` prop. Default = A.
// Switch variant in HomePage.tsx: <HowItWorks variant="A"|"B"|"C" />

type Variant = 'A' | 'B' | 'C'

const steps = [
  {
    n: '01',
    title: 'Draft PRD',
    desc: 'Unikorn scans your code and generates a PRD grounded in what it actually does.',
    icon: '📁',
  },
  {
    n: '02',
    title: 'Verify claims',
    desc: 'Kane CLI checks each code-traceable claim against your codebase — proved or flagged, never assumed.',
    icon: '✅',
  },
  {
    n: '03',
    title: 'Get the story',
    desc: 'One-pager and tutorial, ready to share with investors, co-founders, and customers.',
    icon: '🚀',
  },
]

export default function HowItWorks({ variant = 'A' }: { variant?: Variant }) {
  if (variant === 'B') return <VariantB />
  if (variant === 'C') return <VariantC />
  return <VariantA />
}

// A — 4 cards, minimal, matches hero
function VariantA() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto w-full px-6 py-16">
      <h2 className="text-center text-2xl font-extrabold">How it works</h2>
      <p className="text-center text-sm text-[#6E6480] mt-2">Code goes in. Product docs come out. Every claim verified.</p>
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        {steps.map((s) => (
          <div key={s.n} className="bg-white border border-[#E5DEFA] rounded-2xl p-5">
            <div className="w-8 h-8 rounded-full bg-[#F1ECFE] text-[#7C5CFC] flex items-center justify-center text-sm font-bold">
              {s.n}
            </div>
            <h3 className="font-bold text-sm mt-3">{s.title}</h3>
            <p className="text-sm text-[#6E6480] mt-1.5 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// B — horizontal timeline with connector
function VariantB() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto w-full px-6 py-16">
      <h2 className="text-center text-2xl font-extrabold">How it works</h2>
      <div className="relative mt-10">
        <div className="hidden sm:block absolute top-5 left-[16%] right-[16%] h-px bg-[#E5DEFA]" />
        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#B79CFF] text-white flex items-center justify-center mx-auto text-sm">
                {s.icon}
              </div>
              <h3 className="font-bold text-sm mt-3">{s.title}</h3>
              <p className="text-sm text-[#6E6480] mt-1.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// C — bento / feature row with icons
function VariantC() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto w-full px-6 py-16">
      <div className="bg-white border border-[#E5DEFA] rounded-3xl p-6 sm:p-8">
        <h2 className="text-xl font-extrabold">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-[#F1ECFE] flex items-center justify-center text-sm">
                {s.icon}
              </div>
              <div>
                <h3 className="font-bold text-sm">{s.title}</h3>
                <p className="text-sm text-[#6E6480] mt-1">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
