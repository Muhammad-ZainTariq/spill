import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../lib/firebase';
import { getCurrentUserRole } from './functions';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/signup');
        return;
      }
      const role = await getCurrentUserRole();
      if (role.is_admin) {
        router.replace('/admin');
      } else {
        router.replace('/(tabs)');
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ec4899' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
