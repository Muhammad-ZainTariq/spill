import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';
import { getUserLite, submitTherapistSessionReview } from '@/app/therapist/marketplace';
import { SharedChatLayout, chatStyles, type ChatDataItem } from '@/components/SharedChatUI';
import { HuzzPressable } from '@/app/ui/components/HuzzPressable.native';
import { tokens } from '@/app/ui/tokens';

type Session = {
  therapist_uid: string;
  user_uid: string;
  starts_at: string;
  ends_at: string;
  status?: string | null;
};

type Msg = {
  id: string;
  sender_uid: string;
  text: string;
  created_at: string;
};

function fmtClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fmtSlot(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function detectCrisisIntent(raw: string): boolean {
  const t = String(raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;

  const phrases = [
    'kill myself',
    'end my life',
    'want to die',
    'i want to die',
    'i will kill myself',
    'suicide',
    'take my life',
    'end it all',
    'can t go on',
    "can't go on",
    'self harm',
    'hurt myself',
    'cut myself',
    'overdose',
  ];
  return phrases.some((p) => t.includes(p));
}

function toChatData(messages: Msg[]): ChatDataItem[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const out: ChatDataItem[] = [];
  let lastDay: string | null = null;
  for (const m of sorted) {
    const d = new Date(m.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (key !== lastDay) {
      out.push({ _type: 'day', id: `day-${key}`, day: d });
      lastDay = key;
    }
    out.push({
      _type: 'msg',
      id: m.id,
      fromUid: m.sender_uid,
      text: m.text,
      createdAt: d,
    });
  }
  return out.reverse();
}

export default function TherapistSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const sessionId = String(params?.id || '').trim();
  const meUid = auth.currentUser?.uid || null;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const [crisisStatus, setCrisisStatus] = useState<'active' | 'cleared' | null>(null);
  const [crisisSnippet, setCrisisSnippet] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [didReview, setDidReview] = useState(false);
  const [otherUserName, setOtherUserName] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let unsubMsgs: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;
    let unsubCrisis: (() => void) | null = null;
    setLoading(true);

    unsubSession = onSnapshot(
      doc(db, 'therapist_sessions', sessionId),
      (snap) => {
        const d = snap.data() as any;
        if (!snap.exists() || !d) {
          setSession(null);
          setLoading(false);
          return;
        }
        setSession({
          therapist_uid: String(d.therapist_uid || ''),
          user_uid: String(d.user_uid || ''),
          starts_at: String(d.starts_at || ''),
          ends_at: String(d.ends_at || ''),
          status: String(d.status || ''),
        });
        setLoading(false);
      },
      () => setLoading(false)
    );

    const q = query(
      collection(db, 'therapist_sessions', sessionId, 'messages'),
      orderBy('created_at', 'desc'),
      limit(200)
    );
    unsubMsgs = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Msg[];
      setMessages(list);
    });

    unsubCrisis = onSnapshot(
      doc(db, 'therapist_sessions', sessionId, 'signals', 'crisis'),
      (snap) => {
        if (!snap.exists()) {
          setCrisisStatus(null);
          setCrisisSnippet(null);
          return;
        }
        const d = snap.data() as any;
        const st = String(d?.status || '').trim();
        setCrisisStatus(st === 'active' ? 'active' : st === 'cleared' ? 'cleared' : null);
        setCrisisSnippet(d?.snippet ? String(d.snippet) : null);
      },
      () => {}
    );

    return () => {
      unsubMsgs?.();
      unsubSession?.();
      unsubCrisis?.();
    };
  }, [sessionId]);

  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const isParticipant = useMemo(() => {
    if (!meUid || !session) return false;
    return meUid === session.user_uid || meUid === session.therapist_uid;
  }, [meUid, session]);

  const nowMs = Date.now() + tick * 0;
  const startsMs = useMemo(() => Date.parse(String(session?.starts_at || '')), [session?.starts_at]);
  const endsMs = useMemo(() => Date.parse(String(session?.ends_at || '')), [session?.ends_at]);
  const hasStarted = Number.isFinite(startsMs) ? nowMs >= startsMs : true;
  const hasEnded = Number.isFinite(endsMs) ? nowMs >= endsMs : false;
  const remainingMs = Number.isFinite(endsMs) ? Math.max(0, endsMs - nowMs) : 0;
  const isTherapist = !!session && !!meUid && meUid === session.therapist_uid;
  const isPatient = !!session && !!meUid && meUid === session.user_uid;
  const therapistOnlyMode = crisisStatus === 'active';
  const patientLocked = therapistOnlyMode && isPatient;
  const canSend = isParticipant && hasStarted && !hasEnded && !patientLocked && text.trim().length > 0;

  const otherUid = useMemo(() => {
    if (!session || !meUid) return null;
    return meUid === session.user_uid ? session.therapist_uid : session.user_uid;
  }, [session, meUid]);

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    getUserLite(otherUid).then((u) => {
      if (!cancelled && u) {
        setOtherUserName(String(u.display_name || u.anonymous_username || 'User'));
      }
    });
    return () => { cancelled = true; };
  }, [otherUid]);

  const sendNow = async (messageText: string) => {
    await addDoc(collection(db, 'therapist_sessions', sessionId, 'messages'), {
      sender_uid: meUid,
      text: messageText.trim(),
      created_at: new Date().toISOString(),
    });
    setText('');
  };

  const upsertCrisisSignal = async (status: 'active' | 'cleared', snippet?: string | null) => {
    if (!sessionId || !meUid) return;
    const now = new Date().toISOString();
    await setDoc(
      doc(db, 'therapist_sessions', sessionId, 'signals', 'crisis'),
      {
        status,
        snippet: snippet || null,
        updated_at: now,
        ...(status === 'active'
          ? { triggered_by_uid: meUid, triggered_at: now }
          : { cleared_by_uid: meUid, cleared_at: now }),
      },
      { merge: true }
    );
  };

  const handleSend = async () => {
    if (!meUid || !sessionId || !canSend || sending) return;
    setSending(true);
    try {
      if (isPatient && detectCrisisIntent(text)) {
        const snippet = text.trim().slice(0, 160);
        Alert.alert(
          'Are you safe right now?',
          'If you are in immediate danger, call your local emergency number.\n\nUK: Samaritans 116 123\nUS/CA: 988\nEU: 112\n\nYou can also lock this session so only the therapist can respond.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSending(false) },
            {
              text: 'Send (no lock)',
              onPress: async () => {
                try {
                  await sendNow(text);
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Could not send message.');
                } finally {
                  setSending(false);
                }
              },
            },
            {
              text: 'Send + lock',
              style: 'destructive',
              onPress: async () => {
                try {
                  await upsertCrisisSignal('active', snippet);
                  await sendNow(text);
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Could not send message.');
                } finally {
                  setSending(false);
                }
              },
            },
          ]
        );
        return;
      }

      await sendNow(text);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const chatData = useMemo(() => toChatData(messages), [messages]);

  const handleSubmitReview = async () => {
    if (!sessionId || !session || !meUid || !isPatient) return;
    if (submittingReview) return;
    setSubmittingReview(true);
    try {
      const res = await submitTherapistSessionReview(sessionId, reviewRating, reviewText);
      if (!res.ok) {
        const msg = String(res.error || 'Could not submit review.');
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
          Alert.alert('Already reviewed', 'You already left a review for this session.');
        } else {
          Alert.alert('Error', msg);
        }
        return;
      }
      setDidReview(true);
      setShowReview(false);
      setReviewText('');
      Alert.alert('Thank you', 'Your feedback was submitted.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading session…</Text>
        </View>
      </View>
    );
  }

  if (!session || !isParticipant) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={[chatStyles.header, { paddingHorizontal: 16 }]}>
          <HuzzPressable style={chatStyles.headerBtn} onPress={() => router.back()} haptic="light">
            <Feather name="chevron-left" size={20} color={tokens.colors.text} />
          </HuzzPressable>
          <Text style={chatStyles.title}>Private session</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Session not available</Text>
          <Text style={styles.muted}>You don't have access to this session.</Text>
        </View>
      </View>
    );
  }

  const header = (
    <View style={chatStyles.header}>
      <HuzzPressable style={chatStyles.headerBtn} onPress={() => router.back()} haptic="light">
        <Feather name="chevron-left" size={20} color={tokens.colors.text} />
      </HuzzPressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={chatStyles.title} numberOfLines={1}>
          {otherUserName || 'Session'}
        </Text>
        <Text style={chatStyles.subtitle}>
          {Number.isFinite(startsMs) && Number.isFinite(endsMs)
            ? `${fmtClock(session.starts_at)}–${fmtClock(session.ends_at)} • ${hasEnded ? 'Ended' : hasStarted ? fmtCountdown(remainingMs) : 'Not started'}`
            : hasEnded
              ? 'Ended'
              : hasStarted
                ? 'Active'
                : 'Not started'}
        </Text>
      </View>
      <HuzzPressable
        style={chatStyles.headerBtn}
        onPress={() => {
          Alert.alert(
            'Crisis resources',
            'If you feel unsafe right now, call your local emergency number.\n\nUK: Samaritans 116 123\nUS/CA: 988\nEU: 112'
          );
        }}
        haptic="light"
      >
        <Feather name="alert-triangle" size={18} color={tokens.colors.danger} />
      </HuzzPressable>
    </View>
  );

  const contentAboveList = (
    <>
      <View style={styles.boundaryBanner}>
        <Text style={styles.boundaryTitle}>Support, not emergency care</Text>
        <Text style={styles.boundaryText}>
          This chat is for support and coping strategies. If you're in immediate danger, use the crisis button.
        </Text>
      </View>
      {therapistOnlyMode ? (
        <View style={styles.crisisBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.crisisTitle}>Therapist-only mode is active</Text>
            <Text style={styles.crisisText}>
              A crisis message was detected/reported. Patient replies are locked until the therapist clears it.
            </Text>
            {crisisSnippet ? <Text style={styles.crisisSnippet}>"{crisisSnippet}"</Text> : null}
          </View>
          {isTherapist ? (
            <Pressable
              style={styles.crisisClearBtn}
              onPress={async () => {
                try {
                  await upsertCrisisSignal('cleared', null);
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Could not clear lock.');
                }
              }}
            >
              <Text style={styles.crisisClearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const contentBelowList = (
    <>
      {!hasStarted ? (
        <View style={styles.lockRow}>
          <Feather name="lock" size={16} color={tokens.colors.textSecondary} />
          <Text style={styles.lockText}>
            Session starts at {fmtSlot(session.starts_at)}. You'll be able to chat once it begins.
          </Text>
        </View>
      ) : hasEnded ? (
        <View style={styles.lockRow}>
          <Feather name="clock" size={16} color={tokens.colors.textSecondary} />
          <Text style={styles.lockText}>This session has ended. Messaging is locked.</Text>
        </View>
      ) : null}

      {hasEnded && isPatient && !didReview ? (
        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Leave a review</Text>
          <Text style={styles.reviewHint}>Only the therapist and admins can see your feedback.</Text>
          <Pressable style={styles.reviewBtn} onPress={() => setShowReview((v) => !v)}>
            <Text style={styles.reviewBtnText}>{showReview ? 'Hide' : 'Write review'}</Text>
          </Pressable>

          {showReview ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setReviewRating(n)}
                    style={[styles.starBtn, reviewRating >= n && styles.starBtnActive]}
                  >
                    <Text style={[styles.starText, reviewRating >= n && styles.starTextActive]}>★</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                style={styles.reviewInput}
                placeholder="Optional comment (e.g. good listener, helpful advice)…"
                multiline
              />
              <Pressable
                style={[styles.submitReviewBtn, submittingReview && { opacity: 0.6 }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                <Text style={styles.submitReviewText}>{submittingReview ? 'Submitting…' : 'Submit review'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SharedChatLayout
        header={header}
        chatData={chatData}
        currentUserId={meUid}
        text={text}
        setText={setText}
        onSend={handleSend}
        canSend={canSend}
        sending={sending}
        contentAboveList={contentAboveList}
        contentBelowList={contentBelowList}
        showEmoji={true}
        placeholder={
          hasEnded ? 'Session ended' : !hasStarted ? 'Session not started' : patientLocked ? 'Locked (therapist-only)' : 'Message…'
        }
        inputEditable={!hasEnded && hasStarted && !patientLocked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  boundaryBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(244,114,182,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.25)',
  },
  boundaryTitle: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  boundaryText: { marginTop: 4, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary, lineHeight: 16 },
  crisisBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  crisisTitle: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  crisisText: { marginTop: 4, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary, lineHeight: 16 },
  crisisSnippet: { marginTop: 8, fontSize: 12, fontWeight: '800', color: tokens.colors.text },
  crisisClearBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crisisClearText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  lockRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 10,
    borderRadius: 14,
  },
  lockText: { flex: 1, fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary, lineHeight: 16 },

  reviewCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  reviewTitle: { fontSize: 14, fontWeight: '900', color: tokens.colors.text },
  reviewHint: { marginTop: 6, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted, lineHeight: 16 },
  reviewBtn: {
    marginTop: 10,
    height: 42,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBtnText: { fontSize: 13, fontWeight: '900', color: tokens.colors.pink },
  starBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtnActive: { borderColor: 'rgba(244,114,182,0.55)', backgroundColor: 'rgba(244,114,182,0.12)' },
  starText: { fontSize: 18, fontWeight: '900', color: tokens.colors.textMuted },
  starTextActive: { color: tokens.colors.pink },
  reviewInput: {
    minHeight: 90,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  submitReviewBtn: {
    height: 46,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitReviewText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
