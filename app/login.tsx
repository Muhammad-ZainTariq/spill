import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showStopTouching, setShowStopTouching] = useState(false);
  const logoScale = useSharedValue(1);
  const router = useRouter();

  const handleLogin = useCallback(
    async () => {
      if (loading || !email || !password) {
        Alert.alert('Oops!', 'Please enter email and password or wait!');
        return;
      }

      setLoading(true);
      try {
        const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!user.emailVerified) {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          const data = userSnap.data();
          const exempt = data?.is_admin === true || data?.is_staff === true;
          if (!exempt) {
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
            Alert.alert('Verify your email', 'We sent you a verification link when you signed up. Open that link in your email, then try logging in again.');
            return;
          }
        }
        const { recordLogin } = await import('./functions');
        await recordLogin();
        router.replace('/success');
      } catch (err: any) {
        const code = err?.code;
        const msg = code === 'auth/user-not-found' || code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : code === 'auth/invalid-email'
            ? 'Invalid email address.'
            : err?.message || 'Failed to log in';
        router.push({ pathname: '/error', params: { message: msg } });
      } finally {
        setLoading(false);
      }
    },
    [email, password, loading, router]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#ec4899' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 16, justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center' }}>
              <Pressable
                onPressIn={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowStopTouching(true);
                  logoScale.value = withSequence(
                    withTiming(1.3, { duration: 300, easing: Easing.out(Easing.cubic) }),
                    withTiming(1.0, { duration: 700, easing: Easing.inOut(Easing.cubic) })
                  );
                  setTimeout(() => setShowStopTouching(false), 1000);
                }}
                hitSlop={10}
              >
                <Animated.View style={useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }))}>
                  <Image
                    source={showStopTouching ? require('@/assets/images/stop-touching.png') : require('@/assets/images/logo12.png')}
                    style={{ width: 120, height: 120, borderRadius: 24, marginBottom: 12 }}
                    contentFit="contain"
                  />
                </Animated.View>
              </Pressable>
              <Text style={{ color: 'white', fontSize: 36, fontWeight: '800', letterSpacing: -0.5 }}>
                Spill
              </Text>
              <View style={{ width: 48, height: 5, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, marginTop: 6, marginBottom: 12 }} />
              <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 14, lineHeight: 22, paddingHorizontal: 8 }}>
                Log in to share your drama anonymously!
              </Text>
            </View>

            <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, alignSelf: 'stretch' }}>
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>Email Address</Text>
                <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                  <TextInput
                    style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600' }}
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
              </View>
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>Password</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                  <TextInput
                    style={{ flex: 1, color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600' }}
                    placeholder="Enter password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                  />
                  <Pressable onPress={() => { setShowPassword((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={22} color="#6b7280" />
                  </Pressable>
                </View>
              </View>
              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#c084fc' : '#ec4899',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginBottom: 8,
                  opacity: loading ? 0.6 : 1,
                }}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>
                  {loading ? 'Logging In...' : 'Log In'}
                </Text>
              </Pressable>
            </View>

            <View>
              <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 12, paddingHorizontal: 16, lineHeight: 18 }}>
                By logging in, you agree to our Terms of Service & Privacy Policy
              </Text>
              <Pressable onPress={() => router.push('/forgetpassword')} style={{ marginTop: 8, paddingVertical: 8 }}>
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' }}>
                  Forgot password?
                </Text>
              </Pressable>
              <Pressable onPress={() => router.replace('/signup')} style={{ marginTop: 16, paddingVertical: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 15, textDecorationLine: 'underline' }}>
                  Don't have an account? Sign up
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
