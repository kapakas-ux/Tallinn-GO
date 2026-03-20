import React from 'react';
import { Ticket } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export const TicketFAB = () => {
  const location = useLocation();
  
  // Only show on Dashboard or Stops
  if (location.pathname !== '/' && location.pathname !== '/stops') return null;

  return (
    <button className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all z-40 border-4 border-surface">
      <Ticket className="w-6 h-6" />
    </button>
  );
};
