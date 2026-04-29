import { tokens } from '@/app/ui/tokens';
import { db, functions } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AdminAccount = {
  uid: string;
  email?: string | null;
  display_name?: string | null;
  anonymous_username?: string | null;
  role?: string | null;
  disabled?: boolean;
  account_disabled_reason?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

const listAccounts = httpsCallable<{ maxResults?: number }, { ok: boolean; accounts: AdminAccount[] }>(functions, 'adminListAccounts');
const setAccountDisabled = httpsCallable<
  { uid: string; disabled: boolean; reason?: string; emailMessage?: string },
  { ok: boolean; disabled: boolean; emailSent?: boolean; emailError?: string | null }
>(functions, 'adminSetAccountDisabled');

function accountName(account: AdminAccount) {
  return account.display_name || account.anonymous_username || account.email || 'Account';
}

function suspensionEmailTemplate(account: AdminAccount) {
  const name = accountName(account);
  return [
    `Hi ${name},`,
    '',
    'Your Spill account has been suspended by an admin.',
    '',
    'You will not be able to log in while the account is suspended.',
    '',
    'If you think this was a mistake, please contact Spill support.',
  ].join('\n');
}

function reactivationEmailTemplate(account: AdminAccount) {
  const name = accountName(account);
  return [
    `Hi ${name},`,
    '',
    'Your Spill account has been reactivated by an admin.',
    '',
    'You can now log back in and continue using Spill.',
    '',
    'Thanks for being part of the community.',
  ].join('\n');
}

async function loadAccountsFromFirestore(): Promise<AdminAccount[]> {
  const [userSnap, therapistSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), limit(500))),
    getDocs(query(collection(db, 'therapist_profiles'), limit(500))),
  ]);
  const therapistByUid = new Map(therapistSnap.docs.map((d) => [d.id, d.data() as any]));
  const accountMap = new Map<string, AdminAccount>();

  userSnap.docs.forEach((d) => {
    const data = d.data() as any;
    const therapist = therapistByUid.get(d.id);
    accountMap.set(d.id, {
      uid: d.id,
      email: data.email || therapist?.email || null,
      display_name: data.display_name || therapist?.display_name || null,
      anonymous_username: data.anonymous_username || null,
      role: data.is_admin === true || data.is_admin === 'true' ? 'admin' : data.is_staff === true ? 'staff' : therapist ? 'therapist' : 'user',
      disabled: data.account_disabled === true,
      account_disabled_reason: data.account_disabled_reason || null,
      created_at: data.created_at || therapist?.created_at || null,
      last_sign_in_at: data.last_sign_in_at || null,
    });
  });

  therapistByUid.forEach((therapist, uid) => {
    if (accountMap.has(uid)) return;
    accountMap.set(uid, {
      uid,
      email: therapist?.email || null,
      display_name: therapist?.display_name || therapist?.name || null,
      role: 'therapist',
      disabled: therapist?.account_disabled === true,
      account_disabled_reason: therapist?.account_disabled_reason || null,
      created_at: therapist?.created_at || null,
      last_sign_in_at: null,
    });
  });

  return [...accountMap.values()].sort((a, b) => accountName(a).localeCompare(accountName(b)));
}

