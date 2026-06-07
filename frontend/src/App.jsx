import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar.jsx'
import ExecutiveSummary     from './components/pages/ExecutiveSummary.jsx'
import MonitoringDashboard  from './components/pages/MonitoringDashboard.jsx'
import TrendAnalysis        from './components/pages/TrendAnalysis.jsx'
import SmartTriage          from './components/pages/SmartTriage.jsx'
import IntelligentRouting   from './components/pages/IntelligentRouting.jsx'
import NLChatbot            from './components/pages/NLChatbot.jsx'
import SdmScorecard         from './components/pages/SdmScorecard.jsx'
import DataUpload           from './components/pages/DataUpload.jsx'
import SLABreachAnalysis    from './components/pages/SLABreachAnalysis.jsx'
import DataManagement       from './components/pages/DataManagement.jsx'
import TowerSDMComparison   from './components/pages/TowerSDMComparison.jsx'
export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/"            element={<Navigate to="/summary" replace />} />
          <Route path="/summary"     element={<ExecutiveSummary />} />
          <Route path="/comparison"  element={<TowerSDMComparison />} />
          <Route path="/monitoring"  element={<MonitoringDashboard />} />
          <Route path="/trends"      element={<TrendAnalysis />} />
          <Route path="/triage"      element={<SmartTriage />} />
          <Route path="/smart-triage" element={<SmartTriage />} />
          <Route path="/routing"     element={<IntelligentRouting />} />
          <Route path="/chatbot"     element={<NLChatbot />} />
          <Route path="/scorecard"   element={<SdmScorecard />} />
          <Route path="/breach"      element={<SLABreachAnalysis />} />
          <Route path="/sla-breach"  element={<SLABreachAnalysis />} />
          <Route path="/upload"      element={<DataUpload />} />
          <Route path="/data"        element={<DataManagement />} />
          <Route path="*"            element={<Navigate to="/summary" replace />} />
        </Routes>
      </main>
    </div>
  )
}
