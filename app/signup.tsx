import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from "react";
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
} from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

  export default function Signup() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [anonymousUsername, setAnonymousUsername] = useState("");
    const [loading, setLoading] = useState(false);
    const [generatingName, setGeneratingName] = useState(false);
    const [showStopTouching, setShowStopTouching] = useState(false);
    const logoScale = useSharedValue(1);
    const [mode, setMode] = useState<'choice' | 'password' | 'magic'>('choice');
    const router = useRouter();

    const generateHardcodedName = () => {
      const funnyWords = [
        'Silly', 'Goofy', 'Wacky', 'Zany', 'Bouncy', 'Bubbly', 'Chirpy', 'Dizzy', 'Fizzy', 'Giggly',
        'Happy', 'Jolly', 'Lively', 'Peppy', 'Silly', 'Snappy', 'Spunky', 'Wiggly', 'Zippy', 'Bouncy'
      ];
      const cuteAnimals = [
        'Panda', 'Bunny', 'Puppy', 'Kitty', 'Duck', 'Frog', 'Bear', 'Pig', 'Bee', 'Bug',
        'Fish', 'Bird', 'Cat', 'Dog', 'Cow', 'Hen', 'Ant', 'Bat', 'Rat', 'Bat'
      ];
      const numbers = Math.floor(Math.random() * 999) + 1;
      
      const word = funnyWords[Math.floor(Math.random() * funnyWords.length)];
      const animal = cuteAnimals[Math.floor(Math.random() * cuteAnimals.length)];
      const username = `${word.toLowerCase()}-${animal.toLowerCase()}-${numbers}`;
      
      setAnonymousUsername(username);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const checkUsernameExists = async (username: string) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('anonymous_username')
          .eq('anonymous_username', username)
          .single();
        
        return !error && data; // Returns true if username exists
      } catch (error) {
        return false; // If error, assume it doesn't exist
      }
    };

    const generateUniqueUsername = async () => {
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        const username = await generateRandomUsername();
        const exists = await checkUsernameExists(username);
        
        if (!exists) {
          setAnonymousUsername(username);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        }
        
        attempts++;
      }
      
      // If we can't find a unique one, just use the last generated one with timestamp
      const fallbackUsername = `${Math.floor(Math.random() * 9999)}-${Date.now().toString().slice(-4)}`;
      setAnonymousUsername(fallbackUsername);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const generateRandomUsername = async () => {
      try {
        // Get funny words from API
        const response = await fetch('https://api.datamuse.com/words?ml=funny&max=10');
        const funnyWords = await response.json();
        
        const animalResponse = await fetch('https://api.datamuse.com/words?ml=cute&max=10');
        const cuteWords = await animalResponse.json();
        
        const word = funnyWords[Math.floor(Math.random() * funnyWords.length)].word;
        const animal = cuteWords[Math.floor(Math.random() * cuteWords.length)].word;
        const numbers = Math.floor(Math.random() * 999) + 1;
        
        return `${word}-${animal}-${numbers}`;
      } catch (error) {
        // Fallback to hardcoded funny names
        const funnyWords = ['Silly', 'Goofy', 'Wacky', 'Zany', 'Bouncy', 'Bubbly', 'Chirpy', 'Dizzy', 'Fizzy', 'Giggly'];
        const cuteAnimals = ['Panda', 'Bunny', 'Puppy', 'Kitty', 'Duck', 'Frog', 'Bear', 'Pig', 'Bee', 'Bug'];
        const numbers = Math.floor(Math.random() * 999) + 1;
        
        const word = funnyWords[Math.floor(Math.random() * funnyWords.length)];
        const animal = cuteAnimals[Math.floor(Math.random() * cuteAnimals.length)];
        return `${word.toLowerCase()}-${animal.toLowerCase()}-${numbers}`;
      }
    };

    const generateAnonymousName = async () => {
      setGeneratingName(true);
      try {
        await generateUniqueUsername();
      } catch (error) {
        console.log('Error generating unique username:', error);
        generateHardcodedName(); // Final fallback
      } finally {
        setGeneratingName(false);
      }
    };

    const handleSignup = async () => {
      if (!email || !password) {
        Alert.alert("Oops!", "Please enter both email and password!");
        return;
      }

      setLoading(true);
      console.log('Signing up with:', email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      setLoading(false);

      if (error) {
        console.error('Signup error:', error.message, error.code, error.status, JSON.stringify(error));

        if (error.code === 'over_email_send_rate_limit') {
          router.push({ pathname: '/error', params: { message: 'Too many attempts. Please wait and try again.' } });
        } else if (error.code === 'user_already_registered' || error.code === 'user_already_exists') {
          router.push({ pathname: '/error', params: { message: 'Email already registered. Try logging in instead.' } });
        } else {
          router.push({ pathname: '/error', params: { message: error.message || 'Failed to sign up' } });
        }
      } else {
        console.log('Signup success:', data);
        
        // Create profile after successful signup
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              display_name: displayName || null,
              anonymous_username: anonymousUsername || null,
            });

          if (profileError) {
            console.error('Profile creation error:', profileError);
          }
        }
        
        Alert.alert("Success!", "Please check your email for confirmation. You can log in after confirmation.");
        router.replace('/login');
      }
    };

    const handleMagicLink = async () => {
      if (!email) {
        Alert.alert("Oops!", "Please enter your email first!");
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
          console.error('Magic link signup error:', error.message, error.code, error.status, JSON.stringify(error));
          Alert.alert('Error', error.message || 'Failed to send magic link');
        } else {
          Alert.alert('Check your email', 'We sent you a magic link. Open it on this device.');
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, backgroundColor: '#ec4899' }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
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
                    onHoverIn={() => {
                      setShowStopTouching(true);
                      logoScale.value = withSequence(
                        withTiming(1.2, { duration: 250, easing: Easing.out(Easing.cubic) }),
                        withTiming(1.0, { duration: 750, easing: Easing.inOut(Easing.cubic) })
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
                  <Text style={{ color: 'white', fontSize: 48, fontWeight: '800', letterSpacing: -1, fontFamily: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: undefined }) }}>
                    Spill
                  </Text>
                  <View style={{ width: 64, height: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, marginTop: 8, marginBottom: 24 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 18, lineHeight: 28, paddingHorizontal: 16, fontFamily: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: undefined }) }}>
                    Join to share your drama anonymously!
                  </Text>
                </View>
                {mode === 'choice' && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginBottom: 20, alignSelf: 'stretch' }}>
                    <Text style={{ color: '#374151', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' }}>
                      Choose how to sign up
                    </Text>
                    <Pressable onPress={() => setMode('password')} onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)} style={{ backgroundColor: '#ec4899', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Sign up with password</Text>
                    </Pressable>
                    <Pressable onPress={() => setMode('magic')} onPressIn={() => Haptics.selectionAsync()} style={{ backgroundColor: '#8b5cf6', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }}>
                      <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Use magic link</Text>
                    </Pressable>
                  </View>
                )}

                {mode === 'password' && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginBottom: 20, alignSelf: 'stretch' }}>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Display Name (Optional)
                      </Text>
                      <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                        <TextInput
                          style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600' }}
                          placeholder="Your display name"
                          placeholderTextColor="#9CA3AF"
                          value={displayName}
                          onChangeText={setDisplayName}
                          editable={!loading}
                        />
                      </View>
                    </View>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Anonymous Username
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                          <TextInput
                            style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600' }}
                            placeholder="mysterious-tiger-123"
                            placeholderTextColor="#9CA3AF"
                            value={anonymousUsername}
                            onChangeText={setAnonymousUsername}
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
                            opacity: (loading || generatingName) ? 0.6 : 1,
                          }}
                        >
                          <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                            {generatingName ? '...' : 'Generate'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Email Address
                      </Text>
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
                    <View style={{ marginBottom: 24 }}>
                      <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Password
                      </Text>
                      <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                        <TextInput
                          style={{ color: '#111827', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600' }}
                          placeholder="Enter password"
                          placeholderTextColor="#9CA3AF"
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                          editable={!loading}
                        />
                      </View>
                    </View>
                    <Pressable onPress={handleSignup} disabled={loading} onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)} style={{ backgroundColor: loading ? '#c084fc' : '#ec4899', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, opacity: loading ? 0.6 : 1 }}>
                      <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>{loading ? "Signing Up..." : "Sign Up"}</Text>
                    </Pressable>
                    <Pressable onPress={() => setMode('choice')} style={{ paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
                    </Pressable>
                  </View>
                )}

                {mode === 'magic' && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginBottom: 20, alignSelf: 'stretch' }}>
                    <View style={{ marginBottom: 24 }}>
                      <Text style={{ color: '#374151', fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Email Address
                      </Text>
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
                    <Pressable onPress={handleMagicLink} disabled={loading} onPressIn={() => Haptics.selectionAsync()} style={{ backgroundColor: loading ? '#c084fc' : '#8b5cf6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12, opacity: loading ? 0.6 : 1 }}>
                      <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>{loading ? 'Please wait...' : 'Send Magic Link'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setMode('choice')} style={{ paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' }}>Back</Text>
                    </Pressable>
                  </View>
                )}
                <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 12, paddingHorizontal: 32, lineHeight: 20 }}>
                  By signing up, you agree to our{"\n"}Terms of Service & Privacy Policy
                </Text>
                <Pressable 
                  onPress={() => router.replace('/login')}
                  style={{ marginTop: 24, paddingVertical: 12 }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 16, textDecorationLine: 'underline' }}>
                    Already have an account? Log in
                  </Text>
                </Pressable>
                <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 12, paddingHorizontal: 16, lineHeight: 18 }}>
                  By signing up, you agree to our{"\n"}Terms of Service & Privacy Policy
                </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    );
  }