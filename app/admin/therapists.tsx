import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { db } from '@/lib/firebase';

interface TherapistRequest {
  id: string;
  name: string;
  email: string;
  specialization?: string | null;
  note?: string | null;
  status: 'pending' | 'invited' | 'completed' | 'rejected' | string;
  created_at?: any;
  document_url?: string | null;
  document_urls?: string[] | null;
  completed_uid?: string | null;
  admin_request_message?: string | null;
}

export default function TherapistOnboardingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<TherapistRequest[]>([]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
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
        style={styles.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: '/admin/therapist-request', params: { requestId: item.id } } as any);
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
});

