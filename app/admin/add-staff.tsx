import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '@/lib/firebase';
import { createStaffUser, getCurrentUserRole } from '../functions';

export default function AddStaffScreen() {
  const router = useRouter();
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffDisplayName, setStaffDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  useEffect(() => {
    (async () => {
      if (!auth.currentUser) {
        router.replace('/login');
        return;
      }
      const role = await getCurrentUserRole();
      setIsAdmin(role.is_admin);
      setCheckingAdmin(false);
      if (!role.is_admin) {
        Alert.alert('Access denied', 'Only admins can add staff.', [
          { text: 'OK', onPress: () => router.replace('/admin') },
        ]);
      }
    })();
  }, [router]);

  const handleAddStaff = async () => {
    if (!staffEmail?.trim() || !staffPassword) {
      Alert.alert('Missing fields', 'Fill in staff email and password.');
      return;
    }
    if (staffPassword.length < 6) {
      Alert.alert('Weak password', 'Staff password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const result = await createStaffUser(staffEmail.trim(), staffPassword, staffDisplayName.trim() || undefined);
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Staff added', 'Their email is verified automatically. They can sign in with that email and password now.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setStaffEmail('');
        setStaffPassword('');
        setStaffDisplayName('');
      } else {
        Alert.alert('Could not add staff', result.error || 'Unknown error');
      }
    } catch (e) {
      Alert.alert('Error', (e as Error)?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>Checking access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>Add staff</Text>
          <View style={styles.backBtn} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Staff email is set as verified automatically. They can sign in right away with the email and password you set.
          </Text>
          <View style={styles.card}>
            <Text style={styles.label}>Staff email</Text>
            <TextInput
              style={styles.input}
              placeholder="staff@example.com"
              placeholderTextColor="#9CA3AF"
              value={staffEmail}
              onChangeText={setStaffEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
            <Text style={styles.label}>Staff password (min 6 characters)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Set a password for staff"
                placeholderTextColor="#9CA3AF"
                value={staffPassword}
                onChangeText={setStaffPassword}
                secureTextEntry={!showStaffPassword}
                editable={!loading}
              />
              <Pressable onPress={() => setShowStaffPassword((v) => !v)} style={styles.eyeBtn}>
                <Feather name={showStaffPassword ? 'eye-off' : 'eye'} size={22} color="#6b7280" />
              </Pressable>
            </View>
            <Text style={styles.label}>Staff display name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor="#9CA3AF"
              value={staffDisplayName}
              onChangeText={setStaffDisplayName}
              editable={!loading}
            />
            <Pressable
              onPress={handleAddStaff}
              disabled={loading || !staffEmail.trim() || !staffPassword}
              style={[styles.submit, (loading || !staffEmail.trim() || !staffPassword) && styles.submitDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>Add staff</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  scroll: { padding: 16, paddingBottom: 32 },
  hint: { color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  label: { color: '#374151', fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', marginBottom: 16 },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  submit: { backgroundColor: '#ec4899', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
