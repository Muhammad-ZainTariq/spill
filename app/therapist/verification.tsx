import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
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

  const docs = useMemo(() => {
    const list: string[] = [];
    if (request?.document_url) list.push(request.document_url);
    if (Array.isArray(request?.document_urls)) {
      for (const u of request.document_urls) if (u && typeof u === 'string') list.push(u);
    }
    // de-dupe
    return [...new Set(list)];
  }, [request]);

  const load = async () => {
    try {
      setLoading(true);
      if (!uid) return;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const codeId = String((userSnap.data() as any)?.therapist_code_id || '').trim();
      if (!codeId) {
        setRequestId(null);
        setRequest(null);
        return;
      }
      setRequestId(codeId);
      const reqSnap = await getDoc(doc(db, 'therapist_onboarding_requests', codeId));
      const reqData = reqSnap.exists() ? (reqSnap.data() as any) : null;
      setRequest(reqData);

      // Best effort: load requirements template (falls back to local default if blocked by rules).
      try {
        const templateId = String(reqData?.requirements_template_id || 'uk_default');
        const tpl = await getTherapistVerificationRequirements(templateId);
        setRequirements(Array.isArray(tpl.items) && tpl.items.length ? tpl.items : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS);
      } catch {
        setRequirements(UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load verification status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadMoreDocs = async () => {
    if (!uid || !requestId) return;
    if (uploading) return;
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

      await updateDoc(doc(db, 'therapist_onboarding_requests', requestId), {
        status: 'resubmitted',
        document_urls: arrayUnion(url),
        resubmitted_at: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', 'Document uploaded. The admin team will review it.');
      await load();
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

  const status = (request?.status || 'pending').toString();
  const needsMore = status === 'needs_more_docs';
  const approved = status === 'approved';
  const rejected = status === 'rejected';

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
          <Text style={styles.muted}>Loading verification…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Therapist verification</Text>
          <Text style={styles.subtitle}>Your account status & documents</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          ) : (
            <Text style={styles.note}>We’re reviewing your documents.</Text>
          )}

          <Pressable
            style={styles.profileBtn}
            onPress={() => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              router.push(`/therapist/${uid}` as any);
            }}
          >
            <Text style={styles.profileBtnText}>Edit public profile</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Requested documents</Text>
          <Text style={styles.muted}>
            This is a UK-focused checklist for the dissertation/demo. Upload what you have — the admin team will review it.
          </Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {requirements.map((it) => {
              const requestedIds = Array.isArray(request?.requested_item_ids) ? request?.requested_item_ids : null;
              const isRequested = requestedIds ? requestedIds.includes(it.id) : !!it.requiredForDemo;
              return (
                <View key={it.id} style={styles.reqRow}>
                  <View style={[styles.reqDot, isRequested && styles.reqDotRequested]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqTitle}>
                      {it.title} {isRequested ? '(requested)' : '(optional)'}
                    </Text>
                    <Text style={styles.reqText}>{it.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Submitted documents</Text>
          {docs.length === 0 ? (
            <Text style={styles.muted}>No documents found on your request yet.</Text>
          ) : (
            docs.map((u) => (
              <Pressable
                key={u}
                style={styles.docRow}
                onPress={() =>
                  router.push({
                    pathname: '/document-viewer',
                    params: { url: encodeURIComponent(u), title: 'Your document' },
                  } as any)
                }
              >
                <Text style={styles.docText} numberOfLines={1}>
                  {u}
                </Text>
                <Text style={styles.docOpen}>Open</Text>
              </Pressable>
            ))
          )}

          {(needsMore || rejected) && (
            <Pressable
              style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
              onPress={uploadMoreDocs}
              disabled={uploading}
            >
              <Text style={styles.uploadText}>
                {uploading ? 'Uploading…' : 'Upload another document'}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: '#6b7280', fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
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
  title: { fontSize: 18, fontWeight: '900', color: '#111827' },
  subtitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 },
  content: { padding: 16, gap: 12 },
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
  uploadBtn: {
    marginTop: 12,
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  uploadText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});

