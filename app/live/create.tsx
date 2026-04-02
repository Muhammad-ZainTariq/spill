import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLivePodcast } from '@/components/live/LivePodcastProvider';
import { tokens } from '@/app/ui/tokens';
import {
  createLivePodcastRoom,
  joinLivePodcastRoom,
  startLivePodcastRoom,
  uploadLivePodcastCoverFromUri,
} from '@/lib/livePodcasts';

function defaultLaterDate(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return d;
}

export default function CreateLivePodcastScreen() {
  const router = useRouter();
  const { connectToRoom } = useLivePodcast();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [coverAsset, setCoverAsset] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  /** `now` = go live immediately after create; `later` = scheduled room */
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledDate, setScheduledDate] = useState(defaultLaterDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recordMode, setRecordMode] = useState<'draft' | 'publish' | 'none'>('draft');
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const primaryLabel = scheduleMode === 'now' ? 'Go live now' : 'Create room';

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
        mediaTypes: ['images'],
        allowsEditing: Platform.OS === 'ios',
        aspect: Platform.OS === 'ios' ? [1, 1] : undefined,
        quality: 0.9,
        copyToCacheDirectory: true,
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

    const minFuture = Date.now() + 2 * 60 * 1000;
    let scheduledForIso: string | null = null;
    if (scheduleMode === 'later') {
      if (scheduledDate.getTime() < minFuture) {
        Alert.alert('Pick a later time', 'Choose a start time at least a couple of minutes from now.');
        return;
      }
      scheduledForIso = scheduledDate.toISOString();
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
        tags: [],
        cover_url: uploadedCoverUrl,
        scheduled_for: scheduledForIso,
        record_mode: recordMode,
        allow_raise_hand: true,
        allow_listener_speaking: true,
      });

      if (scheduleMode === 'now') {
        await startLivePodcastRoom(room.id);
        const session = await joinLivePodcastRoom(room.id);
        connectToRoom({
          room: session.room,
          role: session.role,
          token: session.token,
          serverUrl: session.serverUrl,
        });
      }

      router.replace(`/live/${room.id}` as any);
    } catch (error: any) {
      Alert.alert('Could not create room', error?.message || 'Try again.');
    } finally {
      setUploadingCover(false);
      setSaving(false);
    }
  };

  const scheduleSummary = useMemo(() => {
    if (scheduleMode === 'now') return 'You will broadcast as soon as you confirm.';
    return scheduledDate.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [scheduleMode, scheduledDate]);

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

        <Text style={styles.label}>Cover image</Text>
        <View style={styles.coverCard}>
          <Pressable style={styles.coverTap} onPress={pickCover}>
            {coverAsset?.uri ? (
              <Image source={{ uri: coverAsset.uri }} style={styles.coverPreview} contentFit="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Feather name="image" size={28} color={tokens.colors.textMuted} />
                <Text style={styles.coverPlaceholderText}>Tap to choose a cover from your gallery</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.coverActions}>
            <Text style={styles.secondaryBtnText}>{coverAsset ? 'Tap the image to change' : 'Square images look best'}</Text>
            {coverAsset ? (
              <Pressable style={styles.clearBtn} onPress={() => setCoverAsset(null)}>
                <Text style={styles.clearBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>When</Text>
        <View style={styles.scheduleRow}>
          <Pressable
            style={[styles.schedulePill, scheduleMode === 'now' && styles.schedulePillActive]}
            onPress={() => setScheduleMode('now')}
          >
            <Feather name="zap" size={16} color={scheduleMode === 'now' ? tokens.colors.pink : tokens.colors.textSecondary} />
            <Text style={[styles.schedulePillText, scheduleMode === 'now' && styles.schedulePillTextActive]}>Right now</Text>
          </Pressable>
          <Pressable
            style={[styles.schedulePill, scheduleMode === 'later' && styles.schedulePillActive]}
            onPress={() => setScheduleMode('later')}
          >
            <Feather name="calendar" size={16} color={scheduleMode === 'later' ? tokens.colors.pink : tokens.colors.textSecondary} />
            <Text style={[styles.schedulePillText, scheduleMode === 'later' && styles.schedulePillTextActive]}>Schedule</Text>
          </Pressable>
        </View>
        {scheduleMode === 'later' ? (
          <View style={styles.scheduleLaterCard}>
            <Text style={styles.scheduleSummary}>{scheduleSummary}</Text>
            <Pressable style={styles.pickTimeBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.pickTimeBtnText}>Change date and time</Text>
            </Pressable>
            <Text style={styles.scheduleHint}>
              Anyone who taps Remind me on this room gets a push about 10 minutes before start, and when you go live.
            </Text>
          </View>
        ) : (
          <Text style={styles.scheduleHint}>Starts immediately after you tap {primaryLabel}. No reminder push for instant rooms.</Text>
        )}

        {showDatePicker ? (
          <DateTimePicker
            value={scheduledDate}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date(Date.now() + 2 * 60 * 1000)}
            onChange={(event, date) => {
              if (event.type === 'dismissed') {
                setShowDatePicker(false);
                return;
              }
              if (date) setScheduledDate(date);
              if (Platform.OS === 'android') {
                setShowDatePicker(false);
              }
            }}
          />
        ) : null}
        {Platform.OS === 'ios' && showDatePicker ? (
          <Pressable style={styles.iosPickerDone} onPress={() => setShowDatePicker(false)}>
            <Text style={styles.iosPickerDoneText}>Done</Text>
          </Pressable>
        ) : null}

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
              onPress={() => setRecordMode(value as 'draft' | 'publish' | 'none')}
            >
              <Text style={[styles.optionText, recordMode === value && styles.optionTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
          {saving || uploadingCover ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.primaryBtnText}>{uploadingCover ? 'Uploading cover...' : 'Working...'}</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
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
  coverTap: {
    borderRadius: 18,
    overflow: 'hidden',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  schedulePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  schedulePillActive: {
    borderColor: 'rgba(244,114,182,0.45)',
    backgroundColor: 'rgba(244,114,182,0.08)',
  },
  schedulePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.textSecondary,
  },
  schedulePillTextActive: {
    color: tokens.colors.text,
  },
  scheduleLaterCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: 10,
  },
  scheduleSummary: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  pickTimeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pickTimeBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.pink,
  },
  scheduleHint: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  iosPickerDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  iosPickerDoneText: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.pink,
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
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textSecondary,
    flex: 1,
  },
  clearBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
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
