import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsModal } from './SettingsModal';
import { GettingStartedModal } from './GettingStartedModal';
import { getSettings, saveSettings, type AppLanguage } from '../services/settingsService';

export const TopBar = () => {
  const { t, i18n } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const langRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target as Node;
      const insidePanel = !!menuPanelRef.current?.contains(target);
      const insideButton = !!menuButtonRef.current?.contains(target);

      if (!insidePanel && !insideButton) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isLangOpen) return;
    const handler = (e: PointerEvent) => {
      if (!langRef.current?.contains(e.target as Node)) setIsLangOpen(false);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [isLangOpen]);

  const LANGS: { code: AppLanguage; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'et', label: 'ET' },
    { code: 'ru', label: 'RU' },
  ];

  const switchLang = (code: AppLanguage) => {
    saveSettings({ language: code });
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  };

  return (
    <>
      <header className="absolute w-full top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="nav-orb-layer">
          <div className="nav-orb nav-orb-1" />
          <div className="nav-orb nav-orb-2" />
          <div className="nav-orb nav-orb-3" />
        </div>
        <div className="flex items-center gap-4 px-6 py-4 w-full relative z-10">
          <button 
            ref={menuButtonRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-primary active:scale-95 transition-transform"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link to="/" className="flex items-center active:scale-95 transition-transform group relative">
            <img 
              src="/logo.png" 
              alt="GO NOW" 
              className="h-7 object-contain relative z-10 logo-shadow"
            />
          </Link>
        </div>
      </header>

      {/* Language Switcher - fixed outside header to avoid clip-path */}
      <div ref={langRef} className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-6 z-[60]">
        <button
          onClick={() => setIsLangOpen(!isLangOpen)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-primary active:scale-95 transition-transform"
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs font-bold uppercase">{(i18n.language || 'en').slice(0, 2).toUpperCase()}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {isLangOpen && (
          <div
            className="absolute right-0 mt-1 w-28 rounded-xl shadow-lg border border-outline-variant overflow-hidden backdrop-blur-xl"
            style={{
              background: 'var(--color-surface)',
            }}
          >
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => switchLang(l.code)}
                className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors border-t border-outline-variant first:border-t-0 ${
                  i18n.language === l.code
                    ? 'text-primary bg-primary-fixed'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {t(`language.${l.code}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100]">
          <div 
            className="absolute inset-0" 
            onClick={() => setIsMenuOpen(false)}
          />
          <div 
            ref={menuPanelRef} 
            className="topbar-menu-panel absolute left-6 w-52 rounded-xl shadow-lg border border-outline-variant/10 overflow-hidden"
            style={{
              top: 'calc(env(safe-area-inset-top) + 4rem)',
              background: 'rgba(0, 0, 0, 0.55)',
              WebkitBackdropFilter: 'blur(20px)',
              backdropFilter: 'blur(20px)',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              willChange: 'transform',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/10">
              <span className="font-label text-[10px] uppercase tracking-widest font-bold text-secondary">{t('topbar.menu')}</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-full text-secondary hover:text-primary hover:bg-surface-container-low transition-colors"
                aria-label={t('topbar.closeMenu')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => {
                setIsGettingStartedOpen(true);
                setIsMenuOpen(false);
              }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors"
                >
                  {t('topbar.gettingStarted')}
                </button>
                <button
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  {t('topbar.settings')}
                </button>
                <button
                  onClick={() => {
                    setIsTermsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  {t('topbar.terms')}
                </button>
                <button
                  onClick={() => {
                    setIsPrivacyOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  {t('topbar.privacy')}
                </button>
                <a
                  href="https://ko-fi.com/tallinngo"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="topbar-menu-item block w-full text-left px-4 py-3 text-sm font-headline font-bold text-amber-500 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  {t('topbar.coffee')}
                </a>
              </div>
        </div>
      )}

      {/* Getting Started Modal */}
      {isGettingStartedOpen && <GettingStartedModal onClose={() => setIsGettingStartedOpen(false)} />}

      {/* Settings Modal */}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}

      {/* Terms & Conditions Modal */}
      {isTermsOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsTermsOpen(false)}
        >
          <div 
            className="settings-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
              <h2 className="font-headline font-black text-2xl text-primary">{t('terms.title')}</h2>
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-4">
              <p>{t('terms.intro')}</p>

              {[1,2,3,4,5,6,7,8,9].map(n => (
                <div key={n}>
                  <h3 className="font-bold text-primary mb-1">{t(`terms.section${n}Title`)}</h3>
                  <p>{t(`terms.section${n}`)}</p>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
              >
                {t('terms.understand')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Privacy Policy Modal */}
      {isPrivacyOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsPrivacyOpen(false)}
        >
          <div 
            className="settings-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
              <h2 className="font-headline font-black text-2xl text-primary">{t('privacy.title')}</h2>
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-4">
              <p>{t('privacy.intro')}</p>
              
              <div>
                <h3 className="font-bold text-primary mb-1">{t('privacy.collectTitle')}</h3>
                <p>{t('privacy.collect')}</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">{t('privacy.useTitle')}</h3>
                <p>{t('privacy.use')}</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">{t('privacy.shareTitle')}</h3>
                <p>{t('privacy.share')}</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">{t('privacy.changesTitle')}</h3>
                <p>{t('privacy.changes')}</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">{t('privacy.contactTitle')}</h3>
                <p>{t('privacy.contact')}</p>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
