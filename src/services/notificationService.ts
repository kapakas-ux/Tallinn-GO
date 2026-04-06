import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { getSettings, ALARM_SOUNDS } from './settingsService';
import i18next from 'i18next';

// Strong vibration pattern for departure alerts (ms): pause-vibrate-pause-vibrate...
// Pattern: short burst, pause, long burst, pause, short burst
const ALERT_VIBRATION_PATTERN = [0, 200, 100, 400, 100, 200];
const VIBRATION_CYCLE_MS = ALERT_VIBRATION_PATTERN.reduce((a, b) => a + b, 0) + 500; // pattern duration + pause

let vibrationInterval: ReturnType<typeof setInterval> | null = null;

function startContinuousVibration() {
  stopContinuousVibration();
  if (!navigator.vibrate) return;
  navigator.vibrate(ALERT_VIBRATION_PATTERN);
  vibrationInterval = setInterval(() => {
    navigator.vibrate(ALERT_VIBRATION_PATTERN);
  }, VIBRATION_CYCLE_MS);
}

function stopContinuousVibration() {
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (navigator.vibrate) {
    navigator.vibrate(0); // cancel any ongoing vibration
  }
}

// Register notification listeners for vibration on Android
let listenerRegistered = false;
function registerVibrationListener() {
  if (listenerRegistered || !Capacitor.isNativePlatform()) return;
  listenerRegistered = true;

  // Start buzzing when notification fires
  LocalNotifications.addListener('localNotificationReceived', () => {
    startContinuousVibration();
  });

  // Stop buzzing when user taps or dismisses
  LocalNotifications.addListener('localNotificationActionPerformed', () => {
    stopContinuousVibration();
  });
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
              new Notification(i18next.t('notifications.title', { line, destination }), {
                body: i18next.t('notifications.body', { stopName, minutes: minutesBefore }),
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

    registerVibrationListener();

    const scheduleDate = new Date();
    scheduleDate.setSeconds(scheduleDate.getSeconds() + (minutesToDeparture - minutesBefore) * 60);

    if (scheduleDate <= new Date()) return true;

    // ─── Resolve selected alarm sound ─────────────────────────────────────
    const { alarmSound } = getSettings();
    const soundEntry = ALARM_SOUNDS.find(s => s.id === alarmSound);
    const isCustom = soundEntry && soundEntry.id !== 'default' && !!soundEntry.file;
    // Android 8+: sound is set on the notification channel, not per-notification.
    // We create one channel per sound so changing the setting takes effect immediately.
    const channelId = isCustom ? `departure_alert_${soundEntry!.id}` : 'departure_alert_default';
    const soundFile = isCustom ? soundEntry!.id : undefined; // filename without extension in res/raw/

    await LocalNotifications.createChannel({
      id: channelId,
      name: 'Departure Alerts',
      ...(soundFile ? { sound: soundFile } : {}),
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    // ──────────────────────────────────────────────────────────────────────

    await LocalNotifications.schedule({
      notifications: [
        {
          title: i18next.t('notifications.title', { line, destination }),
          body: i18next.t('notifications.body', { stopName, minutes: minutesBefore }),
          id: Math.floor(Math.random() * 1000000),
          schedule: { at: scheduleDate },
          channelId,
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
