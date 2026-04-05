import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { GettingStartedModal } from './GettingStartedModal';

export const TopBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <>
      <header className="w-full top-0 sticky z-50 pt-[env(safe-area-inset-top)] isolate overflow-hidden">
        <div className="nav-orb-layer">
          <div className="nav-orb nav-orb-1" />
          <div className="nav-orb nav-orb-2" />
          <div className="nav-orb nav-orb-3" />
        </div>
        <div className="flex items-center justify-between px-6 py-4 w-full relative z-10">
          <div className="flex items-center gap-4">
            <button 
              ref={menuButtonRef}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-primary active:scale-95 transition-transform"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="flex items-center active:scale-95 transition-transform group relative">
              <div className="absolute -inset-2 bg-black/20 blur-md rounded-full opacity-60" />
              <div className="absolute -inset-3 bg-primary/30 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <img 
                src="/logo.png" 
                alt="GO NOW" 
                className="h-7 object-contain relative z-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
              />
            </Link>
          </div>
        </div>
      </header>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] isolate">
          <div 
            className="absolute inset-0" 
            onClick={() => setIsMenuOpen(false)}
          />
          <div 
            ref={menuPanelRef} 
            className="topbar-menu-panel absolute left-6 w-52 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/10 overflow-hidden"
            style={{ top: 'calc(env(safe-area-inset-top) + 4rem)' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/10">
              <span className="font-label text-[10px] uppercase tracking-widest font-bold text-secondary">Menu</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-full text-secondary hover:text-primary hover:bg-surface-container-low transition-colors"
                aria-label="Close menu"
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
                  🚀 Getting Started
                </button>
                <button
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  ⚙️ Settings
                </button>
                <button
                  onClick={() => {
                    setIsTermsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  Terms & Conditions
                </button>
                <button
                  onClick={() => {
                    setIsPrivacyOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="topbar-menu-item w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  Privacy Policy
                </button>
                <a
                  href="https://ko-fi.com/tallinngo"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="topbar-menu-item block w-full text-left px-4 py-3 text-sm font-headline font-bold text-amber-500 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                >
                  ☕ Buy me a coffee
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
              <h2 className="font-headline font-black text-2xl text-primary">Terms & Conditions</h2>
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-4">
              <p>These Terms and Conditions (“Terms”) govern your use of this public transport application (“the App”). By accessing or using the App, you agree to be bound by these Terms.</p>
              
              <div>
                <h3 className="font-bold text-primary mb-1">1. Purpose of the App</h3>
                <p>The App provides public transport information, including routes, stops, and schedules, for informational purposes only. The App is intended to assist users in navigating public transportation systems but does not guarantee accuracy, completeness, or timeliness of the information provided.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">2. No Collection of Personal Data</h3>
                <p>The App does not collect, store, or process any personal data. No user registration or account creation is required, and no personally identifiable information is tracked or retained.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">3. Data Sources and Attribution</h3>
                <p>Transport-related data presented in the App is sourced from the Tallinn Transport Agency. Map data is provided by OpenFreeMap. All such data is the responsibility of the respective providers. We do not control, verify, or guarantee the accuracy, availability, or completeness of this data.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">4. Third-Party Services</h3>
                <p>The App relies on third-party data providers, including but not limited to OpenFreeMap and the Tallinn Transport Agency. We are not responsible for any interruptions, inaccuracies, errors, or omissions arising from these third-party services.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">5. Limitation of Liability</h3>
                <p>To the fullest extent permitted by applicable law, we shall not be liable for any direct, indirect, incidental, consequential, or special damages arising out of or in connection with the use of, or inability to use, the App. This includes, but is not limited to, missed connections, delays, or reliance on inaccurate information.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">6. Acceptable Use</h3>
                <p>You agree not to misuse the App or attempt to interfere with its normal operation. Unauthorized access, distribution, modification, or disruption of the App is strictly prohibited.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">7. Modifications to the Terms</h3>
                <p>We reserve the right to modify or update these Terms at any time without prior notice. Continued use of the App following any changes constitutes acceptance of the revised Terms.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">8. Governing Law</h3>
                <p>These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">9. Contact Information</h3>
                <p>For any questions regarding these Terms, please contact us via gonowestonia@gmail.com</p>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
              >
                I Understand
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
              <h2 className="font-headline font-black text-2xl text-primary">Privacy Policy</h2>
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-4">
              <p>GO NOW ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we handle your information when you use our app.</p>
              
              <div>
                <h3 className="font-bold text-primary mb-1">Information We Collect</h3>
                <p>We request permission to access your device's location solely to provide real-time features within the app, such as navigation or nearby points of interest in Tallinn. We do not collect, store, or share any personal data, including location history, device identifiers, or usage logs.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">How We Use Information</h3>
                <p>Location access is used only during active app sessions for core functionality. No data is retained after you close the app, and we do not track you across sessions or devices.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">No Data Sharing or Storage</h3>
                <p>We do not sell, share, or disclose any information to third parties. No user data is saved on our servers or elsewhere.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">Changes to This Policy</h3>
                <p>We may update this policy. Continued use of the app after changes means you accept them. Check this page periodically.</p>
              </div>

              <div>
                <h3 className="font-bold text-primary mb-1">Contact Us</h3>
                <p>Questions? Email to us at gonowestonia@gmail.com.</p>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
