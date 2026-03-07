import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db, functions, getDownloadURL, ref, storage } from '@/lib/firebase';
import {
  getTherapistVerificationRequirements,
  TherapistVerificationRequirementItem,
  UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS,
} from '@/app/functions';

type RequestDoc = {
  status?: string;
  document_url?: string | null;
  document_urls?: string[] | null;
  // New: structured per-requirement uploads
  document_uploads?: Record<
    string,
    {
      title?: string | null;
      url?: string | null;
      kind?: 'doc' | 'video' | string;
      mime?: string | null;
      uploaded_at?: string | null;
    }
  > | null;
  verification_video?: { url?: string | null; uploaded_at?: string | null; mime?: string | null } | null;
  admin_request_message?: string | null;
  reviewed_note?: string | null;
  requested_item_ids?: string[] | null;
  requirements_template_id?: string | null;
};

export default function TherapistVerificationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [requirements, setRequirements] = useState<TherapistVerificationRequirementItem[]>(
    UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS
  );

  const uid = auth.currentUser?.uid || null;

  const uploadsMap = useMemo(() => {
    const m = (request as any)?.document_uploads;
    return m && typeof m === 'object' ? (m as Record<string, any>) : {};
  }, [request]);

  const requestedIds = useMemo(() => {
    const ids = Array.isArray(request?.requested_item_ids) ? request?.requested_item_ids.filter(Boolean) : null;
    if (ids && ids.length) return ids;
    return (requirements || []).filter((it) => it.requiredForDemo).map((it) => it.id);
  }, [request?.requested_item_ids, requirements]);

  const requestedItems = useMemo(() => {
    const byId = new Map((requirements || []).map((it) => [it.id, it]));
    const out = requestedIds.map((id) => byId.get(id)).filter(Boolean) as TherapistVerificationRequirementItem[];
    // Ensure stable order: requested first, then any remaining items (optional)
    return out;
  }, [requestedIds, requirements]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        if (!uid) return;
        const userSnap = await getDoc(doc(db, 'users', uid));
        const codeId = String((userSnap.data() as any)?.therapist_code_id || '').trim();
        if (cancelled) return;
        if (!codeId) {
          setRequestId(null);
          setRequest(null);
          return;
        }
        setRequestId(codeId);
      } catch (e: any) {
        if (!cancelled) Alert.alert('Error', e?.message || 'Could not load verification status.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !requestId) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'therapist_onboarding_requests', requestId),
      async (snap) => {
        const reqData = snap.exists() ? (snap.data() as any) : null;
        setRequest(reqData);
        // Best effort: load requirements template (falls back to local default if blocked by rules).
        try {
          const templateId = String(reqData?.requirements_template_id || 'uk_default');
          const tpl = await getTherapistVerificationRequirements(templateId);
          setRequirements(
            Array.isArray(tpl.items) && tpl.items.length ? tpl.items : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS
          );
        } catch {
          setRequirements(UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS);
        } finally {
          setLoading(false);
        }
      },
      (e: any) => {
        setLoading(false);
        Alert.alert('Error', e?.message || 'Insufficient permissions to view your request.');
      }
    );
    return () => unsub();
  }, [uid, requestId]);

  const uploadForItem = async (itemId: string, title: string) => {
    if (!uid || !requestId) return;
    if (uploading) return;
    if (uploadsMap?.[itemId]?.url) {
      Alert.alert('Already uploaded', 'This checklist item is already uploaded. Tap View to open it.');
      return;
    }
    try {
      setUploading(true);
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64Data?.length) {
        Alert.alert('Upload failed', 'Could not read the selected file.');
        return;
      }

      const ext = mime.includes('png') ? 'png' : mime.includes('pdf') ? 'pdf' : 'jpg';
      const path = `therapist-docs/${uid}/${Date.now()}.${ext}`;
      const uploadMedia = httpsCallable<
        { base64: string; contentType: string; path: string },
        { path: string }
      >(functions, 'uploadMedia');
      const { data } = await uploadMedia({ base64: base64Data, contentType: mime, path });
      const uploadedPath = String((data as any)?.path || '').trim();
      if (!uploadedPath) {
        Alert.alert('Upload failed', 'Could not upload document.');
        return;
      }

      const url = await getDownloadURL(ref(storage, uploadedPath));
      if (!url) {
        Alert.alert('Upload failed', 'Could not get document URL.');
        return;
      }

      const now = new Date().toISOString();
      const currentStatus = String((request as any)?.status || 'pending');
      const base: any = {};
      // Structured upload map for checklist
      base[`document_uploads.${itemId}`] = {
        title,
        url,
        kind: 'doc',
        mime,
        uploaded_at: now,
      };
      // Keep legacy arrays populated (admin already supports these)
      base.document_urls = arrayUnion(url);
      // First-time upload after code: move to "completed" so admin switches to review mode.
      if (currentStatus === 'invited' || currentStatus === 'pending') {
        base.status = 'completed';
        base.document_url = url; // keep legacy single field populated
        base.completed_uid = uid;
        base.completed_at = now;
      } else {
        base.status = 'resubmitted';
        base.resubmitted_at = now;
      }
      await updateDoc(doc(db, 'therapist_onboarding_requests', requestId), base);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', 'Document uploaded. The admin team will review it.');
    } catch (e: any) {
      const isNotFound = e?.code === 'functions/not-found' || e?.message?.includes('not-found');
      const msg = isNotFound
        ? 'Upload server not deployed. Ask the team to deploy the upload function.'
        : e?.message || 'Upload failed.';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const recordVerificationVideo = async () => {
    if (!uid || !requestId) return;
    if (uploading) return;
    try {
      setUploading(true);
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to record the verification video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 5,
        quality: 0.2 as any,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'video/mp4';
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64Data?.length) {
        Alert.alert('Upload failed', 'Could not read the recorded video.');
        return;
      }
      const path = `therapist-docs/${uid}/${Date.now()}_verify.mp4`;
      const uploadMedia = httpsCallable<{ base64: string; contentType: string; path: string }, { path: string }>(
        functions,
        'uploadMedia'
      );
      const { data } = await uploadMedia({ base64: base64Data, contentType: mime, path });
      const uploadedPath = String((data as any)?.path || '').trim();
      if (!uploadedPath) {
        Alert.alert('Upload failed', 'Could not upload video.');
        return;
      }
      const url = await getDownloadURL(ref(storage, uploadedPath));
      if (!url) {
        Alert.alert('Upload failed', 'Could not get video URL.');
        return;
      }
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'therapist_onboarding_requests', requestId), {
        verification_video: { url, uploaded_at: now, mime },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', 'Verification video uploaded.');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not record/upload video.');
    } finally {
      setUploading(false);
    }
  };

  const status = (request?.status || 'pending').toString();
  const invited = status === 'invited' || status === 'pending';
  const needsMore = status === 'needs_more_docs';
  const approved = status === 'approved';
  const rejected = status === 'rejected';
  const waitingReview = !approved && !invited && !needsMore && !rejected; // e.g. completed/resubmitted

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
          <Text style={styles.mutedOnPink}>Loading verification…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerTitle = approved
    ? 'Therapist verified'
    : needsMore
      ? 'Upload more documents'
      : rejected
        ? 'Verification rejected'
        : waitingReview
          ? 'Waiting for review'
          : 'Upload documents';

  const headerSubtitle = approved
    ? 'You can set up your public profile now'
    : needsMore
      ? 'Admin requested more documents'
      : rejected
        ? 'Upload updated documents for review'
        : waitingReview
          ? 'We received your documents — admin review pending'
          : 'Step 2/2: Upload requested documents';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{headerTitle}</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ID verification video (5 seconds)</Text>
          <Text style={styles.muted}>
            Record a short selfie video saying: “I am &lt;your name&gt; and I’m applying for the therapist role on Spill.”
          </Text>
          {(request as any)?.verification_video?.url ? (
            <Pressable
              style={styles.docRow}
              onPress={() =>
                router.push({
                  pathname: '/document-viewer',
                  params: { url: encodeURIComponent(String((request as any)?.verification_video?.url)), title: 'Verification video' },
                } as any)
              }
            >
              <Text style={styles.docText} numberOfLines={1}>Verification video uploaded</Text>
              <Text style={styles.docOpen}>Open</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.uploadBtn, uploading && { opacity: 0.6 }]} onPress={recordVerificationVideo} disabled={uploading}>
              <Text style={styles.uploadText}>{uploading ? 'Please wait…' : 'Record 5s video'}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusPill,
                approved && { backgroundColor: 'rgba(16,185,129,0.12)' },
                rejected && { backgroundColor: 'rgba(239,68,68,0.12)' },
                needsMore && { backgroundColor: 'rgba(245,158,11,0.12)' },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  approved && { color: '#10b981' },
                  rejected && { color: '#ef4444' },
                  needsMore && { color: '#f59e0b' },
                ]}
              >
                {status.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {needsMore ? (
            <Text style={styles.note}>
              {request?.admin_request_message ||
                request?.reviewed_note ||
                'Admin requested more verification documents.'}
            </Text>
          ) : rejected ? (
            <Text style={styles.note}>
              {request?.reviewed_note || 'Your verification was rejected. Contact support if you think this is a mistake.'}
            </Text>
          ) : approved ? (
            <Text style={styles.note}>You’re verified. You can use the app normally.</Text>
          ) : waitingReview ? (
            <Text style={styles.note}>Thanks — your documents were submitted. Please wait while the admin reviews them.</Text>
          ) : (
            <Text style={styles.note}>We’re reviewing your documents.</Text>
          )}

          {approved ? (
            <Pressable
              style={styles.profileBtn}
              onPress={() => {
                const uid = auth.currentUser?.uid;
                if (!uid) return;
                router.push(`/therapist/${uid}` as any);
              }}
            >
              <Text style={styles.profileBtnText}>Set up public profile</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Requested documents</Text>
          <Text style={styles.muted}>
            This is a UK-focused checklist for the dissertation/demo. Upload what you have — the admin team will review it.
          </Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {requestedItems.map((it) => {
              const uploaded = uploadsMap?.[it.id];
              const has = !!uploaded?.url;
              return (
                <View key={it.id} style={styles.reqRow}>
                  <View style={[styles.reqDot, has && styles.reqDotRequested]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqTitle}>
                      {it.title} {has ? '(uploaded)' : '(needed)'}
                    </Text>
                    <Text style={styles.reqText}>{it.description}</Text>
                  </View>
                  {has ? (
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/document-viewer',
                          params: { url: encodeURIComponent(String(uploaded.url)), title: it.title },
                        } as any)
                      }
                    >
                      <Text style={styles.smallBtnText}>View</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.smallBtnPink, uploading && { opacity: 0.6 }]}
                      onPress={() => uploadForItem(it.id, it.title)}
                      disabled={uploading}
                    >
                      <Text style={styles.smallBtnPinkText}>Upload</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ec4899' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: '#6b7280', fontSize: 13 },
  mutedOnPink: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 18, fontWeight: '800', color: '#111827' },
  title: { fontSize: 22, fontWeight: '900', color: '#ffffff' },
  subtitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 4, lineHeight: 16 },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: '#111827', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(107,114,128,0.12)' },
  statusText: { fontSize: 12, fontWeight: '900', color: '#6b7280', textTransform: 'capitalize' },
  note: { marginTop: 10, fontSize: 13, color: '#374151', lineHeight: 18 },
  profileBtn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  profileBtnText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 10,
  },
  docText: { flex: 1, fontSize: 12, color: '#111827' },
  docOpen: { fontSize: 12, fontWeight: '900', color: '#ec4899' },
  reqRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 4 },
  reqDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(107,114,128,0.35)', marginTop: 6 },
  reqDotRequested: { backgroundColor: '#ec4899' },
  reqTitle: { fontSize: 13, fontWeight: '900', color: '#111827' },
  reqText: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#374151', lineHeight: 16 },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  smallBtnText: { fontSize: 12, fontWeight: '900', color: '#111827' },
  smallBtnPink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ec4899',
  },
  smallBtnPinkText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  uploadBtn: {
    marginTop: 12,
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  uploadText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});

