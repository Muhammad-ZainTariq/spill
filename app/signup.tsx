import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';
import { auth, db } from '../lib/firebase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [anonymousUsername, setAnonymousUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingName, setGeneratingName] = useState(false);
  const [showStopTouching, setShowStopTouching] = useState(false);
  const logoScale = useSharedValue(1);
  const [mode, setMode] = useState<'choice' | 'password' | 'magic' | 'verify_pending'>('choice');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const funnyWords = ['Silly', 'Goofy', 'Wacky', 'Zany', 'Bouncy', 'Bubbly', 'Chirpy', 'Dizzy', 'Fizzy', 'Giggly'];
  const cuteAnimals = ['Panda', 'Bunny', 'Puppy', 'Kitty', 'Duck', 'Frog', 'Bear', 'Pig', 'Bee', 'Bug'];
  const usernameTakenMessage = 'That anonymous username is already being used. Please choose another one.';

  const normalizeUsername = (username: string) => username.trim().toLowerCase();

  const checkUsernameExists = async (username: string, excludeUid?: string) => {
    try {
      const normalized = normalizeUsername(username);
      if (!normalized) return false;
      const [keySnap, exactSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('anonymous_username_key', '==', normalized), limit(1))),
        getDocs(query(collection(db, 'users'), where('anonymous_username', '==', username.trim()), limit(1))),
      ]);
      return [...keySnap.docs, ...exactSnap.docs].some((d) => d.id !== excludeUid);
    } catch {
      return false;
    }
  };

  const generateRandomUsername = () => {
    const word = funnyWords[Math.floor(Math.random() * funnyWords.length)];
    const animal = cuteAnimals[Math.floor(Math.random() * cuteAnimals.length)];
    const numbers = Math.floor(Math.random() * 999) + 1;
    return `${word.toLowerCase()}-${animal.toLowerCase()}-${numbers}`;
  };

  const generateUniqueUsername = async () => {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const username = generateRandomUsername();
      const exists = await checkUsernameExists(username);
      if (!exists) {
        setUsernameError('');
        setAnonymousUsername(username);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      attempts++;
    }
    setAnonymousUsername(`${Math.floor(Math.random() * 9999)}-${Date.now().toString().slice(-4)}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const generateAnonymousName = async () => {
    setGeneratingName(true);
    try {
      await generateUniqueUsername();
    } catch {
      setAnonymousUsername(generateRandomUsername());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } finally {
      setGeneratingName(false);
    }
  };

  const handleSignup = async () => {
    setUsernameError('');
    if (!email?.trim() || !password) {
      Alert.alert('Oops!', 'Please enter both email and password!');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Oops!', 'Password must be at least 6 characters.');
      return;
    }
    const username = anonymousUsername.trim();
    if (username && (await checkUsernameExists(username))) {
      setUsernameError(usernameTakenMessage);
      Alert.alert('Username taken', usernameTakenMessage);
      return;
    }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(user);
      setMode('verify_pending');
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/email-already-in-use') {
        Alert.alert('Email in use', 'This email is already registered. Go to Log in and sign in with your password.');
        router.replace('/login');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        Alert.alert('Weak password', 'Password should be at least 6 characters.');
      } else {
        Alert.alert('Sign up failed', err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async () => {
    setUsernameError('');
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Session expired', 'Please sign up again.');
      setMode('password');
      return;
    }
    setLoading(true);
    try {
      await user.reload();
      const updated = auth.currentUser;
      if (updated?.emailVerified) {
        const username = anonymousUsername.trim();
        if (username && (await checkUsernameExists(username, updated.uid))) {
          setUsernameError(usernameTakenMessage);
          setMode('password');
          Alert.alert('Username taken', usernameTakenMessage);
          return;
        }
        // Force token refresh so Firestore rules see email_verified: true
        await updated.getIdToken(true);
        await setDoc(doc(db, 'users', updated.uid), {
          display_name: displayName?.trim() || null,
          anonymous_username: username || null,
          anonymous_username_key: username ? normalizeUsername(username) : null,
          avatar_url: null,
          is_premium: false,
          premium_activated_at: null,
          premium_expires_at: null,
          is_admin: false,
          is_staff: false,
          created_at: new Date().toISOString(),
        });
        Alert.alert('All set!', 'Your email is verified. You can now use the app.');
        router.replace('/(tabs)');
      } else {
        Alert.alert('Not verified yet', 'Click the link we sent to your email, then tap "I verified" again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not check verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#ec4899' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 16 }}>
              <View style={{ alignItems: 'center', marginBottom: 64 }}>
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
                  style={{ marginBottom: 24 }}
                  hitSlop={10}
                >
                  <Animated.View style={useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }))}>
                    <Image
                      source={showStopTouching ? require('@/assets/images/stop-touching.png') : require('@/assets/images/logo12.png')}
                      style={{ width: 140, height: 140, borderRadius: 28 }}
                      contentFit="contain"
                    />
                  </Animated.View>
                </Pressable>
                <Text style={{ color: 'white', fontSize: 48, fontWeight: '800', letterSpacing: -1 }}>Spill</Text>
                <View style={{ width: 64, height: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, marginTop: 8, marginBottom: 24 }} />
                <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 18, lineHeight: 28, paddingHorizontal: 16 }}>
                  Join to share your drama anonymously!
                </Text>
              </View>

              {mode === 'choice' && (
                <View style={{ paddingHorizontal: 20, width: '100%', alignItems: 'center' }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
                    <Text style={{ color: '#374151', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' }}>Sign up</Text>
                    <Pressable
                      onPress={() => setMode('password')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                      style={{ backgroundColor: '#ec4899', paddingVertical: 18, borderRadius: 16, alignItems: 'center' }}
                    >
                      <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Sign up with password</Text>
                    </Pressable>
                    <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 14, paddingVertical: 8, alignItems: 'center' }}>
                      <Text style={{ color: '#ec4899', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' }}>
                        Already have an account? Log in
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {mode === 'password' && (
                <View style={{ paddingHorizontal: 20, width: '100%', alignItems: 'center' }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: tokens.colors.textSecondary, fontSize: 15, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Display Name (Optional)</Text>
                    <View style={{ backgroundColor: tokens.colors.surfaceOverlay, borderRadius: 12, borderWidth: 1, borderColor: tokens.colors.border, overflow: 'hidden' }}>
                      <TextInput
                        style={{ color: tokens.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '400' }}
                        placeholder="Your display name"
                        placeholderTextColor={tokens.colors.textMuted}
                        value={displayName}
                        onChangeText={setDisplayName}
                        editable={!loading}
                      />
                    </View>
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: tokens.colors.textSecondary, fontSize: 15, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Anonymous Username</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, backgroundColor: tokens.colors.surfaceOverlay, borderRadius: 12, borderWidth: 1, borderColor: tokens.colors.border, overflow: 'hidden' }}>
                        <TextInput
                          style={{ color: tokens.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '400' }}
                          placeholder="mysterious-tiger-123"
                          placeholderTextColor={tokens.colors.textMuted}
                          value={anonymousUsername}
                          onChangeText={(text) => {
                            setAnonymousUsername(text);
                            if (usernameError) setUsernameError('');
                          }}
                          editable={!loading}
                        />
                      </View>
                      <Pressable
                        onPress={generateAnonymousName}
                        disabled={loading || generatingName}
                        style={{
                          backgroundColor: generatingName ? '#a78bfa' : '#8b5cf6',
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: loading || generatingName ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{generatingName ? '...' : 'Generate'}</Text>
                      </Pressable>
                    </View>
                    {!!usernameError && (
                      <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '700', marginTop: 8, marginLeft: 4 }}>
                        {usernameError}
                      </Text>
                    )}
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: tokens.colors.textSecondary, fontSize: 15, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Email Address</Text>
                    <View style={{ backgroundColor: tokens.colors.surfaceOverlay, borderRadius: 12, borderWidth: 1, borderColor: tokens.colors.border, overflow: 'hidden' }}>
                      <TextInput
                        style={{ color: tokens.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '400' }}
                        placeholder="you@example.com"
                        placeholderTextColor={tokens.colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        editable={!loading}
                      />
                    </View>
                  </View>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ color: tokens.colors.textSecondary, fontSize: 15, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Password (min 6 characters)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.colors.surfaceOverlay, borderRadius: 12, borderWidth: 1, borderColor: tokens.colors.border, overflow: 'hidden' }}>
                      <TextInput
                        style={{ flex: 1, color: tokens.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '400' }}
                        placeholder="Password"
                        placeholderTextColor={tokens.colors.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        editable={!loading}
                      />
                      <Pressable onPress={() => { setShowPassword((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                        <Feather name={showPassword ? 'eye-off' : 'eye'} size={22} color={tokens.colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                  <Pressable
                    onPress={handleSignup}
                    disabled={loading}
                    onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                    style={{ backgroundColor: loading ? '#c084fc' : '#ec4899', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, opacity: loading ? 0.6 : 1 }}
                  >
                    <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>{loading ? 'Signing Up...' : 'Sign Up'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode('choice')} style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
                  </Pressable>
                  <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 14, paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ color: '#ec4899', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' }}>
                      Already have an account? Log in
                    </Text>
                  </Pressable>
                  </View>
                </View>
              )}

              {mode === 'verify_pending' && (
                <View style={{ paddingHorizontal: 20, width: '100%', alignItems: 'center' }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
                    <Text style={{ color: '#374151', fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>Verify your email</Text>
                    <Text style={{ color: '#6b7280', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 }}>
                      We sent a verification link to {email || 'your email'}. Open the link in your email, then tap the button below.
                    </Text>
                    <Pressable
                      onPress={handleVerified}
                      disabled={loading}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                      style={{ backgroundColor: loading ? '#c084fc' : '#ec4899', paddingVertical: 16, borderRadius: 12, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
                    >
                      <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>{loading ? 'Checking...' : 'I verified'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setMode('password')} style={{ marginTop: 14, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 12, paddingHorizontal: 32, lineHeight: 20, marginTop: 20 }}>
                By signing up, you agree to our Terms of Service & Privacy Policy
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
