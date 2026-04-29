import {
  CHALLENGE_CATEGORIES,
  createChallengeGroup,
  generateChallengeIdeas,
  getCurrentUserRole,
  getUsedChallengeNames,
} from './functions';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Feather.glyphMap; tint: string; bg: string }> = {
  fitness: { label: 'Fitness', icon: 'activity', tint: '#ec4899', bg: '#fce7f3' },
  chaos: { label: 'Chaos & silly', icon: 'shuffle', tint: '#8b5cf6', bg: '#ede9fe' },
  mindfulness: { label: 'Mindfulness', icon: 'sun', tint: '#f59e0b', bg: '#fef3c7' },
  habits: { label: 'Daily habits', icon: 'check-square', tint: '#10b981', bg: '#d1fae5' },
  creative: { label: 'Creative', icon: 'edit-3', tint: '#f97316', bg: '#ffedd5' },
  social: { label: 'Social', icon: 'users', tint: '#0ea5e9', bg: '#e0f2fe' },
  noscreen: { label: 'No-screen', icon: 'smartphone', tint: '#64748b', bg: '#e2e8f0' },
  food: { label: 'Food & drink', icon: 'coffee', tint: '#92400e', bg: '#fef3c7' },
  other: { label: 'Other', icon: 'star', tint: '#ec4899', bg: '#fce7f3' },
};

export default function CreateChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { official } = useLocalSearchParams<{ official?: string }>();
  const isOfficialMode = official === '1' || official === 'true';
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('7');
  const [category, setCategory] = useState<string>(CHALLENGE_CATEGORIES[0].value);
  const [creating, setCreating] = useState(false);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);

  const handleCreate = async () => {
    const n = name.trim();
    const g = goal.trim();
    const d = parseInt(duration, 10);
    if (!n || !g) {
      Alert.alert('Missing fields', 'Name and goal are required.');
      return;
    }
    if (isNaN(d) || d < 1 || d > 365) {
      Alert.alert('Invalid duration', 'Enter 1–365 days.');
      return;
    }
    let managedByAdmin = false;
    if (isOfficialMode) {
      const role = await getCurrentUserRole();
      if (!role.is_admin) {
        Alert.alert('Admin only', 'Only admins can create official challenges.');
        return;
      }
      managedByAdmin = true;
    }
    setCreating(true);
    try {
      const result = await createChallengeGroup(
        n,
        g,
        d,
        description.trim() || undefined,
        managedByAdmin,
        category
      );
      if (result?.id) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Challenge created', 'Invite others to join and start posting proof!', [
          { text: 'OK', onPress: () => router.replace(`/group?groupId=${result.id}` as any) },
        ]);
      } else {
        Alert.alert('Error', 'Could not create challenge.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const handleAIIdeas = async () => {
    setGeneratingIdeas(true);
    try {
      const excludeNames = await getUsedChallengeNames();
      const result = await generateChallengeIdeas(category, excludeNames);
      if (result) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setName(result.name);
        setGoal(result.goal);
        setDescription(result.description || '');
        setDuration(String(result.duration));
      } else {
        Alert.alert('Oops!', "AI is napping or we're out of keys—try again in a sec! 💤");
      }
    } catch (_) {
      Alert.alert('Oops!', "Couldn't grab ideas right now. Try again!");
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const horizontalPad = 20;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: horizontalPad }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isOfficialMode ? 'Create official challenge' : 'Create challenge'}
          </Text>
          <View style={styles.backBtn} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Feather name="zap" size={20} color="#92400e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Build a streak challenge</Text>
              <Text style={styles.heroSubtitle}>Pick a category, set a goal, then everyone posts daily proof.</Text>
            </View>
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryWrap}>
            {CHALLENGE_CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c.value] || { label: c.label, icon: 'tag' as keyof typeof Feather.glyphMap, tint: '#64748b', bg: '#f1f5f9' };
              const isActive = category === c.value;
              return (
                <Pressable
                  key={c.value}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory(c.value);
                  }}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : meta.bg }]}>
                    <Feather name={meta.icon} size={15} color={isActive ? '#fff' : meta.tint} />
                  </View>
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Challenge name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputInRow}
                placeholder="e.g. 300 pushups a week"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />
              <Pressable
                style={[styles.aiPill, generatingIdeas && styles.aiPillLoading]}
                onPress={handleAIIdeas}
                disabled={generatingIdeas}
              >
                {generatingIdeas ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <>
                    <Feather name="star" size={14} color="#ec4899" />
                    <Text style={styles.aiPillText}>AI</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={styles.label}>Goal</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. 300 pushups every day"
              placeholderTextColor="#94a3b8"
              value={goal}
              onChangeText={setGoal}
              multiline
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. A week of morning pushups to build habit. Post a short video each day."
              placeholderTextColor="#94a3b8"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Text style={styles.label}>Duration</Text>
            <TextInput
              style={styles.input}
              placeholder="7"
              placeholderTextColor="#94a3b8"
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>
              {isOfficialMode
                ? 'Official challenge: anyone can join from the app. Each member posts one camera proof per day. Miss a day = only their streak resets.'
                : 'Each member posts one camera proof per day. Miss a day = only your streak resets. Complete all days to leave.'}
            </Text>
          </View>
          <Pressable
            style={[styles.createBtn, creating && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="zap" size={20} color="#fff" />
                <Text style={styles.createBtnText}>
                  {isOfficialMode ? 'Create official challenge' : 'Create challenge'}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 16, paddingBottom: 32 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 14,
    marginBottom: 18,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  heroSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#64748b', lineHeight: 17 },
  label: { fontSize: 14, fontWeight: '900', color: '#334155', marginBottom: 8 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 18 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 13,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryChipActive: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  categoryIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryChipText: { fontSize: 13, fontWeight: '800', color: '#475569' },
  categoryChipTextActive: { color: '#fff' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 15,
    paddingRight: 8,
  },
  inputInRow: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  aiPillLoading: { opacity: 0.8 },
  aiPillText: { color: '#ec4899', fontSize: 12, fontWeight: '900' },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 15,
    fontWeight: '700',
  },
  inputMultiline: { minHeight: 86, textAlignVertical: 'top' as const },
  hint: { fontSize: 12, fontWeight: '700', color: '#64748b', lineHeight: 18 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ec4899',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: { fontSize: 17, fontWeight: '900', color: '#fff' },
});
