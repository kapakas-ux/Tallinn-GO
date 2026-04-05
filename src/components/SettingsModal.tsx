import React, { useState } from 'react';
import { X, Play, Check } from 'lucide-react';
import { ALARM_SOUNDS, getSettings, saveSettings, previewSound, stopPreview } from '../services/settingsService';
import type { AppTheme } from '../services/settingsService';

interface Props { onClose: () => void; }

const THEMES: { id: AppTheme; label: string; desc: string; orb1: string; orb2: string; orb3: string }[] = [
  { id: 'daylight', label: 'Daylight', desc: 'Light & airy, sea accent',   orb1: '#b8d4e8', orb2: '#c9dce8', orb3: '#a8c8d8' },
  { id: 'plum',     label: 'Plum',    desc: 'Deep violet & magenta',       orb1: '#7c3aed', orb2: '#a21caf', orb3: '#4338ca' },
  { id: 'havgra',   label: 'Havgrå',  desc: 'Norwegian sea gray',          orb1: '#1a3f6b', orb2: '#0d4f4f', orb3: '#1e3550' },
  { id: 'latte',    label: 'Latte',   desc: 'Sand & caramel',              orb1: '#92400e', orb2: '#7c2d12', orb3: '#854d0e' },
];

export const SettingsModal = ({ onClose }: Props) => {
  const handleClose = () => { stopPreview(); onClose(); };
  const [selectedSound, setSelectedSound] = useState(getSettings().alarmSound);
  const [showFact, setShowFact] = useState(getSettings().showDailyFact);
  const [showFavoritesFirst, setShowFavoritesFirst] = useState(getSettings().showFavoritesFirst);
  const [activeTheme, setActiveTheme] = useState<AppTheme>(getSettings().theme);

  const handleSelect = (id: string) => {
    setSelectedSound(id);
    saveSettings({ alarmSound: id });
  };

  const handleTheme = (id: AppTheme) => {
    setActiveTheme(id);
    saveSettings({ theme: id });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-surface-container-lowest w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-outline-variant/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
          <h2 className="font-headline font-black text-2xl gradient-text">Settings</h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* Theme picker */}
          <div>
            <h3 className="font-headline font-bold text-sm text-secondary uppercase tracking-widest mb-3">
              Theme
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTheme(t.id)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all
                    ${activeTheme === t.id
                      ? 'border-primary scale-[1.03] shadow-lg'
                      : 'border-outline-variant/30 hover:border-outline-variant/60'
                    }`}
                >
                  {/* Mini orb preview */}
                  <div className="relative w-12 h-12 rounded-full overflow-hidden">
                    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 35%, ${t.orb1}, ${t.orb2} 55%, ${t.orb3})` }} />
                  </div>
                  <span className="font-headline font-bold text-xs text-on-surface leading-tight text-center">{t.label}</span>
                  <span className="font-label text-[9px] text-secondary leading-tight text-center">{t.desc}</span>
                  {activeTheme === t.id && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-headline font-bold text-sm text-secondary uppercase tracking-widest mb-3">
              Alert Sound
            </h3>
            <p className="text-xs text-secondary font-label mb-4 leading-relaxed">
              Choose the sound played when a departure alert fires. Press ▶ to preview.
            </p>
            <div className="space-y-2">
              {ALARM_SOUNDS.map((sound) => (
                <div
                  key={sound.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer
                    ${selectedSound === sound.id
                      ? 'border-primary bg-primary/10'
                      : 'border-black/8 bg-black/4 hover:bg-black/8'
                    }`}
                  onClick={() => handleSelect(sound.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                      ${selectedSound === sound.id ? 'border-primary bg-primary' : 'border-outline-variant'}`}>
                      {selectedSound === sound.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="font-headline font-bold text-sm text-primary">{sound.label}</span>
                  </div>
                  {sound.file && (
                    <button
                      onClick={(e) => { e.stopPropagation(); previewSound(sound.id); }}
                      className="p-2 rounded-full bg-surface-container-high hover:bg-primary/10 text-secondary hover:text-primary transition-colors active:scale-90"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Daily Fact toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-black/8 bg-black/4">
            <div>
              <p className="font-headline font-bold text-sm text-primary">Daily Transit Fact</p>
              <p className="font-label text-[10px] text-secondary mt-0.5">Show a fun fact on the dashboard each day</p>
            </div>
            <button
              onClick={() => {
                const next = !showFact;
                setShowFact(next);
                saveSettings({ showDailyFact: next });
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${showFact ? 'bg-primary' : 'bg-outline-variant/40'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showFact ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Show Favorites First toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-black/8 bg-black/4">
            <div>
              <p className="font-headline font-bold text-sm text-primary">Show Favorites First</p>
              <p className="font-label text-[10px] text-secondary mt-0.5">Display favorites above nearby stops</p>
            </div>
            <button
              onClick={() => {
                const next = !showFavoritesFirst;
                setShowFavoritesFirst(next);
                saveSettings({ showFavoritesFirst: next });
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${showFavoritesFirst ? 'bg-primary' : 'bg-outline-variant/40'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showFavoritesFirst ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-black/8 bg-black/4">
          <button onClick={handleClose} className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
