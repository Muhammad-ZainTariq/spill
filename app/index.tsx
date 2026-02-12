import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

  export default function Index() {
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/signup');
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/signup');
        }
      });

      return () => subscription.unsubscribe();
    }, []);

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ec4899' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }