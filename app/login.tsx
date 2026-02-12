import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

  export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [showStopTouching, setShowStopTouching] = useState(false);
    const logoScale = useSharedValue(1);
    const router = useRouter();
    const handleMagicLink = useCallback(
      async () => {
        if (loading || !email) {
          Alert.alert("Oops!", "Enter your email first or wait for the current action to finish.");
          return;
        }

        setLoading(true);
        try {
          const emailRedirectTo = Linking.createURL('auth-callback');
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo,
              shouldCreateUser: true,
            },
          });

          if (error) {
            console.error('Magic link error:', error.message, error.code, error.status, JSON.stringify(error));
            Alert.alert('Error', error.message || 'Failed to send magic link');
          } else {
            Alert.alert('Check your email', 'We sent you a magic link. Open it on this device.');
          }
        } finally {
          setLoading(false);
        }
      },
      [email, loading]
    );

    const handleLogin = useCallback(
      async () => {
        if (loading || !email || !password) {
          Alert.alert("Oops!", "Please enter email and password or wait!");
          return;
        }

        setLoading(true);
        console.log('Logging in with:', email);
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        setLoading(false);

        if (error) {
          console.error('Login error:', error.message, error.code, error.status, JSON.stringify(error));
          const msg = error.message || 'Failed to log in';
          router.push({ pathname: '/error', params: { message: msg } });
        } else {
          router.replace('/success');
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
            behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                  onHoverIn={() => {
                    setShowStopTouching(true);
                    logoScale.value = withSequence(
                      withTiming(1.2, { duration: 250, easing: Easing.out(Easing.cubic) }),
                      withTiming(1.0, { duration: 750, easing: Easing.inOut(Easing.cubic) })
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
                <Text style={{
                  color: 'white',
                  fontSize: 36,
                  fontWeight: '800',
                  letterSpacing: -0.5,
                  fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined })
                }}>
                  Spill
                </Text>
                <View style={{ width: 48, height: 5, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, marginTop: 6, marginBottom: 12 }} />
                <Text style={{
                  color: 'rgba(255,255,255,0.9)',
                  textAlign: 'center',
                  fontSize: 14,
                  lineHeight: 22,
                  paddingHorizontal: 8,
                  fontFamily: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: undefined })
                }}>
                  Log in to share your drama anonymously!
                </Text>
              </View>

              <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, alignSelf: 'stretch' }}>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{
                    color: '#374151',
                    fontSize: 15,
                    fontWeight: '800',
                    marginBottom: 8,
                    marginLeft: 4,
                    fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined })
                  }}>
                    Email Address
                  </Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                    <TextInput
                      style={{
                        color: '#111827',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 16,
                        fontWeight: '600',
                        fontFamily: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: undefined })
                      }}
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
                  <Text style={{
                    color: '#374151',
                    fontSize: 15,
                    fontWeight: '800',
                    marginBottom: 8,
                    marginLeft: 4,
                    fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined })
                  }}>
                    Password
                  </Text>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                    <TextInput
                      style={{
                        color: '#111827',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 16,
                        fontWeight: '600',
                        fontFamily: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: undefined })
                      }}
                      placeholder="Enter password"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      editable={!loading}
                    />
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
                  <Text style={{
                    color: 'white',
                    fontWeight: '800',
                    fontSize: 17,
                    fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined })
                  }}>
                    {loading ? "Logging In..." : "Log In"}
                  </Text>
                </Pressable>
                {/* Magic link removed on login as requested */}
              </View>

              <View>
                <Text style={{
                  color: 'rgba(255,255,255,0.7)',
                  textAlign: 'center',
                  fontSize: 12,
                  paddingHorizontal: 16,
                  lineHeight: 18,
                  fontFamily: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: undefined })
                }}>
                  By logging in, you agree to our{"\n"}Terms of Service & Privacy Policy
                </Text>
                <Pressable onPress={() => router.push('/forgetpassword')} style={{ marginTop: 8, paddingVertical: 8 }}>
                  <Text style={{ color: 'white', textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' }}>
                    Forgot password?
                  </Text>
                </Pressable>
                <Pressable 
                  onPress={() => router.replace('/signup')}
                  style={{ marginTop: 16, paddingVertical: 8 }}
                >
                  <Text style={{
                    color: 'rgba(255,255,255,0.9)',
                    textAlign: 'center',
                    fontSize: 15,
                    textDecorationLine: 'underline',
                    fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined })
                  }}>
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