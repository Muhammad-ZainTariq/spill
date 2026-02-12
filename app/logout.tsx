import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Logout() {
  const router = useRouter();

  useEffect(() => {
    const doLogout = async () => {
      try {
        await supabase.auth.signOut();
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




