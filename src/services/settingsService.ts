const SETTINGS_KEY = 'tallinn_go_settings';

export type AppTheme = 'daylight' | 'plum' | 'havgra' | 'latte' | 'minimal';
export type AppLanguage = 'en' | 'et';

/** Detect the initial theme on first launch based on device dark mode preference.
 *  Once the user picks a theme manually it is persisted and this is ignored. */
export function getInitialTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.theme) return parsed.theme as AppTheme;
    }
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'plum';
  }
  return 'daylight';
}

export interface AppSettings {
  alarmSound: string;
  showDailyFact: boolean;
  showFavoritesFirst: boolean;
  largeText: boolean;
  clusterEnabled: boolean;
  clusterRadius: number;
  theme: AppTheme;
  language: AppLanguage;
}

const DEFAULT_SETTINGS: AppSettings = {
  alarmSound: 'default',
  showDailyFact: true,
  showFavoritesFirst: false,
  largeText: false,
  clusterEnabled: false,
  clusterRadius: 80,
  theme: 'daylight',
  language: 'en',
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
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    // First launch: detect system dark mode preference
    const initialTheme = getInitialTheme();
    const defaults = { ...DEFAULT_SETTINGS, theme: initialTheme };
    // Persist the detected theme so it doesn't flip on next load
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: initialTheme }));
    return defaults;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = getSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
    window.dispatchEvent(new Event('settings_changed'));
  } catch (e) {
    console.warn('Failed to save settings', e);
  }
}

let currentPreview: HTMLAudioElement | null = null;

export function previewSound(soundId: string): void {
  const sound = ALARM_SOUNDS.find(s => s.id === soundId);
  if (!sound?.file) return;
  try {
    if (currentPreview) {
      currentPreview.pause();
      currentPreview.currentTime = 0;
      currentPreview = null;
    }
    const audio = new Audio(sound.file);
    currentPreview = audio;
    audio.play().catch(e => console.warn('Could not play preview', e));
    audio.onended = () => { currentPreview = null; };
  } catch (e) {
    console.warn('Could not play preview', e);
  }
}

export function stopPreview(): void {
  if (currentPreview) {
    currentPreview.pause();
    currentPreview.currentTime = 0;
    currentPreview = null;
  }
}
