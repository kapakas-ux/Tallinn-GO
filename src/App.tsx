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
import { getSettings } from './services/settingsService';
import type { AppTheme } from './services/settingsService';

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
    if (Capacitor.isNativePlatform()) {
      // Hide splash screen when app is ready
      SplashScreen.hide();
      
      // Set status bar style
      const updateStatusBar = () => {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        // Top bar is always dark (primary in light mode, slate-950 in dark mode)
        // so we always want light text (Style.Dark)
        StatusBar.setStyle({ style: Style.Dark });
        StatusBar.setBackgroundColor({ color: isDark ? '#020617' : '#003571' });
      };

      updateStatusBar();

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => updateStatusBar();
      mediaQuery.addEventListener('change', listener);

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
        mediaQuery.removeEventListener('change', listener);
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/stops" element={<Stops />} />
            <Route path="/map" element={<Map />} />
          </Routes>
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
