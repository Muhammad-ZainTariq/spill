import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { auth } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
const isAndroidExpoGo = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;
let notificationHandlerInitialized = false;

export function notificationsRuntimeSupported(): boolean {
  return !isAndroidExpoGo;
}

async function getNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (!notificationsRuntimeSupported()) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((module) => {
        if (!notificationHandlerInitialized) {
          module.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: true,
              shouldSetBadge: true,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          notificationHandlerInitialized = true;
        }
        return module;
      })
      .catch((error) => {
        console.warn('expo-notifications unavailable in current runtime', error);
        return null;
      });
  }
  return notificationsModulePromise;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    if (finalStatus !== 'granted') return null;
  }
  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
  ).data;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  return token;
}

export async function savePushTokenToFirestore(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      const registerPushToken = httpsCallable<{ token: string }, { ok: boolean }>(functions, 'registerExpoPushToken');
      await registerPushToken({ token });
    }
  } catch (e) {
    console.warn('Failed to save push token', e);
  }
}

/** Show the "real" notification (banner at top) when we get a game invite in-app so it's not only the center Alert */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
      },
      trigger: null,
    });
    return true;
  } catch (e) {
    console.warn('Failed to show local notification', e);
    return false;
  }
}

export async function addNotificationResponseListener(
  listener: (response: import('expo-notifications').NotificationResponse) => void
): Promise<{ remove: () => void } | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function setNotificationBadgeCount(count: number): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}

/** Clears banners / tray entries from this app (e.g. after acting on a game invite). */
export async function dismissAllAppNotifications(): Promise<void> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    /* Expo Go / web / unsupported presenter */
  }
}
