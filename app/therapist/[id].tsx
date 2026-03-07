import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  getTherapistProfile,
  listOpenSlotsForTherapist,
  TherapistProfile,
  TherapistSlot,
  upsertMyTherapistProfile,
} from '@/app/therapist/marketplace';

function fmtSlot(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editLangs, setEditLangs] = useState('');
  const [editBio, setEditBio] = useState('');

  const load = useCallback(async () => {
    if (!therapistId) return;
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        getTherapistProfile(therapistId),
        listOpenSlotsForTherapist(therapistId, 25),
      ]);
      setProfile(p);
      setSlots(s);
      if (p) {
        setEditName(String(p.display_name || ''));
        setEditSpec(String(p.specialization || ''));
        setEditLangs(Array.isArray(p.languages) ? p.languages.join(', ') : '');
        setEditBio(String(p.bio || ''));
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {profile?.display_name || 'Therapist'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {profile?.verified ? 'Verified therapist' : 'Profile'}
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
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Therapist profile not found</Text>
          <Text style={styles.muted}>This therapist hasn’t created a public profile yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            {profile.bio ? <Text style={styles.heroBio}>{profile.bio}</Text> : null}
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
                    {!isMe ? (
                      <Pressable style={styles.bookBtn} onPress={() => handleBook(s.id)}>
                        <Text style={styles.bookBtnText}>Book</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>

          {isMe ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Edit profile</Text>
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

                <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={handleSaveProfile}>
                  <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save profile'}</Text>
                </Pressable>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Create availability (demo)</Text>
                <Text style={styles.helperMuted}>Quick-create future slots so users can book sessions.</Text>
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
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.pink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#ffffff' },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#ffffff' },
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
    backgroundColor: '#111827',
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
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: tokens.colors.text, fontSize: 13, fontWeight: '900' },
});

