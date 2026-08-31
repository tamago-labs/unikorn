import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import StudioHeader from '../components/StudioHeader'
import PrdSummaryCard, { parsePrdMarkdown } from '../components/PrdSummaryCard'
import PrdEmptyState from '../components/PrdEmptyState'
import AiDrawer from '../components/AiDrawer'
import PrdDrawer from '../components/PrdDrawer'
import StudioTabs from '../components/StudioTabs'
import ArtifactCard from '../components/ArtifactCard'
import NewArtifactCard from '../components/NewArtifactCard'
import Gallery from '../components/Gallery'
import ArtifactWizard from '../components/ArtifactWizard'
import { fetchWorkingFolder, scanFolder, fetchPrd, fetchPrdContent, fetchArtifacts, type Inventory, type ArtifactMeta } from '../api'
import { useStatus } from '../contexts/StatusContext'
import SettingsModal from '../components/SettingsModal'

const tabs = [
  { id: 'tutorial', label: 'Tutorial' },
  { id: 'slides', label: 'Slide deck' },
]

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
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKind, setWizardKind] = useState<'deck' | 'tutorial'>('deck')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { ai } = useStatus()

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (folderParam) {
      setProjectName(folderParam)
    } else {
      fetchWorkingFolder().then((r) => setProjectName(r.folder)).catch(() => {})
    }
  }, [searchParams])

  const refreshArtifacts = () => {
    if (!projectName) return
    fetchArtifacts(projectName).then((r) => setArtifacts(r.artifacts || [])).catch(() => setArtifacts([]))
  }

  // scan + prd meta + artifacts when projectName ready
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

    refreshArtifacts()
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

  const openWizard = (kind: 'deck' | 'tutorial') => {
    setWizardKind(kind)
    setWizardOpen(true)
  }

  const tabCounts: Record<string, number> = {
    tutorial: artifacts.filter((a) => a.kind === 'tutorial').length,
    slides: artifacts.filter((a) => a.kind === 'deck').length,
  }

  const visibleArtifacts = artifacts.filter((a) => (activeTab === 'tutorial' && a.kind === 'tutorial') || (activeTab === 'slides' && a.kind === 'deck'))

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
                onVerify={() => navigate(`/kane?folder=${encodeURIComponent(projectName)}`)}
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
            onVerify={() => navigate(`/kane?folder=${encodeURIComponent(projectName)}`)}
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

        {/* trigger 2 — verify banner when PRD ready */}
        {prdExists && (
          <div className="mt-4 bg-gradient-to-r from-[#7C5CFC]/10 to-[#9B7CFF]/10 border border-[#E5DEFA] rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#251F33]">Put it to the test</p>
              <p className="text-xs text-[#6E6480]">Run the PRD against your real product. Capture verified behavior, screenshots, and evidence you can use to build the story.</p>
            </div>
            <button
              onClick={() => navigate(`/kane?folder=${encodeURIComponent(projectName)}`)}
              className="shrink-0 bg-[#7C5CFC] text-white text-xs font-bold rounded-full px-4 py-2 hover:opacity-90"
            >
              Open Kane Command Center →
            </button>
          </div>
        )}

        <div className="mt-8">
          <StudioTabs tabs={tabs.map((t) => ({ ...t, count: tabCounts[t.id] ?? 0 }))} active={activeTab} onChange={setActiveTab} />
        </div>

        <Gallery>
            <NewArtifactCard
              label={activeTab === 'tutorial' ? 'New tutorial' : 'New slide deck'}
              onClick={() => openWizard(activeTab === 'tutorial' ? 'tutorial' : 'deck')}
            />
            {visibleArtifacts.map((a) => (
              <ArtifactCard
                key={a.id}
                title={a.title}
                subtitle={`${a.kind === 'deck' ? (a.purpose === 'pitch' ? 'Pitch' : 'Demo walkthrough') : 'Tutorial'} · ${new Date(a.createdAt).toLocaleDateString()}`}
                badge={`${a.pageCount} pages`}
                onClick={() => window.open(`/artifacts/${a.id}/`, '_blank')}
              />
            ))}
            {visibleArtifacts.length === 0 && (
              <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6 text-sm text-[#8A7FA6] col-span-2">
                Nothing here yet — create your first {activeTab === 'tutorial' ? 'tutorial' : 'deck'} from the verified PRD + run data.
              </div>
            )}
          </Gallery>
      </main>

      <AiDrawer open={aiDrawerOpen} folder={projectName} inventory={inventory} onClose={() => setAiDrawerOpen(false)} onDone={() => { refreshPrd(); }} />
      <PrdDrawer open={prdDrawerOpen} folder={projectName} onClose={() => setPrdDrawerOpen(false)} />
      <ArtifactWizard
        open={wizardOpen}
        folder={projectName}
        prdContent={prdContent}
        onClose={() => setWizardOpen(false)}
        onDone={refreshArtifacts}
      />
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
