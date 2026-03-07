import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { db } from '@/lib/firebase';
import { tokens } from '@/app/ui/tokens';
import { UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS } from '@/app/functions';

type Req = {
  id: string;
  name?: string | null;
  email?: string | null;
  specialization?: string | null;
  status?: string | null;
  requested_item_ids?: string[] | null;
  document_uploads?: Record<string, { url?: string | null }> | null;
  verification_video?: { url?: string | null } | null;
  completed_uid?: string | null;
  created_at?: any;
};

function countUploadedFor(req: Req) {
  const uploads = req.document_uploads && typeof req.document_uploads === 'object' ? req.document_uploads : {};
  const requested = Array.isArray(req.requested_item_ids) && req.requested_item_ids.length
    ? req.requested_item_ids.filter(Boolean)
    : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS.filter((x) => x.requiredForDemo).map((x) => x.id);
  const docsDone = requested.filter((id) => !!uploads?.[id]?.url).length;
  const docsTotal = requested.length;
  const videoDone = !!req.verification_video?.url;
  const total = docsTotal + 1;
  const done = docsDone + (videoDone ? 1 : 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { docsDone, docsTotal, videoDone, done, total, pct };
}

export default function AdminTherapistProgressScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Req[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'therapist_onboarding_requests'));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Req[];
      // Sort: completed/resubmitted first, then invited/pending, then approved
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setItems(list);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load therapists.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({ item }: { item: Req }) => {
    const p = countUploadedFor(item);
    const status = String(item.status || 'pending');
    const name = String(item.name || 'Therapist');
    const email = String(item.email || '');

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: '/admin/therapist-comments',
            params: {
              requestId: item.id,
              therapistUid: String(item.completed_uid || ''),
              email,
              name,
            },
          } as any);
        }}
      >
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{status.replace(/_/g, ' ')}</Text>
          </View>
        </View>
        <Text style={styles.email} numberOfLines={1}>{email}</Text>
        <Text style={styles.meta}>
          Docs {p.docsDone}/{p.docsTotal} • Video {p.videoDone ? 'yes' : 'no'} • {p.pct}%
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${p.pct}%` }]} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Therapist progress</Text>
          <Text style={styles.subtitle}>Upload progress + reviews</Text>
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
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: tokens.spacing.screenHorizontal, paddingBottom: 28 }}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No therapists yet</Text>
              <Text style={styles.muted}>Onboarding requests will appear here.</Text>
            </View>
          }
        />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 12,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flex: 1, fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(244,114,182,0.14)' },
  pillText: { fontSize: 11, fontWeight: '900', color: tokens.colors.pink, textTransform: 'capitalize' },
  email: { marginTop: 6, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  meta: { marginTop: 8, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { height: '100%', backgroundColor: tokens.colors.pink },
});

