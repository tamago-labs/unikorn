import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DesignApp from './pages/DesignApp'
import KanePage from './pages/KanePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/design" element={<DesignApp />} />
      <Route path="/kane" element={<KanePage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
