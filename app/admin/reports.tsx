import { Feather } from '@expo/vector-icons';
import { tokens } from '@/app/ui/tokens';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';

type ReportProfile = {
  display_name?: string | null;
  anonymous_username?: string | null;
  email?: string | null;
};

type ModReport = {
  id: string;
  reporter_uid: string;
  target_uid: string;
  type?: string;
  conversation_id?: string;
  match_id?: string;
  session_id?: string;
  message_id?: string | null;
  message_content?: string | null;
  reason?: string | null;
  details?: string | null;
  created_at?: string | null;
  status?: string | null;
  reporter?: ReportProfile | null;
  target?: ReportProfile | null;
};

function profileLabel(profile: ReportProfile | null | undefined, uid: string) {
  return profile?.display_name || profile?.anonymous_username || profile?.email || (uid ? `User ${uid.slice(0, 7)}` : 'Unknown user');
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ModReport[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const lim = 120;
      const [dmSnap, matchSnap, sessSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'reports'),
            where('type', '==', 'user_dm'),
            where('status', '==', 'pending'),
            orderBy('created_at', 'desc'),
            limit(lim)
          )
        ),
        getDocs(
          query(
            collection(db, 'reports'),
            where('type', '==', 'match_message'),
            where('status', '==', 'pending'),
            orderBy('created_at', 'desc'),
            limit(lim)
          )
        ),
        getDocs(
          query(
            collection(db, 'reports'),
            where('type', '==', 'therapist_session_message'),
            where('status', '==', 'pending'),
            orderBy('created_at', 'desc'),
            limit(lim)
          )
        ),
      ]);
      const rawReports = [...dmSnap.docs, ...matchSnap.docs, ...sessSnap.docs]
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as ModReport);
      const profileIds = [...new Set(rawReports.flatMap((r) => [r.reporter_uid, r.target_uid]).filter(Boolean))];
      const profileEntries = await Promise.all(
        profileIds.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            return [uid, snap.exists() ? (snap.data() as ReportProfile) : null] as const;
          } catch {
            return [uid, null] as const;
          }
        })
      );
      const profiles = new Map(profileEntries);
      const list = rawReports
        .map((report) => ({
          ...report,
          reporter: profiles.get(report.reporter_uid) || null,
          target: profiles.get(report.target_uid) || null,
        }))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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

  const sendWarning = async (report: ModReport) => {
    try {
      const targetUid = String(report.target_uid || '').trim();
      if (!targetUid) {
        Alert.alert('No target found', 'This report does not have a reported user attached.');
        return;
      }
      await addDoc(collection(db, 'notifications'), {
        recipient_id: targetUid,
        from_user_id: auth.currentUser?.uid || 'admin',
        type: 'moderation_warning',
        title: 'Message warning',
        body: 'A message you wrote was reported and reviewed by moderation. Please keep conversations respectful and safe.',
        report_id: report.id,
        message_id: report.message_id || null,
        read: false,
        created_at: new Date().toISOString(),
      });
      Alert.alert('Warning sent', 'The reported user will see this moderation warning.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send warning.');
    }
  };

  const typeLabel = (t?: string) => {
    if (t === 'match_message') return 'Match chat';
    if (t === 'therapist_session_message') return 'Therapist session';
    return 'DM';
  };

  const renderItem = ({ item }: { item: ModReport }) => {
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    const preview = item.message_content || item.details;
    const reporterName = profileLabel(item.reporter, item.reporter_uid);
    const targetName = profileLabel(item.target, item.target_uid);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.typeIcon}>
            <Feather name="message-square" size={17} color={tokens.colors.pink} />
          </View>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.typePill}>{typeLabel(item.type)}</Text>
            <Text style={styles.reason}>{String(item.reason || 'report').replace(/_/g, ' ')}</Text>
          </View>
          <Text style={styles.when}>{when}</Text>
        </View>

        <View style={styles.peopleGrid}>
          <View style={styles.personBox}>
            <Text style={styles.personLabel}>Who reported</Text>
            <Text style={styles.personName} numberOfLines={1}>{reporterName}</Text>
            <Text style={styles.personUid} selectable>{item.reporter_uid}</Text>
          </View>
          <View style={styles.personBoxWarn}>
            <Text style={styles.personLabelWarn}>Who wrote it</Text>
            <Text style={styles.personName} numberOfLines={1}>{targetName}</Text>
            <Text style={styles.personUid} selectable>{item.target_uid}</Text>
          </View>
        </View>

        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Reported message</Text>
          <Text style={styles.details}>{preview ? String(preview) : 'No message preview was saved with this report.'}</Text>
        </View>

        <View style={styles.metaRow}>
          {item.conversation_id ? <Text style={styles.metaPill}>Conversation {item.conversation_id.slice(0, 8)}</Text> : null}
          {item.match_id ? <Text style={styles.metaPill}>Match {item.match_id.slice(0, 8)}</Text> : null}
          {item.session_id ? <Text style={styles.metaPill}>Session {item.session_id.slice(0, 8)}</Text> : null}
          {item.message_id ? <Text style={styles.metaPill}>Message {item.message_id.slice(0, 8)}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.warnBtn]}
            onPress={() =>
              Alert.alert('Send warning', 'Send a warning to the user who wrote this message?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send warning', onPress: () => sendWarning(item) },
              ])
            }
          >
            <Feather name="alert-triangle" size={16} color="#92400e" />
            <Text style={styles.warnText}>Send warning</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.resolveBtn]}
            onPress={() =>
              Alert.alert('Resolve report', 'Mark this report as resolved?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Resolve', onPress: () => resolve(item.id) },
              ])
            }
          >
            <Feather name="check-circle" size={16} color="#047857" />
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
          <Text style={styles.emptyText}>Reports from DMs, match chats, and therapist sessions show here.</Text>
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
  container: { flex: 1, backgroundColor: tokens.colors.bgSecondary },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  title: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: tokens.colors.textMuted, fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: tokens.colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: tokens.colors.textSecondary, textAlign: 'center', lineHeight: 20, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#92400e',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: { flex: 1, minWidth: 0, gap: 4 },
  typePill: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '900',
    color: '#BE185D',
    backgroundColor: '#FCE7F3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  reason: { fontSize: 15, fontWeight: '900', color: tokens.colors.text, textTransform: 'capitalize' },
  when: { fontSize: 11, fontWeight: '800', color: '#9ca3af' },
  peopleGrid: { marginTop: 13, flexDirection: 'row', gap: 10 },
  personBox: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: tokens.colors.bgSecondary,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 11,
  },
  personBoxWarn: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 11,
  },
  personLabel: { fontSize: 10, fontWeight: '900', color: tokens.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  personLabelWarn: { fontSize: 10, fontWeight: '900', color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.3 },
  personName: { marginTop: 4, fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  personUid: { marginTop: 3, fontSize: 10, fontWeight: '700', color: tokens.colors.textMuted },
  messageBox: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FBBF24',
    padding: 13,
  },
  messageLabel: { fontSize: 10, fontWeight: '900', color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4 },
  details: { marginTop: 6, fontSize: 14, color: tokens.colors.text, lineHeight: 20, fontWeight: '700' },
  metaRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 13, gap: 8 },
  actionBtn: {
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  warnBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  resolveBtn: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
  },
  warnText: { fontSize: 12, fontWeight: '900', color: '#92400e' },
  resolveText: { fontSize: 12, fontWeight: '900', color: '#047857' },
});

