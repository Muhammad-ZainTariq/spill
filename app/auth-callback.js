import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../lib/firebase';

// Used if you add magic link or other redirect-based auth later. For email/password we just redirect to login.
export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      router.replace('/success');
    } else {
      router.replace('/login');
    }
  }, [router]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ec4899' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
