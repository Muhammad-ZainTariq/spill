import {
  approveTherapistBookingRequest,
  bookTherapistSlot,
  cancelTherapistSession,
  cancelTherapistSlot,
  createTherapistSlot,
  getTherapistProfile,
  getUserLite,
  listAllSlotsForTherapist,
  listBookingRequestsForTherapist,
  listOpenSlotsForTherapist,
  listReviewsForTherapist,
  listSessionsForTherapist,
  rejectTherapistBookingRequest,
  rescheduleTherapistSession,
  TherapistBookingRequest,
  TherapistProfile,
  TherapistReview,
  TherapistSession,
  TherapistSlot,
  upsertMyTherapistProfile,
} from '@/app/therapist/marketplace';
import { tokens } from '@/app/ui/tokens';
import { auth, db } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
  const [allSlots, setAllSlots] = useState<TherapistSlot[]>([]); // All slots (open, requested, booked) for appointments
  const [sessions, setSessions] = useState<TherapistSession[]>([]);
  const [requests, setRequests] = useState<TherapistBookingRequest[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [reviews, setReviews] = useState<TherapistReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'appointments' | 'reviews' | 'profile'>('appointments');

  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [slotDayIdx, setSlotDayIdx] = useState(0);
  const [slotTimeIdxs, setSlotTimeIdxs] = useState<number[]>([]); // multi-select times (none pre-selected)

  const [editName, setEditName] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editLangs, setEditLangs] = useState('');
  const [editBio, setEditBio] = useState('');
  const [userSlotDayKey, setUserSlotDayKey] = useState<string | null>(null); // For user: filter slots by day
  const [therapistApptDayKey, setTherapistApptDayKey] = useState<string | null>(null); // For therapist: filter appointments by day

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
      const [p, s, allS, sess, revs, reqs] = await Promise.all([
        getTherapistProfile(therapistId),
        listOpenSlotsForTherapist(therapistId, 25),
        isMe ? listAllSlotsForTherapist(therapistId, 100) : Promise.resolve([]),
        isMe ? listSessionsForTherapist(therapistId, 80) : Promise.resolve([]),
        isMe ? listReviewsForTherapist(therapistId, 30) : Promise.resolve([]),
        isMe ? listBookingRequestsForTherapist(therapistId, 50) : Promise.resolve([]),
      ]);
      setProfile(p);
      setSlots(s);
      setAllSlots(allS);
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset slot selection when opening the create-slot modal so count is accurate
  useEffect(() => {
    if (showCreateSlot) {
      setSlotTimeIdxs([]);
      setSlotDayIdx(0);
    }
  }, [showCreateSlot]);

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
          setSlots((prev) => prev.filter((s) => s.id !== slotId));
          const res = await bookTherapistSlot(slotId, 30);
          if (!res.ok) {
            Alert.alert('Error', res.error || 'Request failed.');
            await load();
          } else {
            Alert.alert('Request sent', 'Waiting for therapist approval.');
          }
        },
      },
      {
        text: '60 min',
        onPress: async () => {
          setSlots((prev) => prev.filter((s) => s.id !== slotId));
          const res = await bookTherapistSlot(slotId, 60);
          if (!res.ok) {
            Alert.alert('Error', res.error || 'Request failed.');
            await load();
          } else {
            Alert.alert('Request sent', 'Waiting for therapist approval.');
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

  // For selected date, which time indices are already allocated (have open slots)
  const allocatedTimeIdxsForSelectedDay = useMemo(() => {
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + slotDayIdx);
    const dayY = day.getFullYear();
    const dayM = day.getMonth();
    const dayD = day.getDate();
    const allocated: number[] = [];
    for (let idx = 0; idx < timeOptions.length; idx++) {
      const t = timeOptions[idx]?.minutes ?? 0;
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      const hasSlot = slots.some((s) => {
        const slotDate = new Date(String(s.start_at || ''));
        if (Number.isNaN(slotDate.getTime())) return false;
        return (
          slotDate.getFullYear() === dayY &&
          slotDate.getMonth() === dayM &&
          slotDate.getDate() === dayD &&
          slotDate.getHours() === hh &&
          slotDate.getMinutes() === mm
        );
      });
      if (hasSlot) allocated.push(idx);
    }
    return allocated;
  }, [slots, slotDayIdx, timeOptions]);

  // User side: group slots by day for filtering
  const slotsByDay = useMemo(() => {
    const map = new Map<string, TherapistSlot[]>();
    for (const s of slots) {
      const d = new Date(String(s.start_at || ''));
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
    return map;
  }, [slots]);

  const slotDays = useMemo(() => {
    const keys = Array.from(slotsByDay.keys()).sort();
    return keys.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      return { key, label, count: slotsByDay.get(key)!.length };
    });
  }, [slotsByDay]);

  const filteredSlotsForUser = useMemo(() => {
    const key = userSlotDayKey || (slotDays.length > 0 ? slotDays[0].key : null);
    if (!key) return slots;
    return slotsByDay.get(key) || [];
  }, [userSlotDayKey, slotDays, slotsByDay, slots]);

  // Unified appointment list: all slots with request/session info for therapist
  const appointmentItems = useMemo(() => {
    if (!isMe) return [];
    const reqBySlot = new Map<string, TherapistBookingRequest>();
    for (const r of requests) reqBySlot.set(String(r.slot_id || ''), r);
    const sessBySlot = new Map<string, TherapistSession>();
    for (const s of sessions) sessBySlot.set(String(s.slot_id || ''), s);
    return allSlots.map((slot) => {
      const req = reqBySlot.get(slot.id);
      const sess = sessBySlot.get(slot.id);
      const status = String(slot.status || 'open');
      let userName: string | null = null;
      if (req) userName = String(userMap?.[String(req.requester_uid || '')]?.display_name || userMap?.[String(req.requester_uid || '')]?.anonymous_username || req.requester_uid || 'User');
      if (sess) userName = String(userMap?.[String(sess.user_uid || '')]?.display_name || userMap?.[String(sess.user_uid || '')]?.anonymous_username || sess.user_uid || 'User');
      return { slot, request: req, session: sess, status, userName };
    });
  }, [isMe, allSlots, requests, sessions, userMap]);

  // Therapist: group appointments by date for day filter
  const appointmentDays = useMemo(() => {
    if (!isMe) return [];
    const map = new Map<string, typeof appointmentItems>();
    for (const item of appointmentItems) {
      const d = new Date(String(item.slot.start_at || ''));
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      return { key, label, count: map.get(key)!.length };
    });
  }, [isMe, appointmentItems]);

  const displayedAppointmentItems = useMemo(() => {
    const key = therapistApptDayKey || (appointmentDays.length > 0 ? appointmentDays[0].key : null);
    if (!key || appointmentDays.length === 0) return appointmentItems;
    const day = appointmentDays.find((d) => d.key === key);
    if (!day) return appointmentItems;
    const map = new Map<string, typeof appointmentItems>();
    for (const item of appointmentItems) {
      const d = new Date(String(item.slot.start_at || ''));
      if (Number.isNaN(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map.get(key) || [];
  }, [therapistApptDayKey, appointmentDays, appointmentItems]);

  // Auto-select first day when therapist appointments load
  useEffect(() => {
    if (isMe && appointmentDays.length > 0) {
      const keys = appointmentDays.map((d) => d.key);
      if (!therapistApptDayKey || !keys.includes(therapistApptDayKey)) {
        setTherapistApptDayKey(appointmentDays[0].key);
      }
    } else if (isMe && appointmentDays.length === 0) {
      setTherapistApptDayKey(null);
    }
  }, [isMe, appointmentDays, therapistApptDayKey]);

  // Auto-select first day when slots load; reset if selected day no longer has slots
  useEffect(() => {
    if (!isMe && slotDays.length > 0) {
      const keys = slotDays.map((d) => d.key);
      if (!userSlotDayKey || !keys.includes(userSlotDayKey)) {
        setUserSlotDayKey(slotDays[0].key);
      }
    } else if (!isMe && slotDays.length === 0) {
      setUserSlotDayKey(null);
    }
  }, [isMe, slotDays, userSlotDayKey]);

  const createSlotFromPicker = async () => {
    try {
      // Compute day fresh from current date + selected offset (avoids stale "today" from memoized dateOptions)
      const now = new Date();
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + slotDayIdx);
      const pickedIdxs = [...new Set((slotTimeIdxs || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)))].sort(
        (a, b) => a - b
      );
      if (!pickedIdxs.length) {
        Alert.alert('Pick times', 'Select at least one time for this day.');
        return;
      }

      const created: string[] = [];
      const skipped: { label: string; reason?: string }[] = [];
      for (const idx of pickedIdxs) {
        const t = timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.minutes ?? 9 * 60;
        const hh = Math.floor(t / 60);
        const mm = t % 60;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0);
        const label = timeOptions[Math.max(0, Math.min(timeOptions.length - 1, idx))]?.label || '';
        if (start.getTime() < Date.now() + 5 * 60 * 1000) {
          skipped.push({ label, reason: 'in the past' });
          continue;
        }
        if (allocatedTimeIdxsForSelectedDay.includes(idx)) {
          skipped.push({ label, reason: 'already allocated' });
          continue;
        }
        try {
          // Therapist availability is time-only; we store 60-min blocks so users can request 30/60.
          await createTherapistSlot(60, start.toISOString());
          created.push(label);
        } catch (err: any) {
          skipped.push({ label, reason: err?.message || 'Failed to create' });
        }
      }

      setShowCreateSlot(false);
      await load(); // Refresh slots so the list updates immediately
      const skippedText = skipped.length
        ? `\n\nSkipped: ${skipped.map((s) => `${s.label}${s.reason ? ` (${s.reason})` : ''}`).slice(0, 6).join(', ')}`
        : '';
      Alert.alert('Created', `${created.length} slot(s) created.${skippedText}`);
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

  const [cancellingId, setCancellingId] = useState<string | null>(null); // Prevent double-tap during cancel

  const handleCancelSlot = async (slotId: string, slotLabel: string) => {
    Alert.alert('Cancel slot', `Remove ${slotLabel} from your availability?`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel slot',
        style: 'destructive',
        onPress: async () => {
          setCancellingId(slotId);
          // Optimistic: remove from UI immediately
          setAllSlots((prev) => prev.filter((s) => s.id !== slotId));
          setSlots((prev) => prev.filter((s) => s.id !== slotId));
          const res = await cancelTherapistSlot(slotId);
          setCancellingId(null);
          if (!res.ok) {
            Alert.alert('Error', res.error || 'Could not cancel slot.');
            await load(); // Restore state from server
          }
        },
      },
    ]);
  };

  const handleCancelSession = async (sessionId: string, userName: string) => {
    Alert.alert('Cancel session', `Cancel the session with ${userName}? They will be notified.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          const sess = sessions.find((s) => s.id === sessionId);
          const slotId = sess?.slot_id;
          setCancellingId(sessionId);
          // Optimistic: remove session and update slot to open in UI
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          if (slotId) {
            setAllSlots((prev) =>
              prev.map((s) => (s.id === slotId ? { ...s, status: 'open' as const, booked_by_uid: null } : s))
            );
          }
          const res = await cancelTherapistSession(sessionId);
          setCancellingId(null);
          if (!res.ok) {
            Alert.alert('Error', res.error || 'Could not cancel session.');
            await load();
          }
        },
      },
    ]);
  };

  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeSession, setPostponeSession] = useState<TherapistSession | null>(null);

  const handlePostpone = (session: TherapistSession) => {
    setPostponeSession(session);
    setShowPostponeModal(true);
  };

  const handlePostponeToSlot = async (newSlotId: string) => {
    if (!postponeSession) return;
    Alert.alert(
      'Postpone session',
      'Reschedule this session to the selected slot? The user will be notified of the new time.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setShowPostponeModal(false) },
        {
          text: 'Reschedule',
          onPress: async () => {
            const res = await rescheduleTherapistSession(postponeSession.id, newSlotId);
            setShowPostponeModal(false);
            setPostponeSession(null);
            if (!res.ok) Alert.alert('Error', res.error || 'Could not reschedule.');
            else Alert.alert('Rescheduled', 'Session moved to the new slot. User has been notified.');
            load();
          },
        },
      ]
    );
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
      await load(); // Refresh slots so the list updates immediately
      Alert.alert('Added', 'Slot created.');
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
        <View style={styles.topContent}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : !profile ? (
        <View style={styles.topContent}>
          <Text style={styles.emptyTitle}>Therapist profile not found</Text>
          <Text style={styles.muted}>This therapist hasn’t created a public profile yet.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.textMuted} />
          }
        >
          {/* Therapist dashboard for self; public profile for others */}
          {isMe ? (
            <>
              <Pressable
                style={styles.resourcesCard}
                onPress={() => router.push('/therapist/resources' as any)}
              >
                <Feather name="book-open" size={22} color={tokens.colors.pink} />
                <Text style={styles.resourcesCardText}>Learning resources</Text>
                <Feather name="chevron-right" size={18} color={tokens.colors.textMuted} />
              </Pressable>
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
                      <Feather name="plus" size={20} color="#fff" />
                    </Pressable>
                  </View>
                  <Text style={styles.helperMuted}>All your slots. Open slots can be cancelled. Requested slots need approval. Approved slots can be rescheduled or cancelled.</Text>

                  {appointmentItems.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Feather name="calendar" size={40} color={tokens.colors.textMuted} />
                      <Text style={styles.emptyTitle}>No appointments yet</Text>
                      <Text style={styles.emptySubtitle}>Create availability slots so users can request sessions.</Text>
                      <Pressable style={styles.emptyCta} onPress={() => setShowCreateSlot(true)}>
                        <Feather name="plus" size={18} color="#fff" />
                        <Text style={styles.emptyCtaText}>Add availability</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      {appointmentDays.length > 1 ? (
                        <>
                          <Text style={[styles.helperMuted, { marginTop: 12 }]}>Tap a date to see appointments</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 10, paddingVertical: 12, paddingRight: 8 }}
                          >
                            {appointmentDays.map((d) => (
                              <Pressable
                                key={d.key}
                                style={[styles.userDayPill, therapistApptDayKey === d.key && styles.userDayPillActive]}
                                onPress={() => setTherapistApptDayKey(d.key)}
                              >
                                <Text style={[styles.userDayPillText, therapistApptDayKey === d.key && styles.userDayPillTextActive]}>
                                  {d.label}
                                </Text>
                                <Text style={[styles.userDayPillCount, therapistApptDayKey === d.key && styles.userDayPillCountActive]}>
                                  {d.count} slot{d.count !== 1 ? 's' : ''}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </>
                      ) : null}
                      <View style={{ marginTop: appointmentDays.length > 1 ? 4 : 16, gap: 12 }}>
                        {displayedAppointmentItems.map(({ slot, request, session, status, userName }) => {
                          const isPending = !!request && !session;
                          const isScheduled = !!session;
                          return (
                        <View key={slot.id} style={styles.apptCard}>
                          <View style={styles.apptCardTop}>
                            <Text style={styles.apptName} numberOfLines={1}>
                              {status === 'open' ? 'Open slot' : userName || 'User'}
                            </Text>
                            <Text style={styles.apptMeta} numberOfLines={1}>
                              {fmtSlot(slot.start_at)} • {Math.round(Number(slot.duration_min || 0))} min
                            </Text>
                            <View style={[styles.apptPill, isPending ? styles.apptPillPending : isScheduled ? styles.apptPillScheduled : styles.apptPillOpen]}>
                              <Text style={[styles.apptPillText, isPending ? styles.apptPillTextPending : isScheduled ? styles.apptPillTextScheduled : styles.apptPillTextOpen]}>
                                {status === 'open' ? 'Available' : isPending ? 'Pending' : 'Scheduled'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.apptActions}>
                            {status === 'open' ? (
                              <Pressable
                                style={[styles.cancelSessionBtn, cancellingId === slot.id && { opacity: 0.5 }]}
                                onPress={() => handleCancelSlot(slot.id, fmtSlot(slot.start_at))}
                                disabled={!!cancellingId}
                              >
                                <Feather name="x-circle" size={14} color={tokens.colors.danger} />
                                <Text style={styles.cancelSessionText}>{cancellingId === slot.id ? '…' : 'Cancel'}</Text>
                              </Pressable>
                            ) : isPending && request ? (
                              <>
                                <Pressable style={styles.approveBtn} onPress={() => handleApprove(request.id)}>
                                  <Feather name="check" size={14} color="#fff" />
                                  <Text style={styles.approveText}>Approve</Text>
                                </Pressable>
                                <Pressable style={styles.rejectBtn} onPress={() => handleReject(request.id)}>
                                  <Feather name="x" size={14} color="#b91c1c" />
                                  <Text style={styles.rejectText}>Decline</Text>
                                </Pressable>
                              </>
                            ) : isScheduled && session ? (
                              <>
                                <Pressable style={styles.openChatBtn} onPress={() => router.push(`/therapist-session/${session.id}` as any)}>
                                  <Feather name="message-circle" size={14} color="#fff" />
                                  <Text style={styles.openChatText}>Chat</Text>
                                </Pressable>
                                <Pressable style={styles.postponeBtn} onPress={() => handlePostpone(session)}>
                                  <Feather name="calendar" size={14} color={tokens.colors.blue} />
                                  <Text style={styles.postponeBtnText}>Postpone</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.cancelSessionBtn, cancellingId === session.id && { opacity: 0.5 }]}
                                  onPress={() => handleCancelSession(session.id, userName || 'User')}
                                  disabled={!!cancellingId}
                                >
                                  <Feather name="x-circle" size={14} color={tokens.colors.danger} />
                                  <Text style={styles.cancelSessionText}>{cancellingId === session.id ? '…' : 'Cancel'}</Text>
                                </Pressable>
                              </>
                            ) : null}
                          </View>
                        </View>
                      );})}
                      </View>
                    </>
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
                    <Text style={styles.helperMuted}>Open slots that users can book. Tap the X to remove a slot.</Text>
                    {slots.length === 0 ? (
                      <View style={styles.emptyStateSmall}>
                        <Feather name="clock" size={32} color={tokens.colors.textMuted} />
                        <Text style={styles.muted}>No open slots yet.</Text>
                        <Text style={[styles.helperMuted, { marginTop: 4 }]}>Add slots so users can request sessions.</Text>
                      </View>
                    ) : (
                      <View style={{ marginTop: 12, gap: 10 }}>
                        {slots.map((s) => (
                          <View key={s.id} style={styles.slotCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.slotWhen}>{fmtSlot(s.start_at)}</Text>
                              <Text style={styles.slotMeta}>{Math.round(Number(s.duration_min || 0))} min • Open</Text>
                            </View>
                            <Pressable
                              style={[styles.cancelSlotBtn, cancellingId === s.id && { opacity: 0.5 }]}
                              onPress={() => handleCancelSlot(s.id, fmtSlot(s.start_at))}
                              disabled={!!cancellingId}
                              hitSlop={8}
                            >
                              <Feather name="x" size={18} color={tokens.colors.danger} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={[styles.modalLabel, { marginTop: 16 }]}>Quick add</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <Pressable style={styles.quickAddBtn} onPress={() => quickAddSlot(60, 60)}>
                        <Feather name="plus" size={16} color={tokens.colors.pink} />
                        <Text style={styles.quickAddBtnText}>In 1 hour</Text>
                      </Pressable>
                      <Pressable style={styles.quickAddBtn} onPress={() => quickAddSlot(120, 24 * 60)}>
                        <Feather name="plus" size={16} color={tokens.colors.pink} />
                        <Text style={styles.quickAddBtnText}>Tomorrow</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              <Modal visible={showCreateSlot} transparent animationType="fade" onRequestClose={() => setShowCreateSlot(false)}>
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <View>
                        <Text style={styles.modalTitle}>Add availability</Text>
                        <Text style={styles.modalSubtitle}>Select date and times for your open slots</Text>
                      </View>
                      <Pressable style={styles.modalClose} onPress={() => setShowCreateSlot(false)} hitSlop={10}>
                        <Feather name="x" size={20} color={tokens.colors.textSecondary} />
                      </Pressable>
                    </View>

                    <Text style={styles.modalLabel}>Pick a date</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.modalScrollContent, { paddingRight: 16 }]}>
                      {dateOptions.map((o, idx) => (
                        <Pressable
                          key={o.label}
                          style={[styles.datePill, idx === slotDayIdx && styles.datePillActive]}
                          onPress={() => setSlotDayIdx(idx)}
                        >
                          <Text style={[styles.datePillText, idx === slotDayIdx && styles.datePillTextActive]}>{o.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>

                    <Text style={styles.modalLabel}>Pick times (tap to select multiple)</Text>
                    <Text style={[styles.helperMuted, { marginBottom: 8 }]}>
                      Times with a checkmark are already allocated for this date.
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.modalScrollContent, { paddingRight: 16 }]}>
                      {timeOptions.map((o, idx) => {
                        const isAllocated = allocatedTimeIdxsForSelectedDay.includes(idx);
                        const isSelected = slotTimeIdxs.includes(idx);
                        return (
                          <Pressable
                            key={o.label}
                            style={[
                              styles.timePill,
                              isAllocated && styles.timePillAllocated,
                              isSelected && !isAllocated && styles.timePillActive,
                            ]}
                            onPress={() => {
                              if (isAllocated) return; // Can't select already-allocated times
                              setSlotTimeIdxs((prev) => {
                                const list = Array.isArray(prev) ? prev : [];
                                return list.includes(idx) ? list.filter((x) => x !== idx) : [...list, idx];
                              });
                            }}
                            disabled={isAllocated}
                          >
                            {isAllocated ? (
                              <Feather name="check-circle" size={14} color={tokens.colors.success} style={{ marginRight: 4 }} />
                            ) : null}
                            <Text
                              style={[
                                styles.timePillText,
                                isAllocated && styles.timePillTextAllocated,
                                isSelected && !isAllocated && styles.timePillTextActive,
                              ]}
                            >
                              {o.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <Text style={[styles.helperMuted, { marginTop: 4 }]}>
                      Users will choose 30 or 60 min when booking. Each time = one 60‑min slot.
                    </Text>

                    <Pressable
                      style={[styles.createBtn, slotTimeIdxs.length === 0 && styles.createBtnDisabled]}
                      onPress={createSlotFromPicker}
                      disabled={slotTimeIdxs.length === 0}
                    >
                      <Feather name="calendar-plus" size={18} color={slotTimeIdxs.length === 0 ? '#94A3B8' : '#fff'} />
                      <Text style={[styles.createBtnText, slotTimeIdxs.length === 0 && styles.createBtnTextDisabled]}>
                        {slotTimeIdxs.length === 0
                          ? 'Select times above'
                          : `Create ${slotTimeIdxs.length} slot${slotTimeIdxs.length !== 1 ? 's' : ''}`}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              <Modal visible={showPostponeModal} transparent animationType="fade" onRequestClose={() => setShowPostponeModal(false)}>
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <View>
                        <Text style={styles.modalTitle}>Postpone session</Text>
                        <Text style={styles.modalSubtitle}>Pick a new slot to reschedule to</Text>
                      </View>
                      <Pressable style={styles.modalClose} onPress={() => { setShowPostponeModal(false); setPostponeSession(null); }} hitSlop={10}>
                        <Feather name="x" size={20} color={tokens.colors.textSecondary} />
                      </Pressable>
                    </View>
                    {slots
                      .filter((s) => {
                        if (!postponeSession) return true;
                        if (s.id === postponeSession.slot_id) return false;
                        const sessionStart = postponeSession.starts_at;
                        if (!sessionStart) return true;
                        return s.start_at !== sessionStart;
                      })
                      .length === 0 ? (
                      <Text style={styles.muted}>No other times available. Create new slots at different times.</Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                        {slots
                          .filter((s) => {
                            if (!postponeSession) return true;
                            if (s.id === postponeSession.slot_id) return false;
                            const sessionStart = postponeSession.starts_at;
                            if (!sessionStart) return true;
                            return s.start_at !== sessionStart;
                          })
                          .map((s) => (
                          <Pressable
                            key={s.id}
                            style={styles.postponeSlotOption}
                            onPress={() => handlePostponeToSlot(s.id)}
                          >
                            <Feather name="calendar" size={16} color={tokens.colors.textSecondary} />
                            <Text style={styles.postponeSlotText}>{fmtSlot(s.start_at)}</Text>
                            <Feather name="chevron-right" size={16} color={tokens.colors.textMuted} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
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
                  <>
                    {slotDays.length > 1 ? (
                      <>
                        <Text style={[styles.helperMuted, { marginTop: 6 }]}>Choose a day to see available times</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 10, paddingVertical: 12, paddingRight: 8 }}
                        >
                          {slotDays.map((d) => (
                            <Pressable
                              key={d.key}
                              style={[styles.userDayPill, userSlotDayKey === d.key && styles.userDayPillActive]}
                              onPress={() => setUserSlotDayKey(d.key)}
                            >
                              <Text style={[styles.userDayPillText, userSlotDayKey === d.key && styles.userDayPillTextActive]}>
                                {d.label}
                              </Text>
                              <Text style={[styles.userDayPillCount, userSlotDayKey === d.key && styles.userDayPillCountActive]}>
                                {d.count} slot{d.count !== 1 ? 's' : ''}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    <View style={{ marginTop: slotDays.length > 1 ? 4 : 10, gap: 10 }}>
                      {filteredSlotsForUser.map((s) => (
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
                  </>
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
  topContent: { flex: 1, alignItems: 'center', paddingTop: 24, gap: 10, paddingHorizontal: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  content: { flexGrow: 0, padding: tokens.spacing.screenHorizontal, paddingBottom: 28, gap: 12 },
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

  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyStateSmall: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: tokens.colors.text },
  emptySubtitle: { fontSize: 14, color: tokens.colors.textMuted, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  subSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 18,
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

  userDayPill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  userDayPillActive: {
    backgroundColor: 'rgba(244,114,182,0.12)',
    borderColor: 'rgba(244,114,182,0.4)',
  },
  userDayPillText: { fontSize: 14, fontWeight: '800', color: tokens.colors.text },
  userDayPillTextActive: { color: tokens.colors.pink },
  userDayPillCount: { marginTop: 2, fontSize: 11, fontWeight: '700', color: tokens.colors.textMuted },
  userDayPillCountActive: { color: tokens.colors.pink },

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

  resourcesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(244,114,182,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.2)',
    marginBottom: 14,
  },
  resourcesCardText: { flex: 1, fontSize: 15, fontWeight: '700', color: tokens.colors.text },
  tabs: {
    flexDirection: 'row',
    gap: 14,
    padding: 10,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: tokens.colors.pink },
  tabText: { fontSize: 14, fontWeight: '800', color: tokens.colors.textSecondary, textAlign: 'center' },
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
  apptPillOpen: { backgroundColor: 'rgba(100,116,139,0.12)' },
  apptPillPending: { backgroundColor: 'rgba(245,158,11,0.14)' },
  apptPillScheduled: { backgroundColor: 'rgba(244,114,182,0.14)' },
  apptPillActive: { backgroundColor: 'rgba(16,185,129,0.12)' },
  apptPillText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  apptPillTextOpen: { color: tokens.colors.textSecondary },
  apptPillTextPending: { color: tokens.colors.warning },
  apptPillTextScheduled: { color: tokens.colors.pink },
  apptPillTextActive: { color: tokens.colors.success },
  postponeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.25)',
  },
  postponeBtnText: { fontSize: 12, fontWeight: '800', color: tokens.colors.blue },
  postponeSlotOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 8,
  },
  postponeSlotText: { flex: 1, fontSize: 14, fontWeight: '700', color: tokens.colors.text },
  openChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: tokens.colors.pink,
    justifyContent: 'center',
  },
  openChatText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  requestActions: { flexDirection: 'row', gap: 8 },
  apptCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  apptCardTop: { marginBottom: 12 },
  apptActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  cancelSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  cancelSessionText: { fontSize: 12, fontWeight: '800', color: tokens.colors.danger },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  cancelSlotBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.3)',
  },
  quickAddBtnText: { fontSize: 13, fontWeight: '800', color: tokens.colors.pink },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: tokens.colors.success,
    justifyContent: 'center',
  },
  approveText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    justifyContent: 'center',
  },
  rejectText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },

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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: tokens.colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: tokens.colors.text },
  modalSubtitle: { marginTop: 4, fontSize: 13, color: tokens.colors.textMuted },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLabel: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: '800', color: tokens.colors.textSecondary },
  modalScrollContent: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  datePillActive: { backgroundColor: 'rgba(244,114,182,0.12)', borderColor: 'rgba(244,114,182,0.4)' },
  datePillText: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  datePillTextActive: { color: tokens.colors.pink },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  timePillActive: { backgroundColor: 'rgba(244,114,182,0.12)', borderColor: 'rgba(244,114,182,0.4)' },
  timePillAllocated: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.3)',
    opacity: 0.9,
  },
  timePillText: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  timePillTextActive: { color: tokens.colors.pink },
  timePillTextAllocated: { color: tokens.colors.success },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
  },
  createBtnDisabled: { backgroundColor: tokens.colors.surfaceOverlay, opacity: 0.8 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  createBtnTextDisabled: { color: tokens.colors.textMuted },
});

