import { auth } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';
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
            <Feather name="arrow-left" size={20} color={tokens.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Add staff</Text>
            <Text style={styles.headerSubtitle}>Create verified admin team access</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="shield" size={16} color={tokens.colors.pink} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Feather name="user-plus" size={24} color="#92400E" />
            </View>
            <Text style={styles.heroLabel}>Staff access</Text>
            <Text style={styles.heroTitle}>Invite your team</Text>
            <Text style={styles.heroText}>
              Staff email is verified automatically, so they can sign in right away with the email and password you set.
            </Text>
            <View style={styles.featureRow}>
              <View style={styles.featurePill}>
                <Feather name="check-circle" size={13} color="#047857" />
                <Text style={styles.featureText}>Verified</Text>
              </View>
              <View style={styles.featurePillPink}>
                <Feather name="lock" size={13} color="#BE185D" />
                <Text style={styles.featureTextPink}>Admin only</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Staff details</Text>
            <Text style={styles.cardText}>Add the login information this staff member will use.</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Staff email</Text>
              <View style={styles.inputWrap}>
                <Feather name="mail" size={18} color={tokens.colors.textMuted} />
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
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Staff password</Text>
              <View style={styles.inputWrap}>
                <Feather name="key" size={18} color={tokens.colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor="#9CA3AF"
                  value={staffPassword}
                  onChangeText={setStaffPassword}
                  secureTextEntry={!showStaffPassword}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowStaffPassword((v) => !v)} style={styles.eyeBtn}>
                  <Feather name={showStaffPassword ? 'eye-off' : 'eye'} size={20} color={tokens.colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Display name</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={18} color={tokens.colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="Optional display name"
                  placeholderTextColor="#9CA3AF"
                  value={staffDisplayName}
                  onChangeText={setStaffDisplayName}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.infoBox}>
              <Feather name="info" size={16} color="#92400E" />
              <Text style={styles.infoText}>Use a strong password and share it privately with the new staff member.</Text>
            </View>

            <Pressable
              onPress={handleAddStaff}
              disabled={loading || !staffEmail.trim() || !staffPassword}
              style={[styles.submit, (loading || !staffEmail.trim() || !staffPassword) && styles.submitDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitText}>Create staff account</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bgSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: tokens.colors.textMuted, fontSize: 15, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokens.colors.surfaceElevated,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: tokens.colors.text },
  headerSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
  },
  scroll: { padding: tokens.spacing.screenHorizontal, paddingBottom: 32 },
  heroCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    shadowColor: '#92400E',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    marginBottom: 14,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: '#B45309' },
  heroTitle: { marginTop: 5, fontSize: 25, lineHeight: 30, fontWeight: '900', color: tokens.colors.text },
  heroText: { marginTop: 7, fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#92400E' },
  featureRow: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
  },
  featurePillPink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
  },
  featureText: { fontSize: 11, fontWeight: '900', color: '#047857' },
  featureTextPink: { fontSize: 11, fontWeight: '900', color: '#BE185D' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#92400E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  cardText: { marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 18, fontWeight: '700', color: tokens.colors.textSecondary },
  fieldBlock: { marginBottom: 12 },
  label: { color: tokens.colors.text, fontSize: 13, fontWeight: '900', marginBottom: 7, marginLeft: 4 },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  eyeBtn: { padding: 8, marginRight: -4 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 2,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800', color: '#92400E' },
  submit: {
    marginTop: 14,
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: tokens.colors.pink,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.colors.pink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  submitDisabled: { opacity: 0.55 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
