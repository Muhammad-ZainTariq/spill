import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';
import { UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS } from '@/app/functions';

export default function TherapistSignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string; email?: string; name?: string; specialization?: string }>();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const email = (params.email || '').toString();
  const requestId = (params.requestId || '').toString();
  const therapistNameFromInvite = (params.name || '').toString();
  const therapistSpecFromInvite = (params.specialization || '').toString();

  useEffect(() => {
    if (!requestId || !email) {
      Alert.alert('Invalid link', 'This therapist link is missing info. Ask the team to resend your invite.');
      router.back();
    }
  }, [requestId, email, router]);

  const handleCompleteSignup = async () => {
    if (!email || !requestId) {
      Alert.alert('Invalid link', 'Missing invite info. Ask the team to resend your invite.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Weak password', 'Password should be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = user.uid;

      await setDoc(
        doc(db, 'users', uid),
        {
          display_name: null,
          anonymous_username: null,
          avatar_url: null,
          is_premium: false,
          premium_activated_at: null,
          premium_expires_at: null,
          is_admin: false,
          is_staff: false,
          role: 'therapist',
          is_therapist_verified: false,
          therapist_code_id: requestId,
          created_at: new Date().toISOString(),
        },
        { merge: true }
      );

      // Link request to uid (documents uploaded next on verification screen)
      await updateDoc(doc(db, 'therapist_onboarding_requests', requestId), {
        completed_uid: uid,
        completed_at: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/therapist/verification' as any);
    } catch (err: any) {
      console.error('Therapist signup error', err);
      if (err?.code === 'auth/email-already-in-use') {
        Alert.alert(
          'Email already in use',
          'This email already has an account. Try logging in instead or contact the team.'
        );
      } else {
        Alert.alert('Error', err?.message || 'Could not complete signup.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ec4899' }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Therapist onboarding</Text>
          <Text style={styles.subtitle}>
            Step 1/2: Create your login. You’ll upload documents next.
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Recommended documents (UK-focused)</Text>
            <Text style={styles.infoSubtitle}>
              For the dissertation/demo, you can upload what you have — the admin team will review it manually.
            </Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS.map((it) => (
                <View key={it.id} style={styles.infoRow}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoRowTitle}>
                      {it.title}
                      {it.requiredForDemo ? ' (requested)' : ' (optional)'}
                    </Text>
                    <Text style={styles.infoRowText}>{it.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                value={email}
                editable={false}
                style={[styles.input, { color: '#6b7280' }]}
              />
            </View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Choose a password"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
            </View>
          </View>
          <Pressable
            onPress={handleCompleteSignup}
            disabled={loading}
            style={[styles.submitButton, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f9fafb',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(249,250,251,0.85)',
    textAlign: 'center',
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  infoTitle: { fontSize: 14, fontWeight: '900', color: '#111827' },
  infoSubtitle: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#6b7280', lineHeight: 16 },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#ec4899', marginTop: 6 },
  infoRowTitle: { fontSize: 13, fontWeight: '900', color: '#111827' },
  infoRowText: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#374151', lineHeight: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    padding: 18,
  },
  label: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  inputWrapper: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  uploadButton: {
    marginTop: 8,
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  changeButton: {
    marginLeft: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  changeButtonText: {
    color: '#f9fafb',
    fontWeight: '700',
    fontSize: 13,
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
});

