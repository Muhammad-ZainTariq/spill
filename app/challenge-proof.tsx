import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, functions, getDownloadURL, ref, storage, uploadString } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { hasProofToday, submitChallengeProof } from './functions';

export default function ChallengeProofScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyPosted, setAlreadyPosted] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState<boolean | null>(null);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    (async () => {
      if (!groupId) {
        setChecking(false);
        return;
      }
      const posted = await hasProofToday(groupId);
      setAlreadyPosted(posted);
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      setCameraAllowed(status === 'granted');
      setChecking(false);
    })();
  }, [groupId]);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    setCameraAllowed(status === 'granted');
    if (status !== 'granted') {
      Alert.alert(
        'Camera required',
        'Allow camera access to post streak proof. You can also choose from gallery.',
        [{ text: 'OK' }]
      );
    }
  };

  const captureAndSubmit = async (useCamera: boolean) => {
    if (!groupId || typeof groupId !== 'string' || !auth.currentUser) return;
    if (useCamera) {
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert('Permission required', 'Camera access is needed to take a photo.');
          return;
        }
      }
    }

    try {
      setLoading(true);
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });

      if (result.canceled || !result.assets?.[0]) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const path = `group_streak_proofs/${groupId}/${auth.currentUser.uid}_${Date.now()}.jpg`;
      let imageUrl = '';
      try {
        const storageRef = ref(storage, path);
        // Fast path: direct base64 upload from client.
        await uploadString(storageRef, base64Data, 'base64', { contentType: 'image/jpeg' });
        imageUrl = await getDownloadURL(storageRef);
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        const needsServer = msg.includes('ArrayBuffer') || msg.includes('ArrayBufferView');
        if (!needsServer) throw e;
        // Fallback: upload via Cloud Function (server-side Buffer support).
        const uploadMedia = httpsCallable<
          { base64: string; contentType: string; path: string },
          { path: string }
        >(functions, 'uploadMedia');
        const { data } = await uploadMedia({ base64: base64Data, contentType: 'image/jpeg', path });
        const uploadedPath = String((data as any)?.path || '').trim();
        if (!uploadedPath) throw e;
        imageUrl = await getDownloadURL(ref(storage, uploadedPath));
      }

      const out = await submitChallengeProof(groupId, imageUrl, caption);
      if (out) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (out.completed) {
          Alert.alert('Challenge complete!', `You finished the challenge! Your streak: ${out.current_streak} days.`, [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } else {
          Alert.alert('Proof posted', `Streak: ${out.current_streak} days. Keep it up!`, [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      } else {
        Alert.alert('Could not post', 'You may have already posted today, or something went wrong.');
      }
    } catch (e: any) {
      console.error('Challenge proof error:', e);
      const msg = String(e?.message || e || '');
      if (msg.includes('functions/not-found') || msg.toLowerCase().includes('not-found')) {
        Alert.alert(
          'Upload server not deployed',
          'Your upload fallback requires the Cloud Function `uploadMedia`. Deploy functions and try again.'
        );
        return;
      }
      if (msg.toLowerCase().includes('camera not available on simulator')) {
        Alert.alert(
          'Camera not available',
          'Simulators do not support the camera. Please use \"Choose from gallery\" or test on a real device.'
        );
      } else {
        Alert.alert('Error', 'Failed to upload or submit proof. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Checking...</Text>
      </View>
    );
  }

  if (!groupId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.errorText}>Missing group. Go back and try again.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (alreadyPosted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBack}>
            <Feather name="arrow-left" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.headerTitle}>Post proof</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.alreadyBox}>
          <Feather name="check-circle" size={48} color="#10b981" />
          <Text style={styles.alreadyTitle}>Already posted today</Text>
          <Text style={styles.alreadySub}>You can post again tomorrow.</Text>
        </View>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back to group</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>Post streak proof</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.instruction}>
        Take a photo or choose from gallery. It will be shared with your group in real time.
      </Text>

      <TextInput
        style={styles.captionInput}
        placeholder="Add a caption (optional)"
        placeholderTextColor="#9ca3af"
        value={caption}
        onChangeText={setCaption}
        multiline
        maxLength={180}
      />

      {cameraAllowed === false && (
        <Pressable style={styles.allowBtn} onPress={requestCameraPermission}>
          <Feather name="camera" size={20} color="#fff" />
          <Text style={styles.allowBtnText}>Allow camera</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.captureBtn, loading && styles.captureBtnDisabled]}
          onPress={() => captureAndSubmit(true)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="camera" size={32} color="#fff" />
              <Text style={styles.captureBtnText}>Take photo</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.captureBtn, styles.captureBtnSecondary, loading && styles.captureBtnDisabled]}
          onPress={() => captureAndSubmit(false)}
          disabled={loading}
        >
          <Feather name="image" size={32} color="#ec4899" />
          <Text style={styles.captureBtnTextSecondary}>Choose from gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerBack: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  errorText: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  instruction: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  captionInput: {
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 18,
  },
  allowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  allowBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  actions: { gap: 16 },
  captureBtn: {
    backgroundColor: '#ec4899',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  captureBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ec4899',
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  captureBtnTextSecondary: { color: '#ec4899', fontWeight: '700', fontSize: 16 },
  backBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
  },
  backBtnText: { fontWeight: '600', color: '#374151', fontSize: 15 },
  alreadyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  alreadyTitle: { marginTop: 16, fontSize: 18, fontWeight: '700', color: '#111827' },
  alreadySub: { marginTop: 8, fontSize: 15, color: '#6b7280' },
});
