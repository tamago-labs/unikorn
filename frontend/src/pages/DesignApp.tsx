import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import StudioHeader from '../components/StudioHeader'
import PrdSummaryCard, { parsePrdMarkdown } from '../components/PrdSummaryCard'
import PrdEmptyState from '../components/PrdEmptyState'
import AiDrawer from '../components/AiDrawer'
import PrdDrawer from '../components/PrdDrawer'
import KaneFlow from '../components/KaneFlow'
import StudioTabs from '../components/StudioTabs'
import ArtifactCard from '../components/ArtifactCard'
import NewArtifactCard from '../components/NewArtifactCard'
import Gallery from '../components/Gallery'
import { fetchWorkingFolder, scanFolder, fetchPrd, fetchPrdContent, type Inventory } from '../api'
import { useStatus } from '../contexts/StatusContext'
import SettingsModal from '../components/SettingsModal'

const tabs = [
  { id: 'tutorial', label: 'Tutorial', count: 4 },
  { id: 'slides', label: 'Slide deck', count: 2 },
  { id: 'marketing', label: 'Marketing', count: 6 },
  { id: 'kane', label: 'Kane', count: 0 },
]

const mockArtifacts: Record<string, Array<{ title: string; subtitle: string; badge: string; draft?: boolean }>> = {
  tutorial: [
    { title: 'Developer onboarding', subtitle: 'v3 · edited 2h ago', badge: '4 slides' },
    { title: 'Quickstart — CLI users', subtitle: 'v1 · edited yesterday', badge: '6 slides' },
    { title: 'Non-technical walkthrough', subtitle: 'v1 · draft', badge: '3 slides', draft: true },
  ],
  slides: [
    { title: 'Investor pitch', subtitle: 'v2 · edited 3h ago', badge: '12 slides' },
    { title: 'Product demo', subtitle: 'v1 · edited last week', badge: '8 slides' },
  ],
  marketing: [
    { title: 'Landing page copy', subtitle: 'v4 · edited 1h ago', badge: '6 sections' },
    { title: 'Twitter thread', subtitle: 'v2 · edited yesterday', badge: '8 tweets' },
    { title: 'README hero section', subtitle: 'v1 · edited 2 days ago', badge: '1 page' },
  ],
}

