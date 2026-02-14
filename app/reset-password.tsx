import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { auth } from '../lib/firebase';

// Firebase password reset is done via the link in email (opens in browser).
// If user lands here, just send them to login.
export default function ResetPassword() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: '#ec4899' }} />;
}
