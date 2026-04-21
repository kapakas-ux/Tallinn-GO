import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { Loader2 } from 'lucide-react';
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

const PULL_REFRESH_TRIGGER = 72;
const PULL_REFRESH_MAX = 120;

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
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const canPullToRefresh = location.pathname === '/' || location.pathname === '/stops';

  const setPull = (nextValue: number) => {
    pullDistanceRef.current = nextValue;
    setPullDistance(nextValue);
  };

  const resetPull = () => {
    isPullingRef.current = false;
    setPull(0);
  };

  const onPullStart = (event: TouchEvent<HTMLElement>) => {
    if (!canPullToRefresh || isRefreshing) return;
    const main = mainRef.current;
    if (!main || main.scrollTop > 0) return;
    startYRef.current = event.touches[0].clientY;
    isPullingRef.current = true;
  };

  const onPullMove = (event: TouchEvent<HTMLElement>) => {
    if (!canPullToRefresh || isRefreshing || !isPullingRef.current) return;
    const main = mainRef.current;
    if (!main || main.scrollTop > 0) {
      resetPull();
      return;
    }

    const deltaY = event.touches[0].clientY - startYRef.current;
    if (deltaY <= 0) {
      setPull(0);
      return;
    }

    const dampedPull = Math.min(PULL_REFRESH_MAX, deltaY * 0.45);
    setPull(dampedPull);
    if (dampedPull > 2) {
      event.preventDefault();
    }
  };

  const onPullEnd = () => {
    if (!canPullToRefresh || isRefreshing) {
      resetPull();
      return;
    }

    const shouldRefresh = pullDistanceRef.current >= PULL_REFRESH_TRIGGER;
    resetPull();
    if (!shouldRefresh) return;

    setIsRefreshing(true);
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  };

  useEffect(() => {
    const onSettings = () => setTheme(getSettings().theme);
    window.addEventListener('settings_changed', onSettings);
    return () => window.removeEventListener('settings_changed', onSettings);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    setIsRefreshing(false);
    resetPull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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
        StatusBar.setOverlaysWebView({ overlay: false });
        const bgColors: Record<string, string> = {
          daylight: '#f5f8fb',
          latte: '#faf6ef',
          plum: '#0c0718',
          havgra: '#060e18',
        };
        StatusBar.setBackgroundColor({ color: bgColors[currentTheme] || '#020617' });
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
        <main
          ref={mainRef}
          onTouchStart={onPullStart}
          onTouchMove={onPullMove}
          onTouchEnd={onPullEnd}
          onTouchCancel={onPullEnd}
          className={`relative flex-1 overflow-y-auto no-scrollbar overscroll-none ${
          location.pathname.startsWith('/map') ? '' : 'pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))]'
        }`}
        >
          {canPullToRefresh && (
            <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex h-0 justify-center overflow-visible">
              <div
                className="flex h-10 min-w-10 items-center justify-center rounded-full bg-surface-container-lowest/95 px-3 shadow-md border border-outline-variant/20"
                style={{
                  transform: `translateY(${Math.min(36, pullDistance * 0.6)}px) scale(${Math.max(0.72, Math.min(1, pullDistance / PULL_REFRESH_TRIGGER))})`,
                  opacity: isRefreshing ? 1 : Math.min(1, pullDistance / 26),
                  transition: isRefreshing ? 'none' : 'transform 120ms ease, opacity 120ms ease',
                }}
                aria-hidden="true"
              >
                <Loader2 className={`h-4 w-4 text-primary ${isRefreshing || pullDistance >= PULL_REFRESH_TRIGGER ? 'animate-spin' : ''}`} />
              </div>
            </div>
          )}
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
