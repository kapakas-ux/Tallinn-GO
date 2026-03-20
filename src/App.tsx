import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { Planner } from './pages/Planner';
import { Stops } from './pages/Stops';
import { Map } from './pages/Map';
import { TicketFAB } from './components/TicketFAB';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-surface flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto no-scrollbar">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/stops" element={<Stops />} />
            <Route path="/map" element={<Map />} />
          </Routes>
        </main>
        <TicketFAB />
        <BottomNav />
      </div>
    </Router>
  );
}
