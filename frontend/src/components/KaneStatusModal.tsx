import { type KaneStatus } from '../api'

interface Props {
  kane: KaneStatus | null
  onClose: () => void
}

export default function KaneStatusModal({ kane, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#E5DEFA] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#251F33]">Kane CLI Status</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE] hover:text-[#251F33] transition-colors"
          >
            ×
          </button>
        </div>

        {!kane ? (
          <p className="text-sm text-[#6E6480]">Unable to fetch Kane CLI status.</p>
        ) : (
          <div className="space-y-3">
            <Row label="Installed">
              <span className={`text-sm font-medium flex items-center gap-1.5 ${kane.available ? 'text-emerald-600' : 'text-red-500'}`}>
                <span className={`w-2 h-2 rounded-full ${kane.available ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {kane.version || (kane.available ? 'yes' : 'not found')}
              </span>
            </Row>
            <Row label="Authenticated">
              <span className={`text-sm font-medium flex items-center gap-1.5 ${kane.authenticated ? 'text-emerald-600' : 'text-[#6E6480]'}`}>
                <span className={`w-2 h-2 rounded-full ${kane.authenticated ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {kane.authenticated ? 'yes' : 'no'}
              </span>
            </Row>
            <Row label="Balance">
              <span className="text-sm font-medium text-[#251F33]">
                {kane.balance ? `${kane.balance.available.toLocaleString()} / ${kane.balance.total.toLocaleString()}` : '--'}
              </span>
            </Row>
            <div className="pt-3 border-t border-[#E5DEFA] space-y-2">
              <p className="text-xs font-medium text-[#6E6480]">CLI commands</p>
              {['kane-cli --version', 'kane-cli whoami', 'kane-cli balance'].map((cmd) => (
                <div key={cmd} className="text-xs font-mono text-[#251F33] bg-[#F1ECFE] rounded-lg px-3 py-2">
                  {cmd}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[#6E6480]">{label}</span>
      {children}
    </div>
  )
}
