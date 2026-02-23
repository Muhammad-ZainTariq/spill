import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { auth, db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
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
      await setDoc(doc(db, 'users', uid), { expo_push_token: token }, { merge: true });
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
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Failed to show local notification', e);
  }
}
