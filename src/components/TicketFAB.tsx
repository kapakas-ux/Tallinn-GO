import React from 'react';
import { Ticket } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const PILET_URL = 'https://pilet.ee';

export const TicketFAB = () => {
  const location = useLocation();
  
  if (location.pathname !== '/' && location.pathname !== '/stops') return null;

  const openTickets = async () => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: PILET_URL });
    } else {
      window.open(PILET_URL, '_blank');
    }
  };

  return (
    <button
      onClick={openTickets}
      className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all z-40 border-4 border-surface"
      title="pilet.ee"
    >
      <Ticket className="w-6 h-6" />
    </button>
  );
};
