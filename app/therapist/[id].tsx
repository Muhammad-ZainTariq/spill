import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { auth, db } from '@/lib/firebase';
import { tokens } from '@/app/ui/tokens';
import {
  bookTherapistSlot,
  createTherapistSlot,
  getUserLite,
  getTherapistProfile,
  listOpenSlotsForTherapist,
  listReviewsForTherapist,
  listSessionsForTherapist,
  TherapistProfile,
  TherapistReview,
  TherapistSession,
  TherapistSlot,
  upsertMyTherapistProfile,
} from '@/app/therapist/marketplace';

function fmtSlot(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${startIso} → ${endIso}`;
  const day = s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const start = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day} • ${start}–${end}`;
}

export default function TherapistProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const therapistId = String(params?.id || '').trim();

  const meUid = auth.currentUser?.uid || null;
  const isMe = !!meUid && meUid === therapistId;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TherapistProfile | null>(null);
  const [slots, setSlots] = useState<TherapistSlot[]>([]);
  const [sessions, setSessions] = useState<TherapistSession[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [reviews, setReviews] = useState<TherapistReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'appointments' | 'profile'>('appointments');

  const [editName, setEditName] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editLangs, setEditLangs] = useState('');
  const [editBio, setEditBio] = useState('');

  const handleLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
            router.replace('/login' as any);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not log out.');
          }
        },
      },
    ]);
  }, [router]);

  const load = useCallback(async () => {
    if (!therapistId) return;
    setLoading(true);
    try {
      const [p, s, sess, revs] = await Promise.all([
        getTherapistProfile(therapistId),
        listOpenSlotsForTherapist(therapistId, 25),
        isMe ? listSessionsForTherapist(therapistId, 80) : Promise.resolve([]),
        isMe ? listReviewsForTherapist(therapistId, 30) : Promise.resolve([]),
      ]);
      setProfile(p);
      setSlots(s);
      setSessions(sess);
      setReviews(revs);
      if (p) {
        setEditName(String(p.display_name || ''));
        setEditSpec(String(p.specialization || ''));
        setEditLangs(Array.isArray(p.languages) ? p.languages.join(', ') : '');
        setEditBio(String(p.bio || ''));
      }
      if (isMe && Array.isArray(sess) && sess.length) {
        // Best-effort hydrate patient display names for the appointments list.
        const unique = [...new Set(sess.map((x) => String(x.user_uid || '').trim()).filter(Boolean))].slice(0, 80);
        const entries = await Promise.all(unique.map(async (uid) => [uid, await getUserLite(uid)] as const));
        const next: Record<string, any> = {};
        for (const [uid, u] of entries) next[uid] = u || { id: uid };
        setUserMap(next);
      } else {
        setUserMap({});
      }
    } finally {
      setLoading(false);
    }
  }, [therapistId]);

  useEffect(() => {
    load();
  }, [load]);

  const isPremium = useCallback(async () => {
    if (!auth.currentUser) return false;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const data = snap.data() as any;
    if (!data?.is_premium) return false;
    const exp = data?.premium_expires_at;
    if (typeof exp === 'string' && exp) {
      const t = Date.parse(exp);
      if (Number.isFinite(t) && t < Date.now()) return false;
    }
    return true;
  }, []);

  const handleBook = async (slotId: string) => {
    const premium = await isPremium();
    if (!premium) {
      Alert.alert(
        'Premium required',
        'Private therapist sessions are available to premium members only.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go Premium', onPress: () => router.push('/premium' as any) },
        ]
      );
      return;
    }
    Alert.alert('Book session', 'Confirm booking this slot?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Book',
        onPress: async () => {
          const res = await bookTherapistSlot(slotId);
          if (!res.ok) Alert.alert('Error', res.error || 'Booking failed.');
          else {
            Alert.alert('Booked', 'Your session was booked.', [
              { text: 'OK' },
              res.sessionId ? { text: 'Open chat', onPress: () => router.push(`/therapist-session/${res.sessionId}` as any) } : null,
            ].filter(Boolean) as any);
            load();
          }
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    if (!isMe) return;
    if (saving) return;
    setSaving(true);
    try {
      const languages = editLangs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      await upsertMyTherapistProfile({
        display_name: editName.trim() || null,
        specialization: editSpec.trim() || null,
        languages,
        bio: editBio.trim() || null,
      });
      Alert.alert('Saved', 'Profile updated.');
      // After saving, take therapist back to their main view (appointments).
      setTab('appointments');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const quickAddSlot = async (durationMin: number, offsetMinutes: number) => {
    if (!isMe) return;
    try {
      const start = new Date(Date.now() + offsetMinutes * 60 * 1000);
      // round to next 5 minutes
      start.setSeconds(0, 0);
      const m = start.getMinutes();
      start.setMinutes(m + ((5 - (m % 5)) % 5));
      await createTherapistSlot(durationMin, start.toISOString());
      Alert.alert('Added', 'Slot created.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create slot.');
    }
  };

  const langsLabel = useMemo(() => {
    const list = profile?.languages || [];
    if (!Array.isArray(list) || list.length === 0) return null;
    return list.join(' • ');
  }, [profile?.languages]);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !isMe }} />
      <View style={styles.header}>
        {isMe ? (
          <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
            <Feather name="refresh-cw" size={18} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color="#ffffff" />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {profile?.display_name || 'Therapist'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {profile?.verified ? 'Verified therapist' : 'Profile'}
          </Text>
        </View>
        {isMe ? (
          <Pressable onPress={handleLogout} style={styles.headerBtn} hitSlop={10}>
            <Feather name="log-out" size={18} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
            <Feather name="refresh-cw" size={18} color="#ffffff" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Therapist profile not found</Text>
          <Text style={styles.muted}>This therapist hasn’t created a public profile yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Therapist dashboard for self; public profile for others */}
          {isMe ? (
            <>
              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tabBtn, tab === 'appointments' && styles.tabBtnActive]}
                  onPress={() => setTab('appointments')}
                >
                  <Text style={[styles.tabText, tab === 'appointments' && styles.tabTextActive]}>Appointments</Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, tab === 'profile' && styles.tabBtnActive]} onPress={() => setTab('profile')}>
                  <Text style={[styles.tabText, tab === 'profile' && styles.tabTextActive]}>Profile</Text>
                </Pressable>
              </View>

              {tab === 'appointments' ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Appointments</Text>
                  <Text style={styles.helperMuted}>Your scheduled sessions appear here.</Text>

                  {sessions.length === 0 ? (
                    <Text style={styles.muted}>No appointments yet.</Text>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {sessions.map((s) => {
                        const u = userMap?.[String(s.user_uid || '')];
                        const name = String(u?.display_name || u?.anonymous_username || s.user_uid || 'User');
                        const statusLabel = String(s.status || 'scheduled');
                        const isNow = statusLabel === 'active';
                        return (
                          <View key={s.id} style={styles.apptRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.apptName} numberOfLines={1}>{name}</Text>
                              <Text style={styles.apptMeta} numberOfLines={1}>
                                {fmtDateRange(String(s.starts_at || ''), String(s.ends_at || ''))}
                              </Text>
                              <View style={[styles.apptPill, isNow ? styles.apptPillActive : styles.apptPillScheduled]}>
                                <Text style={[styles.apptPillText, isNow ? styles.apptPillTextActive : styles.apptPillTextScheduled]}>
                                  {statusLabel}
                                </Text>
                              </View>
                            </View>
                            <Pressable style={styles.openChatBtn} onPress={() => router.push(`/therapist-session/${s.id}` as any)}>
                              <Text style={styles.openChatText}>Open chat</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <>
                  {(profile.ai_persona_summary || Number(profile.review_count || 0) > 0) ? (
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Public description (auto)</Text>
                      <Text style={styles.helperMuted}>
                        This is generated from session feedback (updates every ~10 reviews).
                      </Text>
                      {profile.ai_persona_summary ? (
                        <Text style={styles.noteText}>{String(profile.ai_persona_summary)}</Text>
                      ) : (
                        <Text style={styles.muted}>No summary yet.</Text>
                      )}
                      {(Number(profile.avg_rating || 0) > 0 || Number(profile.review_count || 0) > 0) ? (
                        <Text style={[styles.helperMuted, { marginTop: 10 }]}>
                          Rating: {Number(profile.avg_rating || 0).toFixed(1)} / 5 ({Number(profile.review_count || 0)} reviews)
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {reviews.length ? (
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Reviews (private)</Text>
                      <Text style={styles.helperMuted}>Only you and admins can see these.</Text>
                      <View style={{ marginTop: 10, gap: 10 }}>
                        {reviews.map((r) => (
                          <View key={r.id} style={styles.reviewRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={styles.reviewStars}>{'★★★★★'.slice(0, Math.max(1, Math.min(5, Number(r.rating || 0))))}</Text>
                              <Text style={styles.reviewDate}>{String(r.created_at || '').slice(0, 10)}</Text>
                            </View>
                            {r.comment ? <Text style={styles.reviewText}>{String(r.comment)}</Text> : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Edit public profile</Text>
                    <Text style={styles.helperMuted}>This is what users see in the therapist list.</Text>

                    <Text style={styles.label}>Name</Text>
                    <TextInput value={editName} onChangeText={setEditName} style={styles.input} placeholder="Your name" />

                    <Text style={styles.label}>Specialty</Text>
                    <TextInput value={editSpec} onChangeText={setEditSpec} style={styles.input} placeholder="e.g., CBT, counselling" />

                    <Text style={styles.label}>Languages (comma separated)</Text>
                    <TextInput value={editLangs} onChangeText={setEditLangs} style={styles.input} placeholder="English, Urdu" />

                    <Text style={styles.label}>Short intro</Text>
                    <TextInput
                      value={editBio}
                      onChangeText={setEditBio}
                      style={[styles.input, { minHeight: 90 }]}
                      multiline
                      placeholder="A calm, professional intro (1–3 sentences)."
                    />

                    <Pressable
                      style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={handleSaveProfile}
                    >
                      <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Availability</Text>
                    <Text style={styles.helperMuted}>Create slots so users can book sessions.</Text>
                    {slots.length === 0 ? (
                      <Text style={styles.muted}>No open slots yet.</Text>
                    ) : (
                      <View style={{ marginTop: 10, gap: 10 }}>
                        {slots.map((s) => (
                          <View key={s.id} style={styles.slotRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.slotWhen}>{fmtSlot(s.start_at)}</Text>
                              <Text style={styles.slotMeta}>{Math.round(Number(s.duration_min || 0))} min</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.secondaryBtn} onPress={() => quickAddSlot(60, 60)}>
                        <Text style={styles.secondaryBtnText}>+ 1h (in 1h)</Text>
                      </Pressable>
                      <Pressable style={styles.secondaryBtn} onPress={() => quickAddSlot(120, 24 * 60)}>
                        <Text style={styles.secondaryBtnText}>+ 2h (tomorrow)</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={styles.heroName}>{profile.display_name || 'Therapist'}</Text>
                  <View style={[styles.badge, profile.verified ? styles.badgeVerified : styles.badgePending]}>
                    <Feather
                      name={profile.verified ? 'check-circle' : 'info'}
                      size={14}
                      color={profile.verified ? tokens.colors.success : tokens.colors.textSecondary}
                    />
                    <Text style={[styles.badgeText, profile.verified ? styles.badgeTextVerified : styles.badgeTextPending]}>
                      {profile.verified ? 'Verified' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.heroMeta}>{profile.specialization || 'Mental health support'}</Text>
                {langsLabel ? <Text style={styles.heroLangs}>{langsLabel}</Text> : null}
                {profile.ai_persona_summary ? (
                  <Text style={styles.heroBio}>{String(profile.ai_persona_summary)}</Text>
                ) : profile.bio ? (
                  <Text style={styles.heroBio}>{profile.bio}</Text>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Availability</Text>
                {slots.length === 0 ? (
                  <Text style={styles.muted}>No open slots yet.</Text>
                ) : (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    {slots.map((s) => (
                      <View key={s.id} style={styles.slotRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.slotWhen}>{fmtSlot(s.start_at)}</Text>
                          <Text style={styles.slotMeta}>{Math.round(Number(s.duration_min || 0))} min</Text>
                        </View>
                        <Pressable style={styles.bookBtn} onPress={() => handleBook(s.id)}>
                          <Text style={styles.bookBtnText}>Book</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
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
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 28, gap: 12 },
  hero: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  heroName: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  heroMeta: { marginTop: 6, fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  heroLangs: { marginTop: 6, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted },
  heroBio: { marginTop: 10, fontSize: 13, fontWeight: '600', color: tokens.colors.text, lineHeight: 18 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeVerified: { backgroundColor: 'rgba(16,185,129,0.10)' },
  badgePending: { backgroundColor: 'rgba(107,114,128,0.10)' },
  badgeText: { fontSize: 12, fontWeight: '900' },
  badgeTextVerified: { color: tokens.colors.success },
  badgeTextPending: { color: tokens.colors.textSecondary },

  sectionCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: tokens.colors.text },
  helperMuted: { marginTop: 6, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted, lineHeight: 16 },
  noteText: { marginTop: 10, fontSize: 13, color: tokens.colors.text, lineHeight: 18, fontWeight: '600' },

  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  slotWhen: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  slotMeta: { marginTop: 2, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  bookBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  label: { marginTop: 12, fontSize: 12, fontWeight: '900', color: tokens.colors.textSecondary },
  input: {
    marginTop: 6,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  primaryBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: tokens.colors.pink, fontSize: 13, fontWeight: '900' },

  tabs: {
    flexDirection: 'row',
    gap: 10,
    padding: 6,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: tokens.colors.pink },
  tabText: { fontSize: 13, fontWeight: '900', color: tokens.colors.textSecondary },
  tabTextActive: { color: '#ffffff' },

  apptRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
  },
  apptName: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  apptMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  apptPill: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  apptPillScheduled: { backgroundColor: 'rgba(244,114,182,0.14)' },
  apptPillActive: { backgroundColor: 'rgba(16,185,129,0.12)' },
  apptPillText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  apptPillTextScheduled: { color: tokens.colors.pink },
  apptPillTextActive: { color: tokens.colors.success },
  openChatBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openChatText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  reviewRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  reviewStars: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },
  reviewDate: { fontSize: 11, fontWeight: '800', color: tokens.colors.textMuted },
  reviewText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },
});

