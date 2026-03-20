import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

export const TopBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  return (
    <>
      <header className="w-full top-0 sticky z-50 bg-primary dark:bg-slate-950 shadow-md">
        <div className="flex items-center justify-between px-6 py-4 w-full relative">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white dark:text-blue-400 active:scale-95 transition-transform"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="font-headline font-black italic text-2xl tracking-tight">
              <span className="text-white">Tallinn</span> <span className="text-amber-400">GO</span>
            </h1>
          </div>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute top-full left-6 mt-2 w-48 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/20 overflow-hidden z-50">
              <button
                onClick={() => {
                  setIsTermsOpen(true);
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-surface-container-low transition-colors"
              >
                Terms & Conditions
              </button>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setIsMenuOpen(false);
                  // TODO: Link to payment platform
                  alert("Payment platform integration coming soon!");
                }}
                className="block w-full text-left px-4 py-3 text-sm font-headline font-bold text-amber-500 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
              >
                ☕ Buy me a coffee
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Terms & Conditions Modal */}
      {isTermsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
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
                <p>For any questions regarding these Terms, please contact us via tallinngo@gmail.com</p>
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
    </>
  );
};
