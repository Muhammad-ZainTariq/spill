import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, orderBy, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { approvePostAsSafe } from '../functions';

interface FlaggedPost {
  id: string;
  content: string;
  created_at?: string;
  toxicity_score?: number;
  user_id?: string;
}

export default function FlaggedScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FlaggedPost[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('flagged_for_toxicity', '==', true),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const list: FlaggedPost[] = snap.docs.map((d) => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          content: String(data.content || ''),
          created_at: data.created_at,
          toxicity_score: data.toxicity_score,
          user_id: data.user_id,
        };
      });
      setPosts(list);
    } catch (e: any) {
      console.error('Load flagged posts error', e);
      Alert.alert('Error', e?.message || 'Failed to load flagged posts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (postId: string) => {
    try {
      // Best-effort: call cloud function if wired, otherwise just clear flag field locally
      try {
        await approvePostAsSafe(postId);
      } catch {
        await updateDoc(doc(db, 'posts', postId), {
          approved_safe_at: new Date().toISOString(),
        });
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e: any) {
      console.error('Approve flagged post error', e);
      Alert.alert('Error', e?.message || 'Failed to approve post.');
    }
  };

  const renderItem = ({ item }: { item: FlaggedPost }) => (
    <View style={styles.card}>
      <Text style={styles.content}>{item.content || '(no content)'}</Text>
      <Text style={styles.meta}>
        Toxicity score: {item.toxicity_score != null ? `${Math.round(item.toxicity_score * 100)}%` : 'n/a'}
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.approveBtn}
          onPress={() =>
            Alert.alert('Approve post', 'Mark this as safe and show it in the feed?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Approve', style: 'destructive', onPress: () => handleApprove(item.id) },
            ])
          }
        >
          <Feather name="check-circle" size={18} color="#16a34a" />
          <Text style={styles.approveText}>Approve as safe</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>Flagged stuff</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#ec4899" />
          <Text style={styles.loadingText}>Loading flagged posts…</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing flagged 🎉</Text>
          <Text style={styles.emptyText}>When moderation flags posts, they’ll show up here for review.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
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
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: '#6b7280', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  content: { fontSize: 15, color: '#111827', marginBottom: 8 },
  meta: { fontSize: 12, color: '#9ca3af', marginBottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    gap: 6,
  },
  approveText: { fontSize: 13, fontWeight: '600', color: '#166534' },
});

