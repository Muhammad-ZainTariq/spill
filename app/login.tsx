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
  Modal,
  ScrollView,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showStopTouching, setShowStopTouching] = useState(false);
  const [showTherapistApply, setShowTherapistApply] = useState(false);
  const [showTherapistCode, setShowTherapistCode] = useState(false);
  const [therapistName, setTherapistName] = useState('');
  const [therapistEmail, setTherapistEmail] = useState('');
  const [therapistSpecialization, setTherapistSpecialization] = useState('');
  const [therapistNote, setTherapistNote] = useState('');
  const [therapistSubmitting, setTherapistSubmitting] = useState(false);
  const [therapistCode, setTherapistCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
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
          const exempt = data?.is_admin === true || data?.is_staff === true || data?.role === 'therapist';
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

  const handleSubmitTherapistRequest = useCallback(async () => {
    if (therapistSubmitting) return;
    if (!therapistName.trim() || !therapistEmail.trim()) {
      Alert.alert('Missing info', 'Please enter your name and email.');
      return;
    }
    setTherapistSubmitting(true);
    try {
      const submitFn = httpsCallable<
        { name: string; email: string; specialization?: string; note?: string },
        { ok: boolean; requestId: string }
      >(functions, 'submitTherapistRequest');
      const res = await submitFn({
        name: therapistName.trim(),
        email: therapistEmail.trim(),
        specialization: therapistSpecialization.trim() || undefined,
        note: therapistNote.trim() || undefined,
      });
      if (res.data?.ok) {
        Alert.alert(
          'Request received',
          'We received your therapist onboarding request. Our team will review it and email you next steps.'
        );
        setShowTherapistApply(false);
        setTherapistName('');
        setTherapistEmail('');
        setTherapistSpecialization('');
        setTherapistNote('');
      } else {
        Alert.alert('Error', 'Could not submit your request. Please try again later.');
      }
    } catch (err: any) {
      const code = err?.code ?? '';
      const msg = err?.message ?? '';
      if (code === 'functions/not-found' || msg.toLowerCase().includes('not found')) {
        Alert.alert(
          'Feature not available',
          'Therapist onboarding is not set up yet. Please ask the admin to deploy the Cloud Functions (submitTherapistRequest).'
        );
      } else {
        Alert.alert('Error', msg || 'Could not submit your request.');
      }
    } finally {
      setTherapistSubmitting(false);
    }
  }, [therapistSubmitting, therapistName, therapistEmail, therapistSpecialization, therapistNote]);

  const handleVerifyTherapistCode = useCallback(async () => {
    if (verifyingCode) return;
    if (!therapistCode.trim()) {
      Alert.alert('Missing code', 'Please enter the therapist code from your email.');
      return;
    }
    setVerifyingCode(true);
    try {
      const verifyFn = httpsCallable<
        { code: string },
        { ok: boolean; requestId: string; email?: string | null; name?: string | null; specialization?: string | null }
      >(
        functions,
        'verifyTherapistCode'
      );
      const res = await verifyFn({ code: therapistCode.trim() });
      if (res.data?.ok && res.data.requestId) {
        setShowTherapistCode(false);
        setTherapistCode('');
        router.push({
          pathname: '/therapist/signup',
          params: {
            requestId: res.data.requestId,
            email: res.data.email ?? '',
            name: res.data.name ?? '',
            specialization: res.data.specialization ?? '',
          },
        } as any);
      } else {
        Alert.alert('Invalid code', 'That code is invalid or expired.');
      }
    } catch (err: any) {
      const msg =
        err?.code === 'functions/not-found'
          ? 'That code is invalid or expired.'
          : err?.message || 'Could not verify code.';
      Alert.alert('Error', msg);
    } finally {
      setVerifyingCode(false);
    }
  }, [therapistCode, verifyingCode, router]);

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
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTherapistCode(true);
                }}
                style={{ paddingVertical: 8, alignItems: 'center', marginTop: 4 }}
              >
                <Text style={{ color: '#ec4899', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' }}>
                  I have a therapist code
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTherapistApply(true);
                }}
                style={{ paddingVertical: 6, alignItems: 'center', marginTop: 2 }}
              >
                <Text style={{ color: '#6b7280', fontSize: 13, fontWeight: '600' }}>
                  Apply as a therapist
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

        {/* Apply as therapist modal */}
        <Modal visible={showTherapistApply} animationType="slide" transparent onRequestClose={() => setShowTherapistApply(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 16 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 20,
                maxHeight: '80%',
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
                  Apply as therapist
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, textAlign: 'center' }}>
                  Tell us who you are and how you practice. Our team will review and email next steps.
                </Text>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Name</Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <TextInput
                      style={{ paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' }}
                      value={therapistName}
                      onChangeText={setTherapistName}
                      placeholder="Your full name"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Email</Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <TextInput
                      style={{ paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' }}
                      value={therapistEmail}
                      onChangeText={setTherapistEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Specialization (optional)</Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <TextInput
                      style={{ paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' }}
                      value={therapistSpecialization}
                      onChangeText={setTherapistSpecialization}
                      placeholder="e.g. CBT, couples therapy"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Anything else (optional)</Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <TextInput
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 15,
                        color: '#111827',
                        minHeight: 80,
                        textAlignVertical: 'top',
                      }}
                      multiline
                      value={therapistNote}
                      onChangeText={setTherapistNote}
                      placeholder="Share your experience, license, or how you want to use Spill."
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              </ScrollView>
              <View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'flex-end' }}>
                <Pressable
                  onPress={() => setShowTherapistApply(false)}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, marginRight: 8 }}
                >
                  <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitTherapistRequest}
                  disabled={therapistSubmitting}
                  style={{
                    backgroundColor: therapistSubmitting ? '#c4b5fd' : '#ec4899',
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    opacity: therapistSubmitting ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    {therapistSubmitting ? 'Sending...' : 'Submit request'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Therapist code modal */}
        <Modal visible={showTherapistCode} animationType="slide" transparent onRequestClose={() => setShowTherapistCode(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 16 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 20,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
                Enter therapist code
              </Text>
              <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, textAlign: 'center' }}>
                Paste the code you received in your email to continue onboarding.
              </Text>
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 }}>
                <TextInput
                  style={{ paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' }}
                  value={therapistCode}
                  onChangeText={setTherapistCode}
                  placeholder="74DCB21B-12E0-4103-BB81-86B1284EFAB"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Pressable onPress={() => setShowTherapistCode(false)} style={{ paddingVertical: 10, paddingHorizontal: 14, marginRight: 8 }}>
                  <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleVerifyTherapistCode}
                  disabled={verifyingCode}
                  style={{
                    backgroundColor: verifyingCode ? '#c4b5fd' : '#ec4899',
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    opacity: verifyingCode ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    {verifyingCode ? 'Checking...' : 'Continue'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
