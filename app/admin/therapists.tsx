import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { db, functions } from '@/lib/firebase';

interface TherapistRequest {
  id: string;
  name: string;
  email: string;
  specialization?: string | null;
  note?: string | null;
  status: 'pending' | 'invited' | 'completed' | 'rejected' | string;
  created_at?: any;
  document_url?: string | null;
}

export default function TherapistOnboardingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<TherapistRequest[]>([]);
  const [selected, setSelected] = useState<TherapistRequest | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const selectedIdRef = useRef<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const idToKeep = selectedIdRef.current;
    try {
      const q = query(
        collection(db, 'therapist_onboarding_requests'),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const items: TherapistRequest[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setRequests(items);
      if (idToKeep) {
        const refreshed = items.find((r) => r.id === idToKeep) || null;
        setSelected(refreshed);
        selectedIdRef.current = refreshed?.id ?? null;
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not load therapist requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const handleSendInvite = useCallback(async () => {
    if (!selected) return;
    if (sendingInvite) return;
    setSendingInvite(true);
    try {
      const sendInvite = httpsCallable<
        { requestId: string; customMessage?: string },
        { ok: boolean; requestId: string; code: string }
      >(functions, 'sendTherapistInvite');
      const res = await sendInvite({
        requestId: selected.id,
        customMessage: customMessage.trim() || undefined,
      });
      if (res.data?.ok) {
        Alert.alert('Invite sent', 'We emailed a therapist code to this therapist.');
        setCustomMessage('');
        selectedIdRef.current = selected.id;
        setSelected(null);
        await loadRequests();
      } else {
        Alert.alert('Error', 'Failed to send invite. Please try again.');
      }
    } catch (err: any) {
      const msg =
        err?.code === 'functions/failed-precondition'
          ? 'Email sending is not configured for this project.'
          : err?.message || 'Failed to send invite.';
      Alert.alert('Error', msg);
    } finally {
      setSendingInvite(false);
    }
  }, [selected, customMessage, sendingInvite, loadRequests]);

  const renderItem = ({ item }: { item: TherapistRequest }) => {
    const created =
      (item.created_at?.toDate?.() as Date | undefined) ??
      (item.created_at ? new Date(item.created_at) : null);
    const createdLabel = created ? created.toLocaleString() : '';
    const statusColor =
      item.status === 'pending'
        ? '#f59e0b'
        : item.status === 'invited'
        ? '#3b82f6'
        : item.status === 'completed'
        ? '#10b981'
        : item.status === 'rejected'
        ? '#ef4444'
        : '#6b7280';

    return (
      <Pressable
        style={[
          styles.card,
          selected?.id === item.id && { borderColor: '#ec4899', borderWidth: 2 },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          selectedIdRef.current = item.id;
          setSelected(item);
          setCustomMessage('');
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={styles.name}>{item.name || 'Unknown'}</Text>
          <View style={[styles.badge, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {item.status || 'pending'}
            </Text>
          </View>
        </View>
        <Text style={styles.email}>{item.email}</Text>
        {item.specialization ? (
          <Text style={styles.specialization}>{item.specialization}</Text>
        ) : null}
        {createdLabel ? (
          <Text style={styles.meta}>Requested {createdLabel}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color="#111827" />
        </Pressable>
        <View>
          <Text style={styles.title}>Therapist onboarding</Text>
          <Text style={styles.subtitle}>Review requests & send codes</Text>
        </View>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color="#ec4899" />
          </View>
        ) : requests.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>
              No therapist requests yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>

      <Modal
        visible={selected != null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelected(null)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {selected ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.detailName}>{selected.name}</Text>
                  <Pressable
                    onPress={() => setSelected(null)}
                    hitSlop={12}
                    style={styles.modalClose}
                  >
                    <Feather name="x" size={22} color="#6b7280" />
                  </Pressable>
                </View>
                <Text style={styles.detailEmail}>{selected.email}</Text>
                {selected.specialization ? (
                  <Text style={styles.detailSpec}>{selected.specialization}</Text>
                ) : null}
                {selected.note ? (
                  <Text style={styles.detailNote}>{selected.note}</Text>
                ) : null}
                {selected.document_url ? (
                  <>
                    <Text style={styles.detailLabel}>Uploaded document</Text>
                    <View style={styles.docRow}>
                      <Image
                        source={{ uri: selected.document_url }}
                        style={styles.docPreview}
                      />
                      <Pressable
                        onPress={() => Linking.openURL(selected.document_url!)}
                        style={styles.docButton}
                      >
                        <Text style={styles.docButtonText}>Open full document</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
                <Text style={styles.detailLabel}>Email message (optional)</Text>
                <View style={styles.messageBox}>
                  <TextInput
                    style={styles.messageInput}
                    multiline
                    value={customMessage}
                    onChangeText={setCustomMessage}
                    placeholder="Add a short personal note to this therapist (optional)."
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Pressable
                  onPress={handleSendInvite}
                  disabled={sendingInvite}
                  style={[styles.inviteButton, sendingInvite && { opacity: 0.6 }]}
                >
                  <Text style={styles.inviteButtonText}>
                    {sendingInvite ? 'Sending...' : 'Generate code & send invite'}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#f3f4f6',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  email: { fontSize: 13, color: '#4b5563' },
  specialization: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalClose: {
    padding: 4,
  },
  detailTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  detailName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  detailEmail: { fontSize: 14, color: '#4b5563', marginTop: 2 },
  detailSpec: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  detailNote: { fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 18 },
  detailLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 6 },
  messageBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#111827',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  docPreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  docButton: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  docButtonText: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteButton: {
    marginTop: 12,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});

