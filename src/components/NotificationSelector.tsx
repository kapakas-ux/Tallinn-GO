import React, { useRef, useState, useLayoutEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Stop, Arrival } from '../types';
import { scheduleDepartureNotification } from '../services/notificationService';
import { addActiveAlert } from '../services/alertService';

interface NotificationSelectorProps {
  stop: Stop;
  arrival: Arrival;
  onClose: () => void;
  onScheduled: () => void;
}

export const NotificationSelector = ({ stop, arrival, onClose, onScheduled }: NotificationSelectorProps) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [openAbove, setOpenAbove] = useState(false);

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // If popup bottom would go below the viewport minus navbar height (~5rem = 80px)
    if (rect.bottom > window.innerHeight - 90) {
      setOpenAbove(true);
    }
  }, []);
  const handleSchedule = async (minutesBefore: number) => {
    const success = await scheduleDepartureNotification(
      stop.name,
      arrival.line,
      arrival.destination,
      arrival.minutes,
      minutesBefore
    );
    
    if (success) {
      // Add to active alerts for dashboard display
      addActiveAlert({
        id: Math.random().toString(36).substr(2, 9),
        stopId: stop.id,
        stopName: stop.name,
        line: arrival.line,
        destination: arrival.destination,
        departureTimestamp: Date.now() + arrival.minutes * 60 * 1000,
        minutesBefore
      });
      onScheduled();
    }
    onClose();
  };

  return (
    <>
      {/* Invisible overlay to catch outside clicks */}
      <div 
        className="fixed inset-0 z-[99]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <motion.div
        ref={popupRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`absolute right-0 z-[100] bg-surface-container-lowest editorial-shadow rounded-2xl p-4 w-48 border border-outline-variant/20 shadow-2xl ${openAbove ? 'bottom-full mb-2' : 'top-0 mt-12'}`}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-headline font-bold text-xs text-primary uppercase tracking-widest">Set Alert</h4>
        <button onClick={onClose} className="text-secondary hover:text-primary">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-secondary mb-4 leading-tight">
        Notify me before {arrival.line} to {arrival.destination} departs from {stop.name}.
      </p>
      <div className="space-y-2">
        <button
          onClick={() => handleSchedule(5)}
          className="w-full py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Bell className="w-3 h-3" /> 5 Minutes Before
        </button>
        <button
          onClick={() => handleSchedule(10)}
          className="w-full py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Bell className="w-3 h-3" /> 10 Minutes Before
        </button>
        <button
          onClick={() => handleSchedule(15)}
          className="w-full py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Bell className="w-3 h-3" /> 15 Minutes Before
        </button>
      </div>
      </motion.div>
    </>
  );
};
