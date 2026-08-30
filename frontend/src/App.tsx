import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DesignApp from './pages/DesignApp'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/design" element={<DesignApp />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
