import { useState, useEffect } from 'react'
import { saveAiConfig, testAiConnection, fetchLogs, clearLogs } from '../api'
import { useStatus } from '../contexts/StatusContext'

type Tab = 'ai' | 'kane' | 'cli' | 'logs'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('cli')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#E5DEFA] overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5DEFA]">
          <h2 className="text-lg font-bold text-[#251F33]">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6480] hover:bg-[#F1ECFE] hover:text-[#251F33] transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-40 shrink-0 border-r border-[#E5DEFA] p-3 space-y-1">
            {([['cli', 'Terminal CLI'], ['ai', 'AI Provider'], ['kane', 'Kane CLI'], ['logs', 'Logs']] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-[#F1ECFE] text-[#7C5CFC]'
                    : 'text-[#6E6480] hover:bg-[#FBFAFE] hover:text-[#251F33]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'ai' && <AiTab />}
            {activeTab === 'kane' && <KaneTab />}
            {activeTab === 'cli' && <CliTab />}
            {activeTab === 'logs' && <LogsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function AiTab() {
  const { ai: status, refresh } = useStatus()
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(status?.apiKey ?? '')
  const [model, setModel] = useState(status?.model ?? '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status) {
      setBaseUrl(status.baseUrl)
      // only overwrite apiKey if user hasn't started editing or key is masked from server
      setApiKey(status.apiKey || '')
      setModel(status.model)
    }
  }, [status])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAiConfig(baseUrl, apiKey, model)
      await refresh()
      setTestResult({ ok: true, msg: 'Configuration saved.' })
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testAiConnection()
      if (r.ok) {
        setTestResult({ ok: true, msg: `Connected. Reply: "${r.reply}"` })
      } else {
        setTestResult({ ok: false, msg: r.error || 'Connection failed' })
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6E6480]">Connect any OpenAI-compatible API. Works with OpenAI, and more.</p>
      <div>
        <label className="block text-sm font-medium text-[#251F33] mb-1.5">Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.longcat.chat/openai/v1"
          className="w-full px-3 py-2 rounded-xl border border-[#E5DEFA] text-sm focus:outline-none focus:border-[#7C5CFC] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] transition-shadow"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#251F33] mb-1.5">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 rounded-xl border border-[#E5DEFA] text-sm focus:outline-none focus:border-[#7C5CFC] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] transition-shadow"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#251F33] mb-1.5">Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="LongCat-2.0"
          className="w-full px-3 py-2 rounded-xl border border-[#E5DEFA] text-sm focus:outline-none focus:border-[#7C5CFC] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] transition-shadow"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !baseUrl || !apiKey}
          className="px-4 py-2 rounded-xl border border-[#E5DEFA] text-sm font-semibold text-[#6E6480] hover:bg-[#FBFAFE] transition-colors disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      {testResult && (
        <div className={`text-sm rounded-xl px-4 py-3 ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {testResult.msg}
        </div>
      )}

      {status?.configured && (
        <p className="text-xs text-[#6E6480]">
          Status: configured for {status.baseUrl}
        </p>
      )}
    </div>
  )
}

function KaneTab() {
  const { kane, loading, isRefreshing, refresh } = useStatus()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#251F33]">Kane CLI</h3>
        <button
          onClick={() => refresh()}
          disabled={isRefreshing}
          className="text-xs font-medium text-[#7C5CFC] hover:text-[#6E40E0] disabled:opacity-50 flex items-center gap-1"
        >
          {isRefreshing && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {loading && !kane ? (
        <div className="flex items-center gap-2 text-sm text-[#6E6480] py-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" />
          </svg>
          Checking Kane CLI…
        </div>
      ) : !kane ? (
        <p className="text-sm text-[#6E6480]">Unable to reach Kane CLI.</p>
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
  )
}

function LogsTab() {
  const [logs, setLogs] = useState<string[]>([])

  const refresh = () => fetchLogs().then((r) => setLogs(r.logs)).catch(() => {})

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [])

  const handleClear = async () => {
    await clearLogs()
    refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6E6480]">{logs.length} entries (auto-refresh 3s)</span>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed bg-[#FBFAFE] border border-[#E5DEFA] text-[#251F33]">
        {logs.length === 0 ? (
          <span className="text-[#6E6480]">No logs yet.</span>
        ) : (
          logs.slice().reverse().map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">{l}</div>
          ))
        )}
      </div>
    </div>
  )
}

function CliTab() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('unikorn-cli-host')
    if (stored) setBaseUrl(stored)
  }, [])

  const handleSave = () => {
    localStorage.setItem('unikorn-cli-host', baseUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6E6480]">Configure the CLI backend host. Default is localhost:3001.</p>
      <div>
        <label className="block text-sm font-medium text-[#251F33] mb-1.5">CLI Host URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:3001"
          className="w-full px-3 py-2 rounded-xl border border-[#E5DEFA] text-sm focus:outline-none focus:border-[#7C5CFC] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] transition-shadow"
        />
      </div>
      <button
        onClick={handleSave}
        className="px-4 py-2 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#9B7CFF] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {saved ? 'Saved ✓' : 'Save'}
      </button>
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
