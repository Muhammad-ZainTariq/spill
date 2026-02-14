import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../lib/firebase';

export default function ForgetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSendResetLink = async () => {
    if (!email?.trim() || loading) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Check your email', 'We sent a password reset link to ' + email.trim() + '. Use the link in the email to set a new password, then log in.');
      router.replace('/login');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        Alert.alert('No account', 'There is no account with this email. Try signing up.');
      } else {
        Alert.alert('Error', err.message || 'Failed to send reset email');
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
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 16 }}>Forgot password</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 16 }}>
              <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Email Address</Text>
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 12 }}>
                <TextInput
                  style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
                  placeholder="your.email@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!loading}
                />
              </View>
              <Pressable
                onPress={handleSendResetLink}
                disabled={loading || !email.trim()}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                style={{
                  backgroundColor: loading || !email.trim() ? '#c084fc' : '#ec4899',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: loading || !email.trim() ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                  {loading ? 'Sending...' : 'Send reset link'}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
                <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
