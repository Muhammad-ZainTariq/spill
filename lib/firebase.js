import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getDownloadURL, getStorage, ref, uploadBytes, uploadString } from 'firebase/storage';

// Your Firebase Web app config (same config works for iOS & Android in Expo)
const firebaseConfig = {
  apiKey: 'AIzaSyCXaLtZpMkWM0_NFJ5dOyt5_xe7xLau1D4',
  authDomain: 'spillll.firebaseapp.com',
  projectId: 'spillll',
  storageBucket: 'spillll.firebasestorage.app',
  messagingSenderId: '556048303589',
  appId: '1:556048303589:web:a2cabf4b34ec009fb19b0c',
  measurementId: 'G-D2DXG7KT55',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use AsyncStorage so auth state persists between app restarts
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (e) {
    if (e?.code === 'auth/already-initialized') return getAuth(app);
    throw e;
  }
})();
export const db = getFirestore(app);
export const storage = getStorage(app);
// Use same region as Cloud Functions (createStaffUser)
export const functions = getFunctions(app, 'us-central1');
export { getDownloadURL, ref, uploadBytes, uploadString };
export default app;
