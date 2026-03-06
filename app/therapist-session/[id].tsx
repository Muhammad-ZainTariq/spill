import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';
import { KeyboardAwareLayout } from '@/app/KeyboardAwareLayout.native';
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

export default function TherapistSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const sessionId = String(params?.id || '').trim();
  const meUid = auth.currentUser?.uid || null;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [tick, setTick] = useState(0);
  const listRef = useRef<FlatList>(null);
  const [crisisStatus, setCrisisStatus] = useState<'active' | 'cleared' | null>(null);
  const [crisisSnippet, setCrisisSnippet] = useState<string | null>(null);

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

  // Keep latest visible above keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }));
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const isParticipant = useMemo(() => {
    if (!meUid || !session) return false;
    return meUid === session.user_uid || meUid === session.therapist_uid;
  }, [meUid, session]);

  const nowMs = Date.now() + tick * 0; // tick forces rerender
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

  const sendNow = async (messageText: string) => {
    await addDoc(collection(db, 'therapist_sessions', sessionId, 'messages'), {
      sender_uid: meUid,
      text: messageText.trim(),
      created_at: new Date().toISOString(),
    });
    setText('');
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
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
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send (no lock)',
              onPress: async () => {
                try {
                  await sendNow(text);
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Could not send message.');
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session || !isParticipant) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={tokens.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Private session</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Session not available</Text>
          <Text style={styles.muted}>You don’t have access to this session.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top'] as any}>
      <KeyboardAwareLayout>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={tokens.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Private session</Text>
            <Text style={styles.headerSubtitle}>
              {Number.isFinite(startsMs) && Number.isFinite(endsMs)
                ? `${fmtClock(session.starts_at)}–${fmtClock(session.ends_at)} • ${hasEnded ? 'Ended' : hasStarted ? fmtCountdown(remainingMs) : 'Not started'}`
                : hasEnded
                  ? 'Ended'
                  : hasStarted
                    ? 'Active'
                    : 'Not started'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Alert.alert(
                'Crisis resources',
                'If you feel unsafe right now, call your local emergency number.\n\nUK: Samaritans 116 123\nUS/CA: 988\nEU: 112'
              );
            }}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Feather name="alert-triangle" size={18} color={tokens.colors.danger} />
          </Pressable>
        </View>

        <View style={styles.boundaryBanner}>
          <Text style={styles.boundaryTitle}>Support, not emergency care</Text>
          <Text style={styles.boundaryText}>
            This chat is for support and coping strategies. If you’re in immediate danger, use the crisis button.
          </Text>
        </View>

        {therapistOnlyMode ? (
          <View style={styles.crisisBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.crisisTitle}>Therapist-only mode is active</Text>
              <Text style={styles.crisisText}>
                A crisis message was detected/reported. Patient replies are locked until the therapist clears it.
              </Text>
              {crisisSnippet ? <Text style={styles.crisisSnippet}>“{crisisSnippet}”</Text> : null}
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

        <View style={{ flex: 1, minHeight: 0 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              setShowScrollToBottom(y > 80);
            }}
            scrollEventThrottle={100}
            renderItem={({ item }) => {
              const mine = item.sender_uid === meUid;
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {item.text}
                  </Text>
                  <Text style={[styles.bubbleTime, mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                    {fmtClock(item.created_at)}
                  </Text>
                </View>
              );
            }}
          />
        </View>

        {!hasStarted ? (
          <View style={styles.lockRow}>
            <Feather name="lock" size={16} color={tokens.colors.textSecondary} />
            <Text style={styles.lockText}>
              Session starts at {fmtSlot(session.starts_at)}. You’ll be able to chat once it begins.
            </Text>
          </View>
        ) : hasEnded ? (
          <View style={styles.lockRow}>
            <Feather name="clock" size={16} color={tokens.colors.textSecondary} />
            <Text style={styles.lockText}>This session has ended. Messaging is locked.</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            style={styles.input}
            placeholder={
              hasEnded ? 'Session ended' : !hasStarted ? 'Session not started' : patientLocked ? 'Locked (therapist-only)' : 'Message…'
            }
            editable={!hasEnded && hasStarted && !patientLocked}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, { opacity: canSend && !sending ? 1 : 0.5 }]}
            disabled={!canSend || sending}
            onPress={handleSend}
          >
            <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
          </Pressable>
        </View>

        {showScrollToBottom ? (
          <Pressable
            style={styles.scrollToBottomBtn}
            onPress={() => {
              listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
              setShowScrollToBottom(false);
            }}
          >
            <Text style={styles.scrollToBottomText}>↓</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareLayout>
    </SafeAreaView>
  );
}

function fmtSlot(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
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
  headerTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  headerSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: tokens.colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  boundaryBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
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

  bubble: {
    maxWidth: '80%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: tokens.colors.pink, borderColor: 'rgba(244,114,182,0.50)' },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: tokens.colors.surfaceOverlay },
  bubbleText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: tokens.colors.text },
  bubbleTime: { marginTop: 4, fontSize: 10, fontWeight: '800' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.85)' },
  bubbleTimeTheirs: { color: tokens.colors.textMuted },

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

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
    minHeight: 44,
    maxHeight: 120,
  },
  sendBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  scrollToBottomText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});

