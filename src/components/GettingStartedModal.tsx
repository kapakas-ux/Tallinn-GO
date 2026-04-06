import React from 'react';
import { X, Star, Bell, MapPin, Navigation, Clock, Route, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GettingStartedModalProps {
  onClose: () => void;
}

export const GettingStartedModal = ({ onClose }: GettingStartedModalProps) => {
  const { t } = useTranslation();
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="settings-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
          <h2 className="font-headline font-black text-2xl text-primary">{t('gettingStarted.title')}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-6">
          <p className="text-base">{t('gettingStarted.intro')}</p>
          
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1">
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.realtimeTitle')}</h3>
                <p>
                  {t('gettingStarted.realtime')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-1">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.favoritesTitle')}</h3>
                <p>
                  {t('gettingStarted.favorites')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-1">
                <Bell className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.notificationsTitle')}</h3>
                <p>
                  {t('gettingStarted.notifications')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-1">
                <MapPin className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.mapTitle')}</h3>
                <p>
                  {t('gettingStarted.map')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 mt-1">
                <Navigation className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.locationTitle')}</h3>
                <p>
                  {t('gettingStarted.location')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-1">
                <Route className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.plannerTitle')}</h3>
                <p>
                  {t('gettingStarted.planner')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0 mt-1">
                <History className="w-5 h-5 text-teal-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">{t('gettingStarted.recentTitle')}</h3>
                <p>
                  {t('gettingStarted.recent')}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
          >
            {t('gettingStarted.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
};
