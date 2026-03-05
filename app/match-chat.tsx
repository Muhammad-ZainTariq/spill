import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  endMatch,
  fetchUserProfile,
  getPartnerProfile,
  sendGameInvite,
  sendMatchMessage,
  subscribeToMatchGameScore,
  subscribeToMatchMessages,
} from '@/app/functions';
import { KeyboardAwareLayout } from '@/app/KeyboardAwareLayout.native';
import { HuzzPressable } from '@/app/ui/components/HuzzPressable.native';
import { SkeletonBox } from '@/app/ui/components/SkeletonBox.native';
import { tokens } from '@/app/ui/tokens';
import { auth } from '@/lib/firebase';

type RawMatchMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: any;
};

type ChatMessage = {
  id: string;
  fromUid: string;
  text: string;
  createdAt: Date | null;
};

function toDate(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v?.toMillis === 'function') return new Date(v.toMillis());
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function fmtTime(d: Date | null) {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDayLabel(d: Date | null) {
  if (!d) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MatchChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { matchId, partnerId } = useLocalSearchParams<{ matchId: string; partnerId: string }>();

  const [partnerProfile, setPartnerProfile] = useState<{ display_name?: string; anonymous_username?: string } | null>(null);
  const [myName, setMyName] = useState<string>('Player');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [inputH, setInputH] = useState(40);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [gameScore, setGameScore] = useState<{ myWins: number; partnerWins: number }>({ myWins: 0, partnerWins: 0 });

  const listRef = useRef<FlatList<any>>(null);
  const atBottomRef = useRef(true);
  const currentUserId = auth.currentUser?.uid ?? null;

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  // Keep latest messages visible when keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => scrollToBottom(true));
    });
    return () => sub.remove();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    getPartnerProfile(partnerId)
      .then((p) => { if (!cancelled) setPartnerProfile(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [partnerId]);

  useEffect(() => {
    let cancelled = false;
    fetchUserProfile()
      .then((p: any) => {
        if (cancelled) return;
        const name = (p?.display_name || p?.anonymous_username || 'Player').toString().trim();
        setMyName(name || 'Player');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!matchId) return;
    setLoadingMessages(true);
    const unsub = subscribeToMatchMessages(matchId, (raw: RawMatchMessage[] = []) => {
      const mapped: ChatMessage[] = (Array.isArray(raw) ? raw : []).map((m) => ({
        id: String(m.id),
        fromUid: String(m.sender_id),
        text: String(m.content ?? ''),
        createdAt: toDate(m.created_at),
      }));
      setMessages(mapped);
      setLoadingMessages(false);
      if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom(false));
    });
    return () => unsub();
  }, [matchId, scrollToBottom]);

  useEffect(() => {
    if (!matchId) return;
    const unsub = subscribeToMatchGameScore(matchId, setGameScore);
    return () => unsub();
  }, [matchId]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !matchId || sending) return;
    setSending(true);
    try {
      await sendMatchMessage(matchId, content);
      setText('');
      setShowEmoji(false);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const handleUnfriend = () => {
    if (!matchId) return;
    Alert.alert('Unfriend', 'End this match and remove the connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: async () => {
          const success = await endMatch(matchId);
          if (success) router.back();
          else Alert.alert('Error', 'Failed to end match.');
        },
      },
    ]);
  };

  const handlePlay = () => {
    if (!matchId || !partnerId) return;
    const partnerName = partnerProfile
      ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
      : 'Your match';
    Alert.alert('Choose game', "Invite your match to play. They'll get a notification.", [
      {
        text: 'Tic-Tac-Toe',
        onPress: async () => {
          await sendGameInvite(partnerId, matchId, 'tictactoe');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'tictactoe', opponentName: partnerName, myName } } as any);
        },
      },
      {
        text: 'Chess',
        onPress: async () => {
          await sendGameInvite(partnerId, matchId, 'chess');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'chess', opponentName: partnerName, myName } } as any);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!matchId || !partnerId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.centered, { padding: 24 }]}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>Missing match info</Text>
          <HuzzPressable style={styles.headerBtn} onPress={() => router.back()} haptic="light">
            <Text style={styles.headerBtnText}>Back</Text>
          </HuzzPressable>
        </View>
      </SafeAreaView>
    );
  }

  const partnerName = partnerProfile
    ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
    : 'Your match';

  const chatData = useMemo(() => {
    if (loadingMessages) {
      return Array.from({ length: 8 }).map((_, i) => ({ _skeleton: true, id: `sk-${i}` }));
    }
    const sorted = [...messages].sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
    const out: any[] = [];
    let lastDay: string | null = null;
    for (const m of sorted) {
      const d = m.createdAt;
      const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'unknown';
      if (key !== lastDay) {
        out.push({ _type: 'day', id: `day-${key}`, day: d });
        lastDay = key;
      }
      out.push({ _type: 'msg', ...m });
    }
    return out.reverse();
  }, [loadingMessages, messages]);

  const bottomSafePadding = keyboardVisible ? 0 : Math.max(0, insets.bottom);
  const canSend = text.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAwareLayout>
        <View style={styles.header}>
          <HuzzPressable style={styles.headerBtn} onPress={() => router.back()} haptic="light">
            <Feather name="chevron-left" size={20} color={tokens.colors.text} />
          </HuzzPressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title} numberOfLines={1}>{partnerName}</Text>
            {(gameScore.myWins > 0 || gameScore.partnerWins > 0) ? (
              <Text style={styles.subtitle}>You {gameScore.myWins} – {gameScore.partnerWins} {partnerName}</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <HuzzPressable style={styles.headerBtn} onPress={handlePlay} haptic="light">
              <Feather name="grid" size={18} color={tokens.colors.text} />
            </HuzzPressable>
            <HuzzPressable style={styles.headerBtn} onPress={handleUnfriend} haptic="light">
              <Feather name="user-minus" size={18} color={tokens.colors.text} />
            </HuzzPressable>
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 0 }}>
          <FlatList
            ref={listRef}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={chatData}
            keyExtractor={(item) => String(item.id)}
            inverted
            scrollEventThrottle={100}
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onScroll={(e) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              atBottomRef.current = y < 40;
              setShowScrollToBottom(y > 120);
            }}
            renderItem={({ item }) => {
              if (item?._type === 'day') {
                return (
                  <View style={styles.dayRow}>
                    <View style={styles.dayPill}>
                      <Text style={styles.dayText}>{fmtDayLabel(item.day)}</Text>
                    </View>
                  </View>
                );
              }
              if (item?._skeleton) {
                const mine = item.id.endsWith('0') || item.id.endsWith('2') || item.id.endsWith('4');
                return (
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <SkeletonBox style={{ height: 10, width: mine ? 160 : 190 }} />
                  </View>
                );
              }
              if (item?._type !== 'msg') return null;
              const mine = item.fromUid === currentUserId;
              return (
                <Animated.View entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic))}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                      {String(item.text || '')}
                      <Text style={[styles.timeInline, !mine && styles.timeInlineTheirs]}>
                        {'  '}{fmtTime(item.createdAt)}
                      </Text>
                    </Text>
                  </View>
                </Animated.View>
              );
            }}
          />
        </View>

        {showEmoji ? (
          <View style={styles.emojiPanel}>
            {['😀', '😂', '😍', '🥹', '😮', '😡', '👍', '🙏', '🔥', '💯', '❤️', '✨'].map((e) => (
              <HuzzPressable
                key={e}
                style={styles.emojiBtn}
                onPress={() => setText((t) => `${t || ''}${e}`)}
                haptic="light"
              >
                <Text style={styles.emoji}>{e}</Text>
              </HuzzPressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.composer, { paddingBottom: 12 + bottomSafePadding }]}>
          <HuzzPressable
            style={styles.iconBtn}
            onPress={() => setShowEmoji((v) => !v)}
            haptic="light"
          >
            <Text style={styles.iconBtnText}>{showEmoji ? '⌨️' : '😊'}</Text>
          </HuzzPressable>

          <TextInput
            style={[styles.input, { height: Math.max(40, Math.min(120, inputH)) }]}
            placeholder="Message..."
            placeholderTextColor={tokens.colors.textMuted}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (!atBottomRef.current) setShowScrollToBottom(true);
            }}
            multiline
            onFocus={() => requestAnimationFrame(() => scrollToBottom(true))}
            onContentSizeChange={(e) => setInputH(e?.nativeEvent?.contentSize?.height || 40)}
          />

          <HuzzPressable
            style={[styles.sendBtn, { opacity: canSend ? 1 : 0.5 }]}
            disabled={!canSend || sending}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              handleSend();
            }}
            haptic="light"
          >
            <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
          </HuzzPressable>
        </View>

        {showScrollToBottom ? (
          <HuzzPressable
            style={[styles.scrollToBottomBtn, { bottom: 110 + bottomSafePadding }]}
            onPress={() => {
              scrollToBottom(true);
              setShowScrollToBottom(false);
            }}
            haptic="light"
          >
            <Text style={styles.scrollToBottomText}>↓</Text>
          </HuzzPressable>
        ) : null}
      </KeyboardAwareLayout>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  centered: ViewStyle;
  header: ViewStyle;
  headerBtn: ViewStyle;
  headerBtnText: TextStyle;
  title: TextStyle;
  subtitle: TextStyle;
  list: ViewStyle;
  listContent: ViewStyle;
  bubble: ViewStyle;
  bubbleMine: ViewStyle;
  bubbleTheirs: ViewStyle;
  bubbleText: TextStyle;
  bubbleTextMine: TextStyle;
  bubbleTextTheirs: TextStyle;
  timeInline: TextStyle;
  timeInlineTheirs: TextStyle;
  dayRow: ViewStyle;
  dayPill: ViewStyle;
  dayText: TextStyle;
  composer: ViewStyle;
  iconBtn: ViewStyle;
  iconBtnText: TextStyle;
  input: TextStyle;
  sendBtn: ViewStyle;
  sendText: TextStyle;
  emojiPanel: ViewStyle;
  emojiBtn: ViewStyle;
  emoji: TextStyle;
  scrollToBottomBtn: ViewStyle;
  scrollToBottomText: TextStyle;
}>({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 8,
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 13, fontWeight: '600', color: tokens.colors.text },
  title: { fontSize: 17, fontWeight: '600', color: tokens.colors.text },
  subtitle: { fontSize: 12, fontWeight: '500', lineHeight: 16, color: tokens.colors.textMuted, marginTop: 2 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: tokens.spacing.screenHorizontal, paddingBottom: 12 },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 6,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: tokens.colors.pink },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(244, 114, 182, 0.10)' },
  bubbleText: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: tokens.colors.text },
  timeInline: { fontSize: 9, fontWeight: '400', opacity: 0.7, letterSpacing: 0.5 },
  timeInlineTheirs: { color: tokens.colors.textMuted, fontSize: 9, fontWeight: '400' },
  dayRow: { alignItems: 'center', marginBottom: 10 },
  dayPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: tokens.radius.full, backgroundColor: tokens.colors.surfaceElevated },
  dayText: { fontSize: 12, fontWeight: '500', lineHeight: 16, color: tokens.colors.textSecondary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, color: tokens.colors.text },
  input: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: tokens.colors.text,
  },
  sendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.pink,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20, color: tokens.colors.text },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  scrollToBottomText: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
});
