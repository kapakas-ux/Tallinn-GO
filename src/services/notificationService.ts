import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { getSettings, ALARM_SOUNDS } from './settingsService';

export async function requestBatteryOptimisationExemption(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Opens the system battery optimisation settings page for this app.
    // The user can tap "Don't optimise" to ensure exact alarms fire on time.
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({
      url: 'package:ee.tallinngo.app' // replace with your actual package name
    });
  } catch (e) {
    console.warn('Could not open battery settings', e);
  }
}

export const scheduleDepartureNotification = async (
  stopName: string,
  line: string,
  destination: string,
  minutesToDeparture: number,
  minutesBefore: number
) => {
  if (!Capacitor.isNativePlatform()) {
    // Fallback for web
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const delayMs = (minutesToDeparture - minutesBefore) * 60 * 1000;
          if (delayMs > 0) {
            setTimeout(() => {
              new Notification(`GO NOW: ${line} to ${destination}`, {
                body: `Your bus from ${stopName} is arriving in ${minutesBefore} minutes!`,
                icon: '/logo.png'
              });
            }, delayMs);
          }
        }
      } catch (e) {
        console.warn("Notification permission error", e);
      }
    }
    return true;
  }

  try {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return true;

    const scheduleDate = new Date();
    scheduleDate.setSeconds(scheduleDate.getSeconds() + (minutesToDeparture - minutesBefore) * 60);

    if (scheduleDate <= new Date()) return true;

    // ─── NEW: resolve selected alarm sound ────────────────────────────────
    const { alarmSound } = getSettings();
    const soundEntry = ALARM_SOUNDS.find(s => s.id === alarmSound);
    // Android: sound filename (no extension) must exist in res/raw/
    const sound = soundEntry?.id === 'default' || !soundEntry?.file
      ? 'default'
      : soundEntry.id;
    // ──────────────────────────────────────────────────────────────────────

    await LocalNotifications.schedule({
      notifications: [
        {
          title: `GO NOW: ${line} to ${destination}`,
          body: `Your bus from ${stopName} is arriving in ${minutesBefore} minutes!`,
          id: Math.floor(Math.random() * 1000000),
          schedule: { at: scheduleDate },
          sound,
          attachments: [],
          actionTypeId: '',
          extra: null
        }
      ]
    });
    return true;
  } catch (err) {
    console.error('Failed to schedule notification:', err);
    return true;
  }
};
