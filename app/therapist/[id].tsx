import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  approveTherapistBookingRequest,
  bookTherapistSlot,
  createTherapistSlot,
  getUserLite,
  getTherapistProfile,
  listBookingRequestsForTherapist,
  listOpenSlotsForTherapist,
  rejectTherapistBookingRequest,
  listReviewsForTherapist,
  listSessionsForTherapist,
  TherapistBookingRequest,
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
  const [requests, setRequests] = useState<TherapistBookingRequest[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [reviews, setReviews] = useState<TherapistReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'appointments' | 'reviews' | 'profile'>('appointments');

  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [slotDayIdx, setSlotDayIdx] = useState(0);
  const [slotTimeIdxs, setSlotTimeIdxs] = useState<number[]>([8]); // multi-select times (defaults to ~12:00)

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
      const [p, s, sess, revs, reqs] = await Promise.all([
        getTherapistProfile(therapistId),
        listOpenSlotsForTherapist(therapistId, 25),
        isMe ? listSessionsForTherapist(therapistId, 80) : Promise.resolve([]),
        isMe ? listReviewsForTherapist(therapistId, 30) : Promise.resolve([]),
        isMe ? listBookingRequestsForTherapist(therapistId, 50) : Promise.resolve([]),
      ]);
      setProfile(p);
      setSlots(s);
      setSessions(sess);
      setReviews(revs);
      setRequests(reqs);
      if (p) {
        setEditName(String(p.display_name || ''));
        setEditSpec(String(p.specialization || ''));
        setEditLangs(Array.isArray(p.languages) ? p.languages.join(', ') : '');
        setEditBio(String(p.bio || ''));
      }
      if (isMe) {
        // Best-effort hydrate patient display names for appointments + requests.
        const usersA = Array.isArray(sess) ? sess.map((x) => String(x.user_uid || '').trim()) : [];
        const usersB = Array.isArray(reqs) ? reqs.map((x) => String(x.requester_uid || '').trim()) : [];
        const unique = [...new Set([...usersA, ...usersB].filter(Boolean))].slice(0, 120);
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
    Alert.alert('Request session length', 'Choose how long you want this session to be.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: '30 min',
        onPress: async () => {
          const res = await bookTherapistSlot(slotId, 30);
          if (!res.ok) Alert.alert('Error', res.error || 'Request failed.');
          else {
            Alert.alert('Request sent', 'Waiting for therapist approval.');
            load();
          }
        },
      },
      {
        text: '60 min',
        onPress: async () => {
          const res = await bookTherapistSlot(slotId, 60);
          if (!res.ok) Alert.alert('Error', res.error || 'Request failed.');
          else {
            Alert.alert('Request sent', 'Waiting for therapist approval.');
            load();
          }
        },
      },
    ]);
  };

  const dateOptions = useMemo(() => {
    const out: { label: string; d: Date }[] = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      out.push({ label, d });
    }
    return out;
  }, []);

  const timeOptions = useMemo(() => {
    const out: { label: string; minutes: number }[] = [];
    const startMin = 8 * 60; // 08:00
    const endMin = 22 * 60; // 22:00
    for (let m = startMin; m <= endMin; m += 30) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      const label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      out.push({ label, minutes: m });
    }
    return out;
  }, []);

  const createSlotFromPicker = async () => {
    try {
      const day = dateOptions[Math.max(0, Math.min(dateOptions.length - 1, slotDayIdx))]?.d;
      if (!day) return;
      const pickedIdxs = [...new Set((slotTimeIdxs || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)))].sort(
        (a, b) => a - b
      );
      if (!pickedIdxs.length) {
        Alert.alert('Pick times', 'Select at least one time for this day.');
        return;
      }

      const created: string[] = [];
      const skipped: string[] = [];
      for (const idx of pickedIdxs) {
        const t = timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.minutes ?? 9 * 60;
        const hh = Math.floor(t / 60);
        const mm = t % 60;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0);
        if (start.getTime() < Date.now() + 5 * 60 * 1000) {
          skipped.push(timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.label || '');
          continue;
        }
        try {
          // Therapist availability is time-only; we store 60-min blocks so users can request 30/60.
          await createTherapistSlot(60, start.toISOString());
          created.push(timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.label || '');
        } catch {
          skipped.push(timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.label || '');
        }
      }

      setShowCreateSlot(false);
      Alert.alert(
        'Created',
        `${created.length} slot(s) created.${skipped.length ? `\n\nSkipped: ${skipped.filter(Boolean).slice(0, 6).join(', ')}` : ''}`
      );
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create slot.');
    }
  };

  const handleApprove = async (requestId: string) => {
    Alert.alert('Approve request', 'Approve this booking request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          const res = await approveTherapistBookingRequest(requestId);
          if (!res.ok) Alert.alert('Error', res.error || 'Could not approve.');
          else Alert.alert('Approved', 'Session scheduled.');
          load();
        },
      },
    ]);
  };

  const handleReject = async (requestId: string) => {
    Alert.alert('Decline request', 'Decline this booking request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const res = await rejectTherapistBookingRequest(requestId);
          if (!res.ok) Alert.alert('Error', res.error || 'Could not decline.');
          else Alert.alert('Declined', 'Request declined and slot reopened.');
          load();
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
                  <Text
                    style={[styles.tabText, tab === 'appointments' && styles.tabTextActive]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {tokens.isSmallDevice ? 'Appts' : 'Appointments'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabBtn, tab === 'reviews' && styles.tabBtnActive]}
                  onPress={() => setTab('reviews')}
                >
                  <Text style={[styles.tabText, tab === 'reviews' && styles.tabTextActive]} numberOfLines={1}>
                    Reviews
                  </Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, tab === 'profile' && styles.tabBtnActive]} onPress={() => setTab('profile')}>
                  <Text style={[styles.tabText, tab === 'profile' && styles.tabTextActive]} numberOfLines={1}>
                    Profile
                  </Text>
                </Pressable>
              </View>

              {tab === 'appointments' ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Appointments</Text>
                    <Pressable style={styles.iconCircle} onPress={() => setShowCreateSlot(true)} hitSlop={10}>
                      <Feather name="calendar" size={18} color="#fff" />
                    </Pressable>
                  </View>
                  <Text style={styles.helperMuted}>Your scheduled sessions appear here.</Text>

                  {requests.length ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.subTitle}>Booking requests</Text>
                      <View style={{ marginTop: 10, gap: 10 }}>
                        {requests.map((r) => {
                          const u = userMap?.[String(r.requester_uid || '')];
                          const name = String(u?.display_name || u?.anonymous_username || r.requester_uid || 'User');
                          return (
                            <View key={r.id} style={styles.requestRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.apptName} numberOfLines={1}>{name}</Text>
                                <Text style={styles.apptMeta} numberOfLines={1}>
                                  {fmtDateRange(String(r.start_at || ''), String(r.end_at || ''))} • {Math.round(Number(r.requested_duration_min || 0) || 0)} min
                                </Text>
                              </View>
                              <Pressable style={styles.approveBtn} onPress={() => handleApprove(r.id)}>
                                <Text style={styles.approveText}>Approve</Text>
                              </Pressable>
                              <Pressable style={styles.rejectBtn} onPress={() => handleReject(r.id)}>
                                <Text style={styles.rejectText}>Decline</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

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
              ) : tab === 'reviews' ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Reviews (private)</Text>
                  <Text style={styles.helperMuted}>Only you and admins can see feedback.</Text>

                  {reviews.length === 0 ? (
                    <Text style={styles.muted}>No reviews yet.</Text>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {reviews.map((r) => (
                        <View key={r.id} style={styles.reviewRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.reviewStars}>
                              {'★★★★★'.slice(0, Math.max(1, Math.min(5, Number(r.rating || 0))))}
                            </Text>
                            <Text style={styles.reviewDate}>{String(r.created_at || '').slice(0, 10)}</Text>
                          </View>
                          {r.comment ? (
                            <Text style={styles.reviewText}>{String(r.comment)}</Text>
                          ) : (
                            <Text style={styles.muted}>No comment.</Text>
                          )}
                        </View>
                      ))}
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

              <Modal visible={showCreateSlot} transparent animationType="fade" onRequestClose={() => setShowCreateSlot(false)}>
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Create availability</Text>
                      <Pressable style={styles.modalClose} onPress={() => setShowCreateSlot(false)} hitSlop={10}>
                        <Feather name="x" size={18} color={tokens.colors.text} />
                      </Pressable>
                    </View>

                    <Text style={styles.modalLabel}>Date</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                      {dateOptions.map((o, idx) => (
                        <Pressable
                          key={o.label}
                          style={[styles.pillBtn, idx === slotDayIdx && styles.pillBtnActive]}
                          onPress={() => setSlotDayIdx(idx)}
                        >
                          <Text style={[styles.pillText, idx === slotDayIdx && styles.pillTextActive]}>{o.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>

                    <Text style={styles.modalLabel}>Time</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                      {timeOptions.map((o, idx) => (
                        <Pressable
                          key={o.label}
                          style={[styles.pillBtn, slotTimeIdxs.includes(idx) && styles.pillBtnActive]}
                          onPress={() =>
                            setSlotTimeIdxs((prev) => {
                              const list = Array.isArray(prev) ? prev : [];
                              return list.includes(idx) ? list.filter((x) => x !== idx) : [...list, idx];
                            })
                          }
                        >
                          <Text style={[styles.pillText, slotTimeIdxs.includes(idx) && styles.pillTextActive]}>{o.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>

                    <Text style={styles.modalLabel}>Duration</Text>
                    <Text style={styles.helperMuted}>Users will choose 30 or 60 minutes when requesting.</Text>

                    <Pressable style={styles.createBtn} onPress={createSlotFromPicker}>
                      <Text style={styles.createBtnText}>Create slot</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTitle: { marginTop: 14, fontSize: 12, fontWeight: '900', color: tokens.colors.textSecondary },

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
  tabText: { fontSize: 12, fontWeight: '900', color: tokens.colors.textSecondary, textAlign: 'center' },
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

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  approveBtn: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: tokens.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  rejectBtn: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: { color: '#b91c1c', fontSize: 12, fontWeight: '900' },

  reviewRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  reviewStars: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },
  reviewDate: { fontSize: 11, fontWeight: '800', color: tokens.colors.textMuted },
  reviewText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLabel: { marginTop: 12, fontSize: 12, fontWeight: '900', color: tokens.colors.textSecondary },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  pillBtnActive: { backgroundColor: 'rgba(244,114,182,0.16)', borderColor: 'rgba(244,114,182,0.35)' },
  pillText: { fontSize: 12, fontWeight: '800', color: tokens.colors.textSecondary },
  pillTextActive: { color: tokens.colors.pink },
  createBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});

