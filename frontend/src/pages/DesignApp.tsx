import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import StudioHeader from '../components/StudioHeader'
import VerifiedCard from '../components/VerifiedCard'
import StudioTabs from '../components/StudioTabs'
import ArtifactCard from '../components/ArtifactCard'
import NewArtifactCard from '../components/NewArtifactCard'
import Gallery from '../components/Gallery'
import { fetchWorkingFolder } from '../api'

const tabs = [
  { id: 'tutorial', label: 'Tutorial', count: 4 },
  { id: 'slides', label: 'Slide deck', count: 2 },
  { id: 'marketing', label: 'Marketing', count: 6 },
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
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (folderParam) {
      const name = folderParam.split(/[/\\]/).pop() || folderParam
      setProjectName(name)
    } else {
      fetchWorkingFolder().then((r) => {
        const name = r.folder.split(/[/\\]/).pop() || r.folder
        setProjectName(name)
      }).catch(() => {})
    }
  }, [searchParams])

  const artifacts = mockArtifacts[activeTab] || []

  return (
    <div className="min-h-screen bg-[#FBFAFE]">
      <StudioHeader projectName={projectName} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <VerifiedCard
          claimsProved={35}
          totalClaims={41}
          source="acme-api@main"
          runId="48"
        />

        <div className="mt-8">
          <StudioTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        <Gallery>
          <NewArtifactCard label={`New ${activeTab}`} />
          {artifacts.map((a) => (
            <ArtifactCard
              key={a.title}
              title={a.title}
              subtitle={a.subtitle}
              badge={a.badge}
              draft={a.draft}
            />
          ))}
        </Gallery>
      </main>
    </div>
  )
}
