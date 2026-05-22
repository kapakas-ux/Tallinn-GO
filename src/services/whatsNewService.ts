import { version } from '../../package.json';

const STORAGE_KEY = 'tallinn_go_seen_version';

/** Get the current app version from package.json */
export function getCurrentVersion(): string {
  return version;
}

/** Check if the "What's New" popup should be shown */
export function shouldShowWhatsNew(): boolean {
  try {
    const seen = localStorage.getItem(STORAGE_KEY);
    const current = getCurrentVersion();
    return seen !== current;
  } catch {
    return true;
  }
}

/** Mark the current version as seen so popup never shows again */
export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, getCurrentVersion());
  } catch {}
}
