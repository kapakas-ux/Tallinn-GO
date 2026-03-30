import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

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

    await LocalNotifications.schedule({
      notifications: [
        {
          title: `GO NOW: ${line} to ${destination}`,
          body: `Your bus from ${stopName} is arriving in ${minutesBefore} minutes!`,
          id: Math.floor(Math.random() * 1000000),
          schedule: { at: scheduleDate },
          sound: 'default',
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
