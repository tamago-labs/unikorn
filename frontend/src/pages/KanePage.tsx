import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import StudioHeader from '../components/StudioHeader'
import KaneFlow from '../components/KaneFlow'
import { fetchWorkingFolder } from '../api'

export default function KanePage() {
  const [projectName, setProjectName] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (folderParam) {
      setProjectName(folderParam)
    } else {
      fetchWorkingFolder().then((r) => setProjectName(r.folder)).catch(() => {})
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-[#FBFAFE]">
      <StudioHeader projectName={projectName} />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/design?folder=${encodeURIComponent(projectName)}`)}
            className="text-xs font-medium border border-[#E5DEFA] rounded-full px-3 py-1.5 hover:bg-white flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back to PRD
          </button>
          <h1 className="text-lg font-extrabold text-[#251F33]">Kane Command Center</h1>
          <span className="text-xs text-[#8A7FA6]">Run long-running tests, capture real product behavior, and come back anytime to review the results and evidence.</span>
        </div>

        {!projectName ? (
          <div className="bg-white border border-[#EFEAFB] rounded-2xl p-6 animate-pulse">
            <div className="h-4 w-48 bg-[#F1ECFE] rounded" />
          </div>
        ) : (
          <KaneFlow folder={projectName} />
        )}
      </main>
    </div>
  )
}
