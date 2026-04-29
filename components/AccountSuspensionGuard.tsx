import { auth, db } from '@/lib/firebase';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

export default function AccountSuspensionGuard() {
  const router = useRouter();
  const shownRef = useRef(false);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      unsubProfile = null;
      shownRef.current = false;
      if (!user) return;

      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        async (snap) => {
          if (snap.data()?.account_disabled !== true || shownRef.current) return;
          shownRef.current = true;
          try {
            await signOut(auth);
          } catch {}
          Alert.alert('Account suspended', 'Your account has been suspended by admin.');
          router.replace('/login');
        },
        () => {}
      );
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, [router]);

  return null;
}
