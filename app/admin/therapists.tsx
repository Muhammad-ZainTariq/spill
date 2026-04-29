import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS } from '@/app/functions';
import { tokens } from '@/app/ui/tokens';
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
  document_uploads?: Record<string, { url?: string | null }> | null;
  requested_item_ids?: string[] | null;
  verification_video?: { url?: string | null } | null;
  completed_uid?: string | null;
  admin_request_message?: string | null;
}

function countUploadedFor(req: TherapistRequest) {
  const uploads = req.document_uploads && typeof req.document_uploads === 'object' ? req.document_uploads : {};
  const requested = Array.isArray(req.requested_item_ids) && req.requested_item_ids.length
    ? req.requested_item_ids.filter(Boolean)
    : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS.filter((x) => x.requiredForDemo).map((x) => x.id);
  const docsDone = requested.filter((id) => !!uploads?.[id]?.url).length;
  const videoDone = !!req.verification_video?.url;
  const total = requested.length + 1;
  const done = docsDone + (videoDone ? 1 : 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function statusTone(status: string, pct: number) {
  if (status === 'approved') return { label: 'Approved', bg: '#DCFCE7', fg: '#047857' };
  if (status === 'rejected') return { label: 'Rejected', bg: '#FEE2E2', fg: '#DC2626' };
  if (status === 'resubmitted') return { label: 'Resubmitted', bg: '#FCE7F3', fg: '#BE185D' };
  if (status === 'completed') return { label: 'Ready review', bg: '#FEF3C7', fg: '#92400E' };
  if (pct >= 100) return { label: 'Complete', bg: '#FEF3C7', fg: '#92400E' };
  if (status === 'invited') return { label: 'Invited', bg: '#FCE7F3', fg: '#BE185D' };
  return { label: status.replace(/_/g, ' ') || 'Pending', bg: '#F1F5F9', fg: '#64748B' };
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

  const stats = useMemo(() => {
    const progress = requests.map(countUploadedFor);
    const ready = progress.filter((p) => p.pct >= 100).length;
    const pending = requests.filter((r) => !['approved', 'rejected'].includes(String(r.status || 'pending'))).length;
    return { total: requests.length, ready, pending };
  }, [requests]);

  const renderItem = ({ item }: { item: TherapistRequest }) => {
    const created =
      (item.created_at?.toDate?.() as Date | undefined) ??
      (item.created_at ? new Date(item.created_at) : null);
    const createdLabel = created ? created.toLocaleString() : '';
    const progress = countUploadedFor(item);
    const tone = statusTone(String(item.status || 'pending'), progress.pct);

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: '/admin/therapist-request', params: { requestId: item.id } } as any);
        }}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Feather name="user-check" size={18} color={tokens.colors.pink} />
          </View>
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{item.name || 'Unknown'}</Text>
            <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {item.specialization ? (
            <View style={styles.infoPill}>
              <Feather name="heart" size={12} color="#92400E" />
              <Text style={styles.infoPillText} numberOfLines={1}>{item.specialization}</Text>
            </View>
          ) : null}
          {createdLabel ? (
            <View style={styles.infoPill}>
              <Feather name="clock" size={12} color="#92400E" />
              <Text style={styles.infoPillText} numberOfLines={1}>{createdLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Uploads {progress.done}/{progress.total}</Text>
          <Text style={styles.progressPercent}>{progress.pct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.pct}%` }]} />
        </View>
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
        <View style={{ flex: 1 }}>
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
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.heroCard}>
                <View style={styles.heroIcon}>
                  <Feather name="clipboard" size={22} color="#92400E" />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroLabel}>Admin review</Text>
                  <Text style={styles.heroTitle}>Therapist onboarding</Text>
                  <Text style={styles.heroText}>Review uploaded documents, invite therapists, and approve completed profiles.</Text>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{stats.total}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{stats.ready}</Text>
                    <Text style={styles.statLabel}>Ready</Text>
                  </View>
                  <View style={styles.statPillPink}>
                    <Text style={styles.statValue}>{stats.pending}</Text>
                    <Text style={styles.statLabel}>Open</Text>
                  </View>
                </View>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bgSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  title: { fontSize: 22, fontWeight: '900', color: tokens.colors.text },
  subtitle: { fontSize: 12, color: tokens.colors.textMuted, fontWeight: '700', marginTop: 2 },
  container: { flex: 1 },
  listContent: { padding: tokens.spacing.screenHorizontal, paddingTop: 12, paddingBottom: 24 },
  heroCard: {
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    shadowColor: '#92400E',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroCopy: { gap: 4 },
  heroLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: '#B45309' },
  heroTitle: { fontSize: 25, lineHeight: 30, fontWeight: '900', color: tokens.colors.text },
  heroText: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#92400E' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statPill: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
  },
  statPillPink: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
  },
  statValue: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  statLabel: { marginTop: 2, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', color: '#92400E' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#92400E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  email: { marginTop: 2, fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  infoPillText: { fontSize: 11, fontWeight: '900', color: '#92400E' },
  progressHeader: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, fontWeight: '900', color: tokens.colors.text },
  progressPercent: { fontSize: 12, fontWeight: '900', color: '#BE185D' },
  progressTrack: { marginTop: 8, height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  progressFill: { height: '100%', backgroundColor: tokens.colors.pink },
});

