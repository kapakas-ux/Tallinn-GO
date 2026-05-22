import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { shouldShowWhatsNew, markWhatsNewSeen } from '../services/whatsNewService';

export const WhatsNewModal = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (shouldShowWhatsNew()) {
      // Small delay so the app renders first
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const handleClose = () => {
    markWhatsNewSeen();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="settings-panel w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="font-headline font-black text-xl text-primary">
            {t('whatsNew.title')}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          {(t('whatsNew.items', { returnObjects: true }) as unknown as string[] || []).map((item: string, i: number) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <p className="text-sm leading-relaxed text-on-surface-variant">{item}</p>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-outline-variant/20 bg-surface-container-low">
          <button
            onClick={handleClose}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors"
          >
            {t('whatsNew.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
};
