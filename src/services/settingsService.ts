const SETTINGS_KEY = 'tallinn_go_settings';

export interface AppSettings {
  alarmSound: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  alarmSound: 'default',
};

export const ALARM_SOUNDS = [
  { id: 'default', label: 'System Default', file: null },
  { id: 'skreet',  label: 'Skreet',         file: '/sounds/skreet.mp3' },
  { id: 'bell',    label: 'Bell',           file: '/sounds/bell.mp3' },
  { id: 'toot',    label: 'Toot',           file: '/sounds/toot.mp3' },
  { id: 'bibibi',  label: 'Bibibi',         file: '/sounds/bibibi.mp3' },
  { id: 'skreet2', label: 'Skreet2',        file: '/sounds/skreet2.mp3' },
];

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = getSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  } catch (e) {
    console.warn('Failed to save settings', e);
  }
}

export function previewSound(soundId: string): void {
  const sound = ALARM_SOUNDS.find(s => s.id === soundId);
  if (!sound?.file) return;
  try {
    const audio = new Audio(sound.file);
    audio.play();
  } catch (e) {
    console.warn('Could not play preview', e);
  }
}