export default function AdminAccountsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      try {
        const res = await listAccounts({ maxResults: 500 });
        setAccounts(res.data?.accounts || []);
      } catch (callableError) {
        console.warn('adminListAccounts failed, falling back to Firestore profiles', callableError);
        const fallbackAccounts = await loadAccountsFromFirestore();
        setAccounts(fallbackAccounts);
      }
    } catch (e: any) {
      Alert.alert('Could not load accounts', e?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.email, a.display_name, a.anonymous_username, a.role, a.uid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [accounts, search]);

  const stats = useMemo(() => {
    const suspended = accounts.filter((a) => a.disabled).length;
    const therapists = accounts.filter((a) => a.role === 'therapist').length;
    return {
      total: accounts.length,
      active: Math.max(0, accounts.length - suspended),
      suspended,
      therapists,
    };
  }, [accounts]);

  const openAccount = (account: AdminAccount) => {
    setExpandedUid((current) => (current === account.uid ? null : account.uid));
    setEmailDrafts((current) => {
      if (current[account.uid]) return current;
      return { ...current, [account.uid]: account.disabled ? reactivationEmailTemplate(account) : suspensionEmailTemplate(account) };
    });
  };

  const updateAccount = (account: AdminAccount, disabled: boolean) => {
    const title = disabled ? 'Suspend account' : 'Reactivate account';
    const emailMessage = (emailDrafts[account.uid] || (disabled ? suspensionEmailTemplate(account) : reactivationEmailTemplate(account))).trim();
    const message = disabled
      ? `${accountName(account)} will receive the email shown in the account details and will not be able to log in.`
      : `${accountName(account)} will receive the reactivation email shown in the account details and will be able to log in again.`;
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: disabled ? 'Suspend' : 'Reactivate',
          style: disabled ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setBusyUid(account.uid);
              const res = await setAccountDisabled({
                uid: account.uid,
                disabled,
                reason: disabled ? 'Suspended by admin' : undefined,
                emailMessage,
              });
              if (res.data?.emailSent === false) {
                const detail =
                  res.data?.emailError ||
                  (res.data?.recipientEmail ? `Could not send (check Gmail config). Intended recipient: ${res.data.recipientEmail}` : 'Account updated, but email was not sent.');
                Alert.alert(disabled ? 'Account suspended' : 'Account reactivated', detail);
              } else {
                Alert.alert(disabled ? 'Account suspended' : 'Account reactivated');
              }
              load();
            } catch (e: any) {
              Alert.alert('Action failed', e?.message || 'Try again.');
            } finally {
              setBusyUid(null);
            }
          },
        },
      ]
    );
  };

  const renderAccount = ({ item }: { item: AdminAccount }) => {
    const isDisabled = item.disabled === true;
    const isTherapist = item.role === 'therapist';
    const isExpanded = expandedUid === item.uid;
    const draft =
      emailDrafts[item.uid] ||
      (item.disabled ? reactivationEmailTemplate(item) : suspensionEmailTemplate(item));
    return (
    <View style={[styles.card, isDisabled && styles.cardDisabled]}>
      <Pressable style={styles.cardTop} onPress={() => openAccount(item)}>
        <View style={[styles.avatar, isDisabled ? styles.avatarDisabled : isTherapist ? styles.avatarTherapist : styles.avatarUser]}>
          <Feather
            name={isDisabled ? 'user-x' : isTherapist ? 'heart' : item.role === 'admin' ? 'shield' : 'user'}
            size={18}
            color={isDisabled ? '#dc2626' : isTherapist ? '#b45309' : tokens.colors.pink}
          />
        </View>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>{accountName(item)}</Text>
          <Text style={styles.email} numberOfLines={1}>{isExpanded ? 'Tap to close account details' : 'Tap to open account details'}</Text>
        </View>
        <View style={[styles.statusPill, isDisabled ? styles.statusPillDisabled : styles.statusPillActive]}>
          <Feather name={isDisabled ? 'lock' : 'check'} size={11} color={isDisabled ? '#dc2626' : '#047857'} />
          <Text style={[styles.statusText, isDisabled ? styles.statusTextDisabled : styles.statusTextActive]}>
            {isDisabled ? 'Suspended' : 'Active'}
          </Text>
        </View>
      </Pressable>
      <View style={styles.metaRow}>
        <Text style={styles.role}>{String(item.role || 'user')}</Text>
        <Text style={styles.uidPill}>ID {item.uid.slice(0, 7)}</Text>
        {item.last_sign_in_at ? <Text style={styles.meta}>Last login {String(item.last_sign_in_at).slice(0, 10)}</Text> : null}
      </View>
      {isExpanded ? (
        <View style={styles.expandedPanel}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="mail" size={14} color={tokens.colors.pink} />
            </View>
            <View style={styles.detailTextWrap}>
              <Text style={styles.detailLabel}>User email</Text>
              <Text style={styles.detailValue} selectable>
                {item.email || 'Email not loaded'}
              </Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="hash" size={14} color="#b45309" />
            </View>
            <View style={styles.detailTextWrap}>
              <Text style={styles.detailLabel}>Account ID</Text>
              <Text style={styles.detailValue} selectable>{item.uid}</Text>
            </View>
          </View>
          <View style={styles.emailEditor}>
            <View style={styles.emailEditorHeader}>
              <Feather name="edit-3" size={14} color="#b45309" />
              <Text style={styles.emailEditorTitle}>{isDisabled ? 'Reactivation email template' : 'Suspension email template'}</Text>
            </View>
            <TextInput
              value={draft}
              onChangeText={(text) => setEmailDrafts((current) => ({ ...current, [item.uid]: text }))}
              multiline
              textAlignVertical="top"
              style={styles.emailTemplateInput}
              placeholder={isDisabled ? 'Write the email this user should receive after reactivation...' : 'Write the email this user should receive after suspension...'}
              placeholderTextColor={tokens.colors.textMuted}
            />
          </View>
          {isDisabled ? (
            <Text style={styles.unsuspendHint}>This account is suspended. Use the button below to send the email and unsuspend login access.</Text>
          ) : null}
        </View>
      ) : null}
      {item.account_disabled_reason ? (
        <View style={styles.reasonBox}>
          <Feather name="alert-circle" size={14} color="#dc2626" />
          <Text style={styles.reason}>Reason: {item.account_disabled_reason}</Text>
        </View>
      ) : null}
      <Pressable
        style={[styles.actionBtn, isDisabled ? styles.enableBtn : styles.disableBtn, busyUid === item.uid && { opacity: 0.6 }]}
        onPress={() => {
          if (!isExpanded) {
            openAccount(item);
            return;
          }
          updateAccount(item, !isDisabled);
        }}
        disabled={busyUid === item.uid}
      >
        {busyUid === item.uid ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Feather name={isDisabled ? 'unlock' : 'slash'} size={16} color="#fff" />
            <Text style={styles.actionText}>{isDisabled ? (isExpanded ? 'Send email & unsuspend' : 'Open account to unsuspend') : isExpanded ? 'Send email & suspend' : 'Open account to suspend'}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Account controls</Text>
          <Text style={styles.subtitle}>Suspend users, therapists, and staff accounts.</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={load}>
          <Feather name="refresh-cw" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading accounts...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          renderItem={renderAccount}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                  <View style={styles.heroIcon}>
                    <Feather name="shield" size={22} color="#b45309" />
                  </View>
                  <View style={styles.heroAccent}>
                    <Feather name="user-check" size={16} color={tokens.colors.pink} />
                  </View>
                </View>
                <Text style={styles.heroLabel}>Admin control center</Text>
                <Text style={styles.heroTitle}>Manage account access</Text>
                <Text style={styles.heroText}>Suspend accounts when needed, then unsuspend them once they are ready to return.</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{stats.total}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{stats.active}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                  <View style={[styles.statPill, styles.statPillWarn]}>
                    <Text style={styles.statValue}>{stats.suspended}</Text>
                    <Text style={styles.statLabel}>Suspended</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{stats.therapists}</Text>
                    <Text style={styles.statLabel}>Therapists</Text>
                  </View>
                </View>
              </View>
              <View style={styles.searchBox}>
                <Feather name="search" size={16} color={tokens.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name, email, role..."
                  placeholderTextColor={tokens.colors.textMuted}
                />
              </View>
              <Text style={styles.sectionTitle}>Accounts</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={tokens.colors.pink} />}
          ListEmptyComponent={<Text style={styles.empty}>No accounts found.</Text>}
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '900', color: tokens.colors.text },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '800', color: tokens.colors.textMuted },
  listHeader: { gap: 14, marginBottom: 4 },
  heroCard: {
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: '#b45309' },
  heroTitle: { marginTop: 5, fontSize: 25, lineHeight: 30, fontWeight: '900', color: tokens.colors.text },
  heroText: { marginTop: 7, fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#92400e' },
  statsRow: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statPill: {
    flexGrow: 1,
    minWidth: '22%',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statPillWarn: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FDA4AF',
  },
  statValue: { fontSize: 18, fontWeight: '900', color: tokens.colors.text, textAlign: 'center' },
  statLabel: { marginTop: 2, fontSize: 10, fontWeight: '900', color: '#9A3412', textAlign: 'center', textTransform: 'uppercase' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 12,
    height: 50,
  },
  searchInput: { flex: 1, color: tokens.colors.text, fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 13, fontWeight: '800', color: '#9A3412' },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 30 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: tokens.colors.text },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 15,
    marginBottom: 12,
    shadowColor: '#92400e',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardDisabled: { backgroundColor: '#FFF1F2', borderColor: '#FDA4AF' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1, minWidth: 0 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarUser: { backgroundColor: '#FCE7F3', borderColor: '#F9A8D4' },
  avatarTherapist: { backgroundColor: '#FEF3C7', borderColor: '#FBBF24' },
  avatarDisabled: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  name: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  email: { marginTop: 3, fontSize: 12, fontWeight: '750', color: tokens.colors.textMuted },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPillActive: { backgroundColor: 'rgba(16,185,129,0.12)' },
  statusPillDisabled: { backgroundColor: 'rgba(239,68,68,0.12)' },
  statusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  statusTextActive: { color: '#047857' },
  statusTextDisabled: { color: '#dc2626' },
  metaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  role: {
    fontSize: 12,
    fontWeight: '900',
    color: '#BE185D',
    textTransform: 'capitalize',
    backgroundColor: '#FCE7F3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  uidPill: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400e',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  meta: { fontSize: 12, fontWeight: '800', color: tokens.colors.textMuted },
  reasonBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.08)',
    padding: 10,
  },
  reason: { flex: 1, fontSize: 12, fontWeight: '800', color: '#dc2626', lineHeight: 17 },
  expandedPanel: {
    marginTop: 12,
    gap: 10,
    borderRadius: 20,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextWrap: { flex: 1, minWidth: 0 },
  detailLabel: { fontSize: 10, fontWeight: '900', color: '#9A3412', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '800', color: tokens.colors.text },
  emailEditor: {
    marginTop: 2,
    gap: 8,
  },
  emailEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emailEditorTitle: { fontSize: 12, fontWeight: '900', color: '#92400e' },
  emailTemplateInput: {
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FBBF24',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  unsuspendHint: {
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.10)',
    padding: 11,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#047857',
  },
  actionBtn: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disableBtn: { backgroundColor: tokens.colors.danger },
  enableBtn: { backgroundColor: '#10B981' },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  empty: { marginTop: 40, textAlign: 'center', color: '#9A3412', fontWeight: '800' },
});
