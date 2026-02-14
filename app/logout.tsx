import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../lib/firebase';

export default function Logout() {
  const router = useRouter();

  useEffect(() => {
    const doLogout = async () => {
      try {
        await signOut(auth);
      } finally {
        router.replace('/login');
      }
    };
    doLogout();
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ec4899' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
