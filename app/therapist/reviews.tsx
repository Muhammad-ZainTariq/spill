import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';
import { tokens } from '@/app/ui/tokens';

type TherapistReview = {
  id: string;
  therapist_uid: string;
  session_id: string;
  reviewer_uid: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

export default function TherapistReviewsScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid || null;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TherapistReview[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (!uid) return;
      const q = query(collection(db, 'therapist_reviews'), where('therapist_uid', '==', uid), limit(200));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TherapistReview[];
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setItems(list.slice(0, 50));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load reviews.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const ratings = items.map((x) => Number(x.rating || 0)).filter((n) => Number.isFinite(n) && n > 0);
    const avg = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    return { count: items.length, avg };
  }, [items]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reviews</Text>
          <Text style={styles.subtitle}>
            {stats.avg != null ? `Avg ${stats.avg}/5 • ` : ''}
            {stats.count} total
          </Text>
        </View>
        <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
          <Feather name="refresh-cw" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.muted}>When sessions end, patients can leave private feedback.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {items.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.stars}>{'★★★★★'.slice(0, Math.max(1, Math.min(5, Number(r.rating || 0))))}</Text>
                    <Text style={styles.date}>{String(r.created_at || '').slice(0, 10)}</Text>
                  </View>
                  {r.comment ? <Text style={styles.text}>{String(r.comment)}</Text> : <Text style={styles.muted}>No comment.</Text>}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textMuted },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text, textAlign: 'center' },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 28 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },
  date: { fontSize: 11, fontWeight: '800', color: tokens.colors.textMuted },
  text: { marginTop: 8, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },
});

