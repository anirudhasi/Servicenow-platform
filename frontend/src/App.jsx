import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar.jsx'
import MonitoringDashboard  from './components/pages/MonitoringDashboard.jsx'
import TrendAnalysis        from './components/pages/TrendAnalysis.jsx'
import SmartTriage          from './components/pages/SmartTriage.jsx'
import IntelligentRouting   from './components/pages/IntelligentRouting.jsx'
import NLChatbot            from './components/pages/NLChatbot.jsx'
import SdmScorecard         from './components/pages/SdmScorecard.jsx'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/"           element={<Navigate to="/monitoring" replace />} />
          <Route path="/monitoring" element={<MonitoringDashboard />} />
          <Route path="/trends"     element={<TrendAnalysis />} />
          <Route path="/triage"     element={<SmartTriage />} />
          <Route path="/routing"    element={<IntelligentRouting />} />
          <Route path="/chatbot"    element={<NLChatbot />} />
          <Route path="/scorecard"  element={<SdmScorecard />} />
          <Route path="*"           element={<Navigate to="/monitoring" replace />} />
        </Routes>
      </main>
    </div>
  )
}
