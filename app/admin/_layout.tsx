import { auth } from '@/lib/firebase';
import { Stack, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getCurrentUserRole } from '../functions';

export default function AdminLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        setChecking(false);
        return;
      }
      const role = await getCurrentUserRole();
      if (!role.is_admin) {
        router.replace('/(tabs)');
        setChecking(false);
        return;
      }
      setChecking(false);
    });
    return () => unsubAuth();
  }, [router]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-staff" />
      <Stack.Screen name="login-stats" />
    </Stack>
  );
}
