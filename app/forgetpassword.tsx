import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type Step = 'email' | 'code' | 'reset';

export default function ForgetPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSendCode = async () => {
    if (!email || loading) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // Use signInWithOtp for password recovery - this will send a 6-digit code
      // if Supabase is configured to use OTP codes instead of magic links
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          // Specify that this is for password recovery
          data: {
            type: 'recovery'
          }
        },
      });

      if (error) {
        Alert.alert('Error', error.message || 'Failed to send code');
      } else {
        Alert.alert('Code Sent', 'Check your email for a 6-digit code');
        setStep('code');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6 || loading) return;

    setLoading(true);
    try {
      // Verify the OTP code
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email', // OTP type for email verification
      });

      if (error) {
        Alert.alert('Invalid Code', error.message || 'The code you entered is incorrect. Please try again.');
        setCode(''); // Clear the code on error
      } else if (data?.session) {
        // Code verified successfully, now we can reset the password
        Alert.alert('Code Verified', 'Now you can reset your password');
        setStep('reset');
      } else {
        Alert.alert('Error', 'Verification failed. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to verify code');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password || !confirmPassword || loading) return;
    
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords Don\'t Match', 'Please make sure both passwords are the same');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) {
        Alert.alert('Error', error.message || 'Failed to update password');
      } else {
        Alert.alert('Success', 'Password updated successfully. Please log in.');
        router.replace('/login');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'code') {
      setStep('email');
      setCode('');
    } else if (step === 'reset') {
      setStep('code');
      setPassword('');
      setConfirmPassword('');
    } else {
      router.back();
    }
  };

  const renderEmailStep = () => (
    <>
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
          onPress={handleSendCode}
          disabled={loading || !email.trim()}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          style={{ 
            backgroundColor: (loading || !email.trim()) ? '#c084fc' : '#ec4899', 
            paddingVertical: 12, 
            borderRadius: 12, 
            alignItems: 'center', 
            opacity: (loading || !email.trim()) ? 0.6 : 1 
          }}
        >
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
            {loading ? 'Sending...' : 'Send code'}
          </Text>
        </Pressable>
        <Pressable onPress={handleBack} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
        </Pressable>
      </View>
    </>
  );

  const renderCodeStep = () => (
    <>
      <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 16 }}>Enter code</Text>
      <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 16 }}>
        <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>
          Enter the 6-digit code sent to {email}
        </Text>
        <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 12 }}>
          <TextInput
            style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, textAlign: 'center', letterSpacing: 8 }}
            placeholder="000000"
            placeholderTextColor="#9CA3AF"
            value={code}
            onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />
        </View>
        <Pressable
          onPress={handleVerifyCode}
          disabled={loading || code.length !== 6}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          style={{ 
            backgroundColor: (loading || code.length !== 6) ? '#c084fc' : '#ec4899', 
            paddingVertical: 12, 
            borderRadius: 12, 
            alignItems: 'center', 
            opacity: (loading || code.length !== 6) ? 0.6 : 1 
          }}
        >
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
            {loading ? 'Verifying...' : 'Verify code'}
          </Text>
        </Pressable>
        <Pressable onPress={handleBack} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
        </Pressable>
      </View>
    </>
  );

  const renderResetStep = () => (
    <>
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
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
          />
        </View>
        <Pressable
          onPress={handleResetPassword}
          disabled={loading || !password || !confirmPassword}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          style={{ 
            backgroundColor: (loading || !password || !confirmPassword) ? '#c084fc' : '#ec4899', 
            paddingVertical: 12, 
            borderRadius: 12, 
            alignItems: 'center', 
            opacity: (loading || !password || !confirmPassword) ? 0.6 : 1 
          }}
        >
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
            {loading ? 'Updating...' : 'Reset password'}
          </Text>
        </Pressable>
        <Pressable onPress={handleBack} style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#ec4899' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
            {step === 'email' && renderEmailStep()}
            {step === 'code' && renderCodeStep()}
            {step === 'reset' && renderResetStep()}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
