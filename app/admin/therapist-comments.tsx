import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { tokens } from '@/app/ui/tokens';

type Review = {
  id: string;
  therapist_uid: string;
  session_id: string;
  reviewer_uid: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

function mailto(email: string, subject: string, body: string) {
  const e = String(email || '').trim();
  if (!e) return null;
  const url = `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return url;
}

export default function AdminTherapistCommentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const therapistUid = String((params as any)?.therapistUid || '').trim();
  const email = String((params as any)?.email || '').trim();
  const name = String((params as any)?.name || 'Therapist').trim();
  const requestId = String((params as any)?.requestId || '').trim();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Review[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (!therapistUid) {
        setItems([]);
        return;
      }
      const q = query(collection(db, 'therapist_reviews'), where('therapist_uid', '==', therapistUid), limit(200));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Review[];
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setItems(list.slice(0, 50));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load comments.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [therapistUid]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const ratings = items.map((x) => Number(x.rating || 0)).filter((n) => Number.isFinite(n) && n > 0);
    const avg = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    return { count: items.length, avg };
  }, [items]);

  const handleEmail = async () => {
    const subject = 'Spill therapist account';
    const body = `Hi ${name || ''},\n\n(Write your message here)\n\n— Spill admin`;
    const url = mailto(email, subject, body);
    if (!url) {
      Alert.alert('Missing email', 'No therapist email found for this request.');
      return;
    }
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert('Email not available', 'No email app is available on this device.');
      return;
    }
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{name || 'Therapist'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {stats.avg != null ? `Avg ${stats.avg}/5 • ` : ''}
            {stats.count} reviews
          </Text>
        </View>
        <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
          <Feather name="refresh-cw" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin actions</Text>
          {email ? <Text style={styles.meta}>Email: {email}</Text> : <Text style={styles.meta}>Email: (missing)</Text>}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={styles.actionBtn} onPress={handleEmail}>
              <Feather name="mail" size={16} color="#fff" />
              <Text style={styles.actionText}>Email therapist</Text>
            </Pressable>
            {requestId ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => router.push({ pathname: '/admin/therapist-request', params: { requestId } } as any)}
              >
                <Text style={styles.secondaryText}>Open onboarding</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Comments (private)</Text>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={tokens.colors.pink} />
              <Text style={styles.muted}>Loading…</Text>
            </View>
          ) : items.length === 0 ? (
            <Text style={styles.muted}>No reviews yet.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {items.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <View style={styles.rowTop}>
                    <Text style={styles.stars}>{'★★★★★'.slice(0, Math.max(1, Math.min(5, Number(r.rating || 0))))}</Text>
                    <Text style={styles.date}>{String(r.created_at || '').slice(0, 10)}</Text>
                  </View>
                  {r.comment ? <Text style={styles.text}>{String(r.comment)}</Text> : <Text style={styles.muted}>No comment.</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 28, gap: 12 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '900', color: tokens.colors.text },
  meta: { marginTop: 8, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: tokens.colors.text, fontSize: 13, fontWeight: '900' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted },
  reviewRow: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: tokens.colors.surfaceOverlay },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },
  date: { fontSize: 11, fontWeight: '800', color: tokens.colors.textMuted },
  text: { marginTop: 8, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },
});

