import { auth, db, storage, ref, getDownloadURL, functions } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { checkPremiumStatus } from './functions';

export default function CreatePost() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'General' | 'Anxiety Share' | 'Depression Vent'>('General');
  const [mediaUrl, setMediaUrl] = useState('');
  const [localMedia, setLocalMedia] = useState<{ uri: string; type: 'image' | 'video'; mimeType: string; fileName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isVentMode, setIsVentMode] = useState(false);
  const [ventDurationMinutes, setVentDurationMinutes] = useState(24 * 60); // Store in minutes, default 24h
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    // Request media library permissions on mount (iOS needs it proactively)
    (async () => {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const premium = await checkPremiumStatus();
      setIsPremium(premium);
    })();
  }, []);

  const pickMedia = async () => {
    try {
      // Ensure permissions are granted before opening
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) {
          Alert.alert('Permission required', 'Please allow photo library access to pick media.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      // Derive type and mime
      const isImage = (asset.type ?? 'image') === 'image';
      const mimeType = isImage ? 'image/jpeg' : 'video/mp4';
      setLocalMedia({ uri: asset.uri, type: isImage ? 'image' : 'video', mimeType, fileName: asset.fileName });
    } catch (e) {
      console.error('Picker error', e);
      Alert.alert('Error', 'Could not open media library.');
    }
  };

  const uploadMediaIfNeeded = async (userId: string): Promise<string | null> => {
    if (!localMedia) return mediaUrl.trim() ? mediaUrl.trim() : null;
    try {
      // Upload via Cloud Function (React Native SDK fails on Blob/ArrayBuffer; server has full Buffer support)
      const base64Data = await FileSystem.readAsStringAsync(localMedia.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (!base64Data?.length) {
        Alert.alert('Upload failed', 'Could not read the selected file.');
        return null;
      }

      const mime = localMedia.mimeType?.trim() || (localMedia.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : localMedia.type === 'image' ? 'jpg' : 'mp4';
      const filePath = `${userId}/${Date.now()}.${ext}`;
      const bucketName = mime.startsWith('video/') ? 'video-data' : 'image-data';
      const fullPath = `${bucketName}/${filePath}`;

      const uploadMedia = httpsCallable<{ base64: string; contentType: string; path: string }, { path: string }>(functions, 'uploadMedia');
      const { data } = await uploadMedia({ base64: base64Data, contentType: mime, path: fullPath });
      if (!data?.path?.trim()) return null;
      const url = await getDownloadURL(ref(storage, data.path.trim()));
      return url || null;
    } catch (e: any) {
      console.error('Upload exception', e);
      const isNotFound = e?.code === 'functions/not-found' || e?.message?.includes('not-found');
      const msg = isNotFound
        ? 'Upload server not deployed. Run: cd functions && npx firebase deploy --only functions'
        : (e?.message || 'Something went wrong while uploading.');
      Alert.alert('Upload failed', msg);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Write something', 'Post content cannot be empty.');
      return;
    }
    if (content.trim().length > 1000) {
      Alert.alert('Too long', 'Max 1000 characters.');
      return;
    }

    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not logged in', 'Please log in again.');
        return;
      }

      const uploadedUrl = await uploadMediaIfNeeded(user.uid);
      if (localMedia && uploadedUrl == null) {
        setLoading(false);
        return;
      }
      const expiresAt = isVentMode
        ? new Date(Date.now() + ventDurationMinutes * 60 * 1000).toISOString()
        : null;

      await addDoc(collection(db, 'posts'), {
        user_id: user.uid,
        content: content.trim(),
        category,
        media_url: uploadedUrl || null,
        is_vent: isVentMode,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        upvotes_count: 0,
        downvotes_count: 0,
        views_count: 0,
        comments_count: 0,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const cancel = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Post</Text>

        <View style={styles.card}>
          <Text style={styles.label}>What's on your mind?</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Share something..."
            placeholderTextColor="#9ca3af"
            style={styles.textarea}
            multiline
            numberOfLines={6}
            maxLength={1000}
            editable={!loading}
          />
          <Text style={{ alignSelf: 'flex-end', color: '#6b7280', marginTop: 6 }}>{content.length}/1000</Text>

          {/* Vent Mode Toggle */}
          <Pressable
            style={styles.ventModeToggle}
            onPress={() => {
              const newValue = !isVentMode;
              setIsVentMode(newValue);
              // Reset to 24 hours for non-premium when enabling
              if (newValue && !isPremium) {
                setVentDurationMinutes(24 * 60);
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            disabled={loading}
          >
            <View style={styles.ventModeInfo}>
              <View style={styles.ventModeHeader}>
                <Text style={styles.ventModeTitle}>🔥 Vent Mode</Text>
                {isVentMode && (
                  <View style={styles.ventModeBadge}>
                    <Text style={styles.ventModeBadgeText}>
                      {ventDurationMinutes < 60 
                        ? `${ventDurationMinutes}m` 
                        : `${ventDurationMinutes / 60}h`}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.ventModeDescription}>
                {isVentMode 
                  ? ventDurationMinutes < 60
                    ? `Post disappears after ${ventDurationMinutes} minute${ventDurationMinutes !== 1 ? 's' : ''}`
                    : `Post disappears after ${ventDurationMinutes / 60} hour${ventDurationMinutes / 60 !== 1 ? 's' : ''}`
                  : 'Let it out - post disappears automatically'}
              </Text>
            </View>
            <View style={[styles.toggle, isVentMode && styles.toggleActive]}>
              <View style={[styles.toggleThumb, isVentMode && styles.toggleThumbActive]} />
            </View>
          </Pressable>

          {/* Time Selector - Shows when vent mode is on */}
          {isVentMode && (
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>Disappear after:</Text>
              <View style={styles.hourButtons}>
                {/* Temporarily adding 1 minute for testing - available to everyone */}
                {[
                  { minutes: 1, label: '1m', isPremium: false }, // Testing only - temporarily free
                  { minutes: 6 * 60, label: '6h', isPremium: true },
                  { minutes: 12 * 60, label: '12h', isPremium: true },
                  { minutes: 24 * 60, label: '24h', isPremium: false }, // Free users can use this
                  { minutes: 48 * 60, label: '48h', isPremium: true },
                  { minutes: 72 * 60, label: '72h', isPremium: true },
                ].map((option) => (
                  <Pressable
                    key={option.minutes}
                    style={[
                      styles.hourButton,
                      ventDurationMinutes === option.minutes && styles.hourButtonActive,
                    ]}
                    onPress={() => {
                      if (!isPremium && option.isPremium) {
                        Alert.alert(
                          'Premium Feature',
                          'Custom vent duration is a premium feature. Upgrade to unlock!',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Go Premium', onPress: () => router.push('/premium' as any) }
                          ]
                        );
                      } else {
                        setVentDurationMinutes(option.minutes);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    disabled={loading}
                  >
                    <Text style={[
                      styles.hourButtonText,
                      ventDurationMinutes === option.minutes && styles.hourButtonTextActive,
                      !isPremium && option.isPremium && styles.hourButtonTextLocked,
                    ]}>
                      {option.label}
                      {!isPremium && option.isPremium && ' 🔒'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>Category</Text>
          <View style={styles.categoryRow}>
            {(['General','Anxiety Share','Depression Vent'] as const).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                disabled={loading}
              >
                <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Media (optional)</Text>
          {localMedia ? (
            <View style={styles.previewBox}>
              {localMedia.type === 'image' ? (
                <Image source={{ uri: localMedia.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Text style={{ color: '#374151', fontWeight: '700' }}>Video selected</Text>
                  <Text style={{ color: '#6b7280', marginTop: 4, fontSize: 12 }}>Preview not shown</Text>
                </View>
              )}
              <Pressable onPress={() => setLocalMedia(null)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickMedia} style={styles.mediaPicker} disabled={loading}>
              <Text style={styles.mediaPickerText}>Pick image or video</Text>
            </Pressable>
          )}

          <View style={styles.actionsRow}>
            <Pressable onPress={cancel} style={[styles.button, styles.secondaryBtn]} disabled={loading}>
              <Text style={[styles.buttonText, styles.secondaryText]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSubmit} style={[styles.button, styles.primaryBtn]} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Post</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fafafa',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ec4899',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f5f5f5',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  textarea: {
    minHeight: 140,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'top',
  },
  input: {
    height: 48,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111827',
  },
  mediaPicker: {
    height: 48,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPickerText: {
    color: '#111827',
    fontWeight: '700',
  },
  previewBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 180,
  },
  videoPlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  removeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fee2e2',
  },
  removeBtnText: {
    color: '#991b1b',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#ec4899',
    marginLeft: 8,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryBtn: {
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryText: {
    color: '#111827',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  categoryChipText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  ventModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  ventModeInfo: {
    flex: 1,
    marginRight: 12,
  },
  ventModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  ventModeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400e',
  },
  ventModeBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ventModeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  ventModeDescription: {
    fontSize: 13,
    color: '#78350f',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#f59e0b',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  timeSelector: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  timeSelectorLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  hourButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hourButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    minWidth: 60,
    alignItems: 'center',
  },
  hourButtonActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  hourButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  hourButtonTextActive: {
    color: '#fff',
  },
  hourButtonTextLocked: {
    color: '#9ca3af',
  },
});


