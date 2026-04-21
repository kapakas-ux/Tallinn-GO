import React, { useState, useEffect } from 'react';
import { Bell, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { getActiveAlerts, removeActiveAlert, ActiveAlert } from '../services/alertService';
import { stopAlertSound } from '../services/notificationService';
import { cn } from '../lib/utils';

interface ActiveAlertsProps {
  onAlertsChange?: () => void;
}

export const ActiveAlerts: React.FC<ActiveAlertsProps> = ({ onAlertsChange }) => {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const updateAlerts = () => {
      setAlerts(getActiveAlerts());
      setNow(Date.now());
    };

    updateAlerts();
    const interval = setInterval(updateAlerts, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  const handleRemove = (id: string) => {
    removeActiveAlert(id);
    stopAlertSound();
    if (onAlertsChange) {
      onAlertsChange();
    } else {
      setAlerts(getActiveAlerts());
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500 fill-amber-500/20" />
          <h3 className="font-headline font-bold text-sm text-primary uppercase tracking-widest">{t('alerts.title')}</h3>
        </div>
        <span className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest bg-surface-container-high px-2 py-0.5 rounded-full">
          {t('alerts.alert', { count: alerts.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <AnimatePresence mode="popLayout">
          {alerts.map((alert) => {
            const minutesLeft = Math.max(0, Math.ceil((alert.departureTimestamp - now) / 60000));
            
            return (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-amber-50 border border-amber-200/50 rounded-[20px] p-4 flex items-center justify-between editorial-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-label font-bold text-base shadow-sm">
                    {alert.line}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline font-extrabold text-primary text-sm leading-tight">
                      {t('alerts.to', { destination: alert.destination })}
                    </span>
                    <span className="font-label text-[9px] text-amber-700/70 font-bold uppercase tracking-widest mt-0.5">
                      {t('alerts.from', { stopName: alert.stopName })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span className="font-headline font-black text-xl text-amber-600">
                        {minutesLeft > 60 ? new Date(alert.departureTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : minutesLeft}
                        {minutesLeft <= 60 && <span className="text-[10px] ml-0.5 font-bold">min</span>}
                      </span>
                    </div>
                    <p className="text-[8px] font-label font-bold text-amber-700/50 uppercase tracking-widest">
                      {t('alerts.departing')}
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => handleRemove(alert.id)}
                    className="p-2 hover:bg-amber-100 rounded-full text-amber-700/40 hover:text-amber-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
