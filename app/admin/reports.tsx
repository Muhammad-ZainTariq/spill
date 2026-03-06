import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';

type DmReport = {
  id: string;
  reporter_uid: string;
  target_uid: string;
  conversation_id: string;
  message_id?: string | null;
  reason?: string | null;
  details?: string | null;
  created_at?: string | null;
  status?: string | null;
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<DmReport[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'reports'),
        where('type', '==', 'user_dm'),
        where('status', '==', 'pending'),
        orderBy('created_at', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DmReport[];
      setReports(list);
    } catch (e: any) {
      console.error('Load reports error', e);
      Alert.alert('Error', e?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolve = async (reportId: string) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'resolved',
        resolved_at: now,
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not resolve report.');
    }
  };

  const renderItem = ({ item }: { item: DmReport }) => {
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.reason}>{String(item.reason || 'report').replace(/_/g, ' ')}</Text>
          <Text style={styles.when}>{when}</Text>
        </View>
        <Text style={styles.meta}>Reporter: {item.reporter_uid}</Text>
        <Text style={styles.meta}>Target: {item.target_uid}</Text>
        {item.details ? <Text style={styles.details}>{String(item.details)}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            style={styles.resolveBtn}
            onPress={() =>
              Alert.alert('Resolve report', 'Mark this report as resolved?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Resolve', style: 'destructive', onPress: () => resolve(item.id) },
              ])
            }
          >
            <Feather name="check-circle" size={18} color="#166534" />
            <Text style={styles.resolveText}>Resolve</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>Reports</Text>
        <Pressable onPress={load} hitSlop={12}>
          <Feather name="refresh-cw" size={20} color="#111827" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#ec4899" />
          <Text style={styles.loadingText}>Loading reports…</Text>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pending reports</Text>
          <Text style={styles.emptyText}>User reports from DMs will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: '#6b7280', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reason: { fontSize: 14, fontWeight: '900', color: '#111827', textTransform: 'capitalize' },
  when: { fontSize: 11, fontWeight: '800', color: '#9ca3af' },
  meta: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#374151' },
  details: { marginTop: 10, fontSize: 13, color: '#111827', lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    gap: 6,
  },
  resolveText: { fontSize: 13, fontWeight: '700', color: '#166534' },
});

