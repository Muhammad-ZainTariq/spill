import {
  CHALLENGE_CATEGORIES,
  createChallengeGroup,
  generateChallengeIdeas,
  getCurrentUserRole,
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
      const result = await generateChallengeIdeas();
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isOfficialMode ? 'Create official challenge' : 'Create challenge'}
          </Text>
          <View style={styles.backBtn} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryWrap}>
            {CHALLENGE_CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                style={[styles.categoryChip, category === c.value && styles.categoryChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCategory(c.value);
                }}
              >
                <Text style={[styles.categoryChipText, category === c.value && styles.categoryChipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
                <Text style={styles.aiPillText}>AI</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.label}>Goal (what everyone commits to)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="e.g. 300 pushups every day"
            placeholderTextColor="#94a3b8"
            value={goal}
            onChangeText={setGoal}
            multiline
          />
          <Text style={styles.label}>Description (describe the challenge in detail)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="e.g. A week of morning pushups to build habit. Post a short video each day."
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Text style={styles.label}>Duration (days in a row to complete)</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 8 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  categoryChipTextActive: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    paddingRight: 8,
  },
  inputInRow: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  aiPillLoading: { opacity: 0.8 },
  aiPillText: { color: '#ec4899', fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 16,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' as const },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 24, lineHeight: 20 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ec4899',
    paddingVertical: 16,
    borderRadius: 12,
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
