import React, { useState } from 'react';
import { X, Play, Check } from 'lucide-react';
import { ALARM_SOUNDS, getSettings, saveSettings, previewSound, stopPreview } from '../services/settingsService';

interface Props { onClose: () => void; }

export const SettingsModal = ({ onClose }: Props) => {
  const handleClose = () => { stopPreview(); onClose(); };
  const [selectedSound, setSelectedSound] = useState(getSettings().alarmSound);

  const handleSelect = (id: string) => {
    setSelectedSound(id);
    saveSettings({ alarmSound: id });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-surface-container-lowest w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
          <h2 className="font-headline font-black text-2xl text-primary">Settings</h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
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
                      ? 'border-primary bg-primary/5'
                      : 'border-outline-variant/20 bg-surface-container-low hover:bg-surface-container-high'
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
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/20 bg-surface-container-low">
          <button onClick={handleClose} className="w-full py-3 bg-primary text-white rounded-xl font-bold font-headline hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
