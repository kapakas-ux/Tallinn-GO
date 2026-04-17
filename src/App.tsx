import { useEffect, useState } from 'react';
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
import { Planner } from './pages/Planner';
import { getSettings } from './services/settingsService';
import type { AppTheme } from './services/settingsService';
import { startRidangoWS, stopRidangoWS } from './services/ridangoWebSocket';
import { startTartuWS, stopTartuWS } from './services/tartuWebSocket';

function OrbLayer() {
  return (
    <div className="orb-layer" aria-hidden="true">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<AppTheme>(getSettings().theme);

  useEffect(() => {
    const onSettings = () => setTheme(getSettings().theme);
    window.addEventListener('settings_changed', onSettings);
    return () => window.removeEventListener('settings_changed', onSettings);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    startRidangoWS();
    startTartuWS();
    return () => { stopRidangoWS(); stopTartuWS(); };
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Hide splash screen when app is ready
      SplashScreen.hide();
      
      // Set status bar style
      const updateStatusBar = () => {
        const currentTheme = getSettings().theme;
        const isLightTheme = currentTheme === 'daylight' || currentTheme === 'latte';
        StatusBar.setStyle({ style: isLightTheme ? Style.Light : Style.Dark });
      };

      updateStatusBar();

      // Re-apply on theme changes
      const settingsListener = () => updateStatusBar();
      window.addEventListener('settings_changed', settingsListener);

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
        window.removeEventListener('settings_changed', settingsListener);
      };
    }
  }, [navigate, location]);

  return (
    <>
      <OrbLayer />
        <div className="themed-root h-full flex flex-col overflow-hidden relative">
        <TopBar />
        <main className={`flex-1 overflow-y-auto no-scrollbar overscroll-none ${
          location.pathname.startsWith('/map') ? '' : 'pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))]'
        }`}>
          <Routes>
            <Route path="/plan" element={<Planner />} />
            {/* Fallback so Routes doesn't complain on other paths */}
            <Route path="*" element={null} />
          </Routes>
          {/* Keep Dashboard and Stops mounted but hidden to preserve state across tab switches */}
          <div className={location.pathname === '/' ? '' : 'hidden'}>
            <Dashboard active={location.pathname === '/'} />
          </div>
          <div className={location.pathname === '/stops' ? '' : 'hidden'}>
            <Stops active={location.pathname === '/stops'} />
          </div>
          {/* Map stays mounted but hidden to preserve tile cache and state */}
          <div className={location.pathname === '/map' ? 'h-full' : 'hidden'}>
            <Map active={location.pathname === '/map'} />
          </div>
        </main>
        <BottomNav />
      </div>
    </>
  );
}

export default function App() {
  // Apply saved theme immediately on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getSettings().theme);
  }, []);

  return (
    <Router>
      <AppContent />
    </Router>
  );
}