export default function DesignApp() {
  const [activeTab, setActiveTab] = useState('tutorial')
  const [projectName, setProjectName] = useState('')
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [invLoading, setInvLoading] = useState(true)
  const [prdExists, setPrdExists] = useState(false)
  const [prdMeta, setPrdMeta] = useState<any>(null)
  const [prdLoading, setPrdLoading] = useState(true)
  const [prdContent, setPrdContent] = useState<string | null>(null)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [prdDrawerOpen, setPrdDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const { ai } = useStatus()

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (folderParam) {
      setProjectName(folderParam)
    } else {
      fetchWorkingFolder().then((r) => setProjectName(r.folder)).catch(() => {})
    }
  }, [searchParams])

  // scan + prd meta when projectName ready
  useEffect(() => {
    if (!projectName) return
    let cancelled = false
    setInvLoading(true)
    setPrdLoading(true)
    scanFolder(projectName)
      .then((r) => { if (!cancelled) setInventory(r.inventory) })
      .catch(() => { if (!cancelled) setInventory(null) })
      .finally(() => { if (!cancelled) setInvLoading(false) })

    fetchPrd(projectName)
      .then((r) => {
        if (!cancelled) { setPrdExists(r.exists); setPrdMeta(r.meta) }
        if (r.exists) {
          fetchPrdContent(projectName).then((c) => { if (!cancelled) setPrdContent(c.content) }).catch(() => { if (!cancelled) setPrdContent(null) })
        } else {
          setPrdContent(null)
        }
      })
      .catch(() => { if (!cancelled) setPrdExists(false) })
      .finally(() => { if (!cancelled) setPrdLoading(false) })
    return () => { cancelled = true }
  }, [projectName])

  const refreshPrd = () => {
    if (!projectName) return
    fetchPrd(projectName).then((r) => {
      setPrdExists(r.exists); setPrdMeta(r.meta)
      if (r.exists) fetchPrdContent(projectName).then((c) => setPrdContent(c.content)).catch(() => setPrdContent(null))
      else setPrdContent(null)
    }).catch(() => {})
  }

  const artifacts = mockArtifacts[activeTab] || []

  return (
    <div className="min-h-screen bg-[#FBFAFE]">
      <StudioHeader projectName={projectName} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {prdLoading ? (
          <div className="bg-white border border-[#EFEAFB] rounded-2xl p-5 animate-pulse">
            <div className="h-4 w-48 bg-[#F1ECFE] rounded" />
            <div className="h-3 w-64 bg-[#FBFAFE] rounded mt-2" />
          </div>
        ) : prdExists && prdContent ? (
          (() => {
            const parsed = parsePrdMarkdown(prdContent)
            return (
              <PrdSummaryCard
                title={parsed.title}
                overview={parsed.overview}
                ucCount={parsed.ucCount}
                acCount={parsed.acCount}
                startUrl={parsed.startUrl || inventory?.startUrl || null}
                hasAuth={parsed.hasAuth || !!inventory?.hasAuth}
                source={inventory?.framework ? `${projectName} · ${inventory.framework}` : projectName}
                updatedAt={prdMeta?.updatedAt || prdMeta?.createdAt || null}
                onView={() => setPrdDrawerOpen(true)}
              />
            )
          })()
        ) : prdExists ? (
          <PrdSummaryCard
            title="PRD ready"
            overview="Loading preview…"
            ucCount={0}
            acCount={0}
            startUrl={inventory?.startUrl || null}
            hasAuth={!!inventory?.hasAuth}
            source={projectName}
            updatedAt={prdMeta?.createdAt || null}
            onView={() => setPrdDrawerOpen(true)}
          />
        ) : (
          <PrdEmptyState
            fileCount={inventory?.fileCount ?? 0}
            framework={inventory?.framework ?? null}
            truncated={inventory?.truncated}
            loading={invLoading}
            onScan={() => setAiDrawerOpen(true)}
            aiConfigured={ai?.configured}
            onConfigureAi={() => setSettingsOpen(true)}
          />
        )}

        {/* collapsed pill when drawer closed but PRD exists recently */}
        {aiDrawerOpen === false && !prdExists && inventory && !invLoading && (
          <div className="mt-2 text-xs text-[#8A7FA6]">
            {inventory.routes.length > 0 && <span>{inventory.routes.length} routes detected · </span>}
            {inventory.hasReadme ? 'README found' : 'No README — AI will ask clarifying questions'}
          </div>
        )}

        <div className="mt-8">
          <StudioTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === 'kane' ? (
          <div className="mt-6">
            <KaneFlow folder={projectName} />
          </div>
        ) : (
          <Gallery>
            <NewArtifactCard label={`New ${activeTab}`} />
            {artifacts.map((a) => (
              <ArtifactCard key={a.title} title={a.title} subtitle={a.subtitle} badge={a.badge} draft={a.draft} />
            ))}
          </Gallery>
        )}
      </main>

      <AiDrawer open={aiDrawerOpen} folder={projectName} inventory={inventory} onClose={() => setAiDrawerOpen(false)} onDone={() => { refreshPrd(); }} />
      <PrdDrawer open={prdDrawerOpen} folder={projectName} onClose={() => setPrdDrawerOpen(false)} />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* collapsed PRD pill */}
      {prdExists && !aiDrawerOpen && !prdDrawerOpen && (
        <button
          onClick={() => setPrdDrawerOpen(true)}
          className="fixed bottom-4 right-4 bg-[#251F33] text-white text-xs font-medium rounded-full px-4 py-2 shadow-lg hover:bg-black transition-colors flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          PRD ready — View
        </button>
      )}
    </div>
  )
}
