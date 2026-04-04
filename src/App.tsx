import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { Stops } from './pages/Stops';
import { Map } from './pages/Map';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Hide splash screen when app is ready
      SplashScreen.hide();
      
      // Set status bar style
      StatusBar.setStyle({ style: Style.Light });
      StatusBar.setBackgroundColor({ color: '#ffffff' });

      // Handle back button
      const backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack || location.pathname === '/') {
          CapApp.exitApp();
        } else {
          navigate(-1);
        }
      });

      return () => {
        backListener.then(l => l.remove());
      };
    }
  }, [navigate, location]);

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      <TopBar />
      <main className="flex-1 overflow-y-auto no-scrollbar overscroll-none">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stops" element={<Stops />} />
          <Route path="/map" element={<Map />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
