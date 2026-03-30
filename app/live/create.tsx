import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@/app/ui/tokens';
import { createLivePodcastRoom, uploadLivePodcastCoverFromUri } from '@/lib/livePodcasts';

export default function CreateLivePodcastScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [coverAsset, setCoverAsset] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [scheduledFor, setScheduledFor] = useState('');
  const [recordMode, setRecordMode] = useState<'draft' | 'publish' | 'none'>('draft');
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const normalizedTags = useMemo(
    () => tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
    [tags]
  );

  const pickCover = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) {
          Alert.alert('Permission required', 'Please allow photo library access to select a podcast cover.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setCoverAsset({ uri: asset.uri, mimeType: asset.mimeType });
    } catch (error) {
      console.error('Podcast cover picker error', error);
      Alert.alert('Error', 'Could not open the gallery.');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Give your podcast a title.');
      return;
    }
    setSaving(true);
    try {
      let uploadedCoverUrl: string | null = null;
      if (coverAsset?.uri) {
        setUploadingCover(true);
        uploadedCoverUrl = await uploadLivePodcastCoverFromUri(coverAsset.uri, coverAsset.mimeType);
      }
      const { room } = await createLivePodcastRoom({
        title: title.trim(),
        topic: topic.trim(),
        description: description.trim(),
        tags: normalizedTags,
        cover_url: uploadedCoverUrl,
        scheduled_for: scheduledFor.trim() || null,
        record_mode: recordMode,
        allow_raise_hand: true,
        allow_listener_speaking: true,
      });
      router.replace(`/live/${room.id}` as any);
    } catch (error: any) {
      Alert.alert('Could not create room', error?.message || 'Try again.');
    } finally {
      setUploadingCover(false);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create live podcast</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Healing after burnout" />
        <Field label="Topic" value={topic} onChangeText={setTopic} placeholder="Burnout, therapy, anxiety" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What will this space cover?"
          multiline
          minHeight={110}
        />
        <Field label="Tags" value={tags} onChangeText={setTags} placeholder="burnout, cbt, relationships" />
        <View>
          <Text style={styles.label}>Cover image</Text>
          <View style={styles.coverCard}>
            {coverAsset?.uri ? (
              <Image source={{ uri: coverAsset.uri }} style={styles.coverPreview} contentFit="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Feather name="image" size={28} color={tokens.colors.textMuted} />
                <Text style={styles.coverPlaceholderText}>Choose a square cover from your gallery</Text>
              </View>
            )}
            <View style={styles.coverActions}>
              <Pressable style={styles.secondaryBtn} onPress={pickCover}>
                <Text style={styles.secondaryBtnText}>{coverAsset ? 'Change cover' : 'Upload cover'}</Text>
              </Pressable>
              {coverAsset ? (
                <Pressable style={styles.clearBtn} onPress={() => setCoverAsset(null)}>
                  <Text style={styles.clearBtnText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <Field
          label="Schedule for (optional ISO)"
          value={scheduledFor}
          onChangeText={setScheduledFor}
          placeholder="2026-04-01T20:00:00.000Z"
        />

        <Text style={styles.label}>Recording</Text>
        <View style={styles.optionsRow}>
          {[
            ['draft', 'Save draft'],
            ['publish', 'Publish replay'],
            ['none', 'No recording'],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.optionPill, recordMode === value && styles.optionPillActive]}
              onPress={() => setRecordMode(value as any)}
            >
              <Text style={[styles.optionText, recordMode === value && styles.optionTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
          {saving || uploadingCover ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.primaryBtnText}>{uploadingCover ? 'Uploading cover…' : 'Creating…'}</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>Create room</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  minHeight,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  minHeight?: number;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textMuted}
        multiline={multiline}
        style={[styles.input, minHeight ? { minHeight } : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: tokens.colors.text },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 40, gap: 14 },
  label: { fontSize: 12, fontWeight: '900', color: tokens.colors.textSecondary },
  input: {
    marginTop: 6,
    backgroundColor: tokens.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  coverCard: {
    marginTop: 6,
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 12,
    gap: 12,
  },
  coverPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  coverPlaceholderText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '700',
    color: tokens.colors.textSecondary,
  },
  coverActions: {
    flexDirection: 'row',
    gap: 10,
  },
  optionPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  optionPillActive: { backgroundColor: 'rgba(244,114,182,0.14)' },
  optionText: { fontSize: 13, fontWeight: '800', color: tokens.colors.textSecondary },
  optionTextActive: { color: tokens.colors.pink },
  primaryBtn: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  clearBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#dc2626',
  },
});
