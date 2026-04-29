import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

function statusTone(status: string, pct: number) {
  if (status === 'approved') return { label: 'Approved', bg: '#DCFCE7', fg: '#047857', icon: 'check-circle' as const };
  if (status === 'rejected') return { label: 'Rejected', bg: '#FEE2E2', fg: '#DC2626', icon: 'x-circle' as const };
  if (status === 'resubmitted') return { label: 'Resubmitted', bg: '#FEF3C7', fg: '#92400E', icon: 'refresh-cw' as const };
  if (status === 'completed') return { label: 'Ready review', bg: '#FEF3C7', fg: '#92400E', icon: 'file-text' as const };
  if (pct >= 100) return { label: 'Complete', bg: '#DCFCE7', fg: '#047857', icon: 'check-circle' as const };
  if (status === 'invited') return { label: 'Invited', bg: '#FCE7F3', fg: '#BE185D', icon: 'mail' as const };
  return { label: status.replace(/_/g, ' ') || 'Pending', bg: '#F1F5F9', fg: tokens.colors.textSecondary, icon: 'clock' as const };
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

  const stats = useMemo(() => {
    const progress = items.map(countUploadedFor);
    const complete = progress.filter((p) => p.pct >= 100).length;
    const needsDocs = progress.filter((p) => p.pct < 100).length;
    const avg = progress.length ? Math.round(progress.reduce((sum, p) => sum + p.pct, 0) / progress.length) : 0;
    return { total: items.length, complete, needsDocs, avg };
  }, [items]);

  const renderItem = ({ item }: { item: Req }) => {
    const p = countUploadedFor(item);
    const status = String(item.status || 'pending');
    const name = String(item.name || 'Therapist');
    const email = String(item.email || '');
    const tone = statusTone(status, p.pct);
    const complete = p.pct >= 100;
    const missingCount = p.total - p.done;

    return (
      <Pressable
        style={[styles.card, complete && styles.cardComplete]}
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
          <View style={styles.avatar}>
            <Feather name={complete ? 'check' : 'file-text'} size={18} color={complete ? '#047857' : tokens.colors.pink} />
          </View>
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.email} numberOfLines={1}>{email || 'No email'}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Feather name={tone.icon as any} size={12} color={tone.fg} />
            <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>{complete ? 'Verification upload complete' : `${p.done}/${p.total} items uploaded`}</Text>
          <Text style={styles.progressPercent}>{p.pct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, complete && styles.progressFillComplete, { width: `${p.pct}%` }]} />
        </View>
        <View style={styles.checkRow}>
          <View style={styles.checkPill}>
            <Feather name="file" size={13} color="#92400e" />
            <Text style={styles.checkPillText}>Docs {p.docsDone}/{p.docsTotal}</Text>
          </View>
          <View style={[styles.checkPill, p.videoDone && styles.checkPillDone]}>
            <Feather name="video" size={13} color={p.videoDone ? '#047857' : '#92400e'} />
            <Text style={[styles.checkPillText, p.videoDone && styles.checkPillTextDone]}>Video {p.videoDone ? 'uploaded' : 'needed'}</Text>
          </View>
          <View style={[styles.checkPill, missingCount === 0 ? styles.checkPillDone : styles.checkPillMissing]}>
            <Feather name={missingCount === 0 ? 'check-circle' : 'alert-circle'} size={13} color={missingCount === 0 ? '#047857' : '#BE185D'} />
            <Text style={[styles.checkPillText, missingCount === 0 ? styles.checkPillTextDone : styles.checkPillTextMissing]}>
              {missingCount === 0 ? 'All complete' : `${missingCount} missing`}
            </Text>
          </View>
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
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Feather name="clipboard" size={22} color="#92400e" />
                </View>
                <View style={styles.heroAccent}>
                  <Text style={styles.heroAccentText}>{stats.avg}%</Text>
                </View>
              </View>
              <Text style={styles.heroLabel}>Verification progress</Text>
              <Text style={styles.heroTitle}>Therapist documents</Text>
              <Text style={styles.heroText}>Track uploaded documents, ID videos, and ready-for-review therapists in one place.</Text>
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={[styles.statPill, styles.statComplete]}>
                  <Text style={styles.statValue}>{stats.complete}</Text>
                  <Text style={styles.statLabel}>Complete</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.needsDocs}</Text>
                  <Text style={styles.statLabel}>Needs docs</Text>
                </View>
              </View>
            </View>
          }
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
  safe: { flex: 1, backgroundColor: tokens.colors.bgSecondary },
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
  listContent: { padding: tokens.spacing.screenHorizontal, paddingBottom: 28 },
  heroCard: {
    marginBottom: 14,
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    shadowColor: '#92400e',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAccent: {
    minWidth: 48,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAccentText: { fontSize: 14, fontWeight: '900', color: '#BE185D' },
  heroLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: '#b45309' },
  heroTitle: { marginTop: 5, fontSize: 25, lineHeight: 30, fontWeight: '900', color: tokens.colors.text },
  heroText: { marginTop: 7, fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#92400e' },
  statsRow: { marginTop: 16, flexDirection: 'row', gap: 8 },
  statPill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  statComplete: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.25)' },
  statValue: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  statLabel: { marginTop: 2, fontSize: 10, fontWeight: '900', color: '#9A3412', textTransform: 'uppercase' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    shadowColor: '#92400e',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardComplete: { borderColor: '#FBBF24', backgroundColor: '#fff' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  email: { marginTop: 3, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  progressHeader: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  progressTitle: { flex: 1, fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  progressPercent: { fontSize: 13, fontWeight: '900', color: '#BE185D' },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { height: '100%', backgroundColor: tokens.colors.pink },
  progressFillComplete: { backgroundColor: '#10B981' },
  checkRow: { marginTop: 11, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  checkPillDone: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.24)' },
  checkPillMissing: { backgroundColor: '#FCE7F3', borderColor: '#F9A8D4' },
  checkPillText: { fontSize: 11, fontWeight: '900', color: '#92400e' },
  checkPillTextDone: { color: '#047857' },
  checkPillTextMissing: { color: '#BE185D' },
});

