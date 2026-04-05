import React from 'react';
import { X, Star, Bell, MapPin, Navigation, Clock } from 'lucide-react';

interface GettingStartedModalProps {
  onClose: () => void;
}

export const GettingStartedModal = ({ onClose }: GettingStartedModalProps) => {
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
          <h2 className="font-headline font-black text-2xl text-primary">Getting Started</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto font-sans text-sm text-on-surface-variant space-y-6">
          <p className="text-base">Welcome to GO NOW! Here's a quick guide to help you navigate the app.</p>
          
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1">
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">Real-Time Data</h3>
                <p>
                  When you see the <span className="font-headline font-black text-primary text-lg ml-1">5<span className="text-sm font-medium text-emerald-500 animate-pulse">min</span></span> indicator pulsing in green, it means the bus has real-time GPS data and the arrival time is highly accurate.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-1">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">Favorites</h3>
                <p>
                  Tap the star icon next to any stop to add it to your favorites. You can even customize the name and add an emoji for quick recognition on your dashboard!
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-1">
                <Bell className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">Notifications</h3>
                <p>
                  For departures more than 15 minutes away, tap the bell icon to set a reminder. We'll notify you when it's time to leave.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-1">
                <MapPin className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">Map View</h3>
                <p>
                  Tap the map pin icon to view a stop's exact location on the map, or tap on a departure to see the vehicle's live route.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 mt-1">
                <Navigation className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base mb-1">Live Location</h3>
                <p>
                  Enable GPS to automatically see the closest stop and its live departures right when you open the app.
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
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
