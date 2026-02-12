import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

  export default function AuthCallback() {
    const router = useRouter();

    useEffect(() => {
      const handleAuthCallback = async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Auth callback error:', error.message);
          router.replace('/login');
        } else if (data.session) {
          router.replace('/success');
        } else {
          router.replace('/login');
        }
      };

      handleAuthCallback();
    }, []);

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ec4899' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }