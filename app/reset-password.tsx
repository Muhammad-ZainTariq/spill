import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase should have a session after opening the deep link.
    // If not, redirect to login.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
    });
  }, [router]);

  const handleUpdate = async () => {
    if (!password || !confirm) return;
    if (password !== confirm) {
      Alert.alert('Oops', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert('Error', error.message || 'Failed to update password');
      } else {
        Alert.alert('Success', 'Password updated. Please log in.');
        router.replace('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#ec4899' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 16 }}>Reset password</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 16 }}>
              <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>New password</Text>
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 12 }}>
                <TextInput
                  style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  placeholder="Enter new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
              </View>
              <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Confirm password</Text>
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 12 }}>
                <TextInput
                  style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={confirm}
                  onChangeText={setConfirm}
                  editable={!loading}
                />
              </View>
              <Pressable
                onPress={handleUpdate}
                disabled={loading}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                style={{ backgroundColor: loading ? '#c084fc' : '#ec4899', paddingVertical: 12, borderRadius: 12, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>{loading ? 'Updating...' : 'Update password'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}




