import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  endMatch,
  fetchUserProfile,
  getPartnerProfile,
  clearMatchLastGameInvite,
  markGameInviteNotificationsReadForMatch,
  type MatchLastGameInvite,
  reportMatchMessage,
  sendGameInvite,
  sendMatchMessage,
  setGameInviteAccepted,
  setGameInviteDeclined,
  setGameInviteExpired,
  subscribeToMatchLastGameInvite,
  subscribeToMatchGameScore,
  subscribeToMatchMessages,
} from '@/app/functions';
import { HuzzPressable } from '@/app/ui/components/HuzzPressable.native';
import { SharedChatLayout, chatStyles, type ChatDataItem } from '@/components/SharedChatUI';
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

function routeParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

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

function toChatData(loading: boolean, messages: ChatMessage[]): ChatDataItem[] {
  if (loading) {
    return Array.from({ length: 8 }).map((_, i) => ({ _skeleton: true, id: `sk-${i}` }));
  }
  const sorted = [...messages].sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  const out: ChatDataItem[] = [];
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
}

const GAME_TITLES: Record<string, string> = { tictactoe: 'Tic-Tac-Toe', chess: 'Chess' };

function gameTitle(t: string) {
  const k = (t || 'tictactoe').toLowerCase();
  return GAME_TITLES[k] || t || 'a game';
}

/** Inviter “they declined” strip: only in the short window after `declined_at` (not old stuck rows). */
const DECLINED_AT_LIVE_MS = 2 * 60 * 60 * 1000;

function inviteCreatedAtIsRecent(iso: string, maxAgeMs: number) {
  if (!iso?.trim()) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < maxAgeMs;
}

function inviteExpiresAtIsFuture(iso?: string) {
  if (!iso?.trim()) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t > Date.now();
}

export default function MatchChatScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ matchId: string | string[]; partnerId: string | string[] }>();
  const matchId = routeParam(rawParams.matchId);
  const partnerId = routeParam(rawParams.partnerId);

  const [partnerProfile, setPartnerProfile] = useState<{ display_name?: string; anonymous_username?: string } | null>(null);
  const [myName, setMyName] = useState<string>('Player');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [gameScore, setGameScore] = useState<{ myWins: number; partnerWins: number }>({ myWins: 0, partnerWins: 0 });
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [lastGameInvite, setLastGameInvite] = useState<MatchLastGameInvite>(null);
  const [declinedBannerDismissed, setDeclinedBannerDismissed] = useState(false);
  const [gameInviteBusy, setGameInviteBusy] = useState(false);
  const gameInviteReadKeyRef = useRef<string>('');
  const lastInviteKeyRef = useRef<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUserId(u?.uid ?? null));
    return () => unsub();
  }, []);

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
    });
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const unsub = subscribeToMatchGameScore(matchId, setGameScore);
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    return subscribeToMatchLastGameInvite(matchId, setLastGameInvite);
  }, [matchId]);

  useEffect(() => {
    const key = [lastGameInvite?.status, lastGameInvite?.created_at, lastGameInvite?.declined_at].join('|');
    if (key && key !== lastInviteKeyRef.current) {
      lastInviteKeyRef.current = key;
      setDeclinedBannerDismissed(false);
    }
  }, [lastGameInvite?.status, lastGameInvite?.created_at, lastGameInvite?.declined_at]);

  // Mark inbox read only when we would show the live (fresh) pending recipient banner.
  useEffect(() => {
    if (!matchId || !currentUserId || !partnerId || !lastGameInvite) return;
    if (lastGameInvite.status !== 'pending' || lastGameInvite.from_user_id !== partnerId) return;
    if (!inviteExpiresAtIsFuture(lastGameInvite.expires_at)) return;
    const key = `${lastGameInvite.created_at}`;
    if (gameInviteReadKeyRef.current === key) return;
    gameInviteReadKeyRef.current = key;
    void markGameInviteNotificationsReadForMatch(matchId);
  }, [matchId, currentUserId, partnerId, lastGameInvite]);

  useEffect(() => {
    if (!matchId || !lastGameInvite || lastGameInvite.status !== 'pending') return;
    const expiresAt = Date.parse(lastGameInvite.expires_at || '');
    if (Number.isNaN(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      void setGameInviteExpired(matchId, lastGameInvite.invite_id);
      return;
    }
    const id = setTimeout(() => {
      void setGameInviteExpired(matchId, lastGameInvite.invite_id);
    }, delay + 250);
    return () => clearTimeout(id);
  }, [matchId, lastGameInvite]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !matchId || sending) return;
    setSending(true);
    try {
      await sendMatchMessage(matchId, content);
      setText('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  }, [text, matchId, sending]);

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

  const handleReportMessage = useCallback(
    (msg: { id: string; fromUid: string; text: string }) => {
      if (!matchId || !partnerId || msg.fromUid !== partnerId) return;
      const submit = (reason: string) => {
        void (async () => {
          try {
            await reportMatchMessage({
              matchId,
              targetUid: msg.fromUid,
              messageId: msg.id,
              messageContent: msg.text,
              reason,
            });
            Alert.alert('Reported', 'Thanks — our team will review this message.');
          } catch (e: any) {
            Alert.alert('Could not report', e?.message || 'Try again.');
          }
        })();
      };
      Alert.alert('Report message', 'Moderators can see the reported message. What’s the issue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Harassment', style: 'destructive', onPress: () => submit('harassment') },
        { text: 'Self-harm / crisis', style: 'destructive', onPress: () => submit('self_harm') },
        { text: 'Spam or scam', style: 'destructive', onPress: () => submit('spam') },
        { text: 'Other', onPress: () => submit('other') },
      ]);
    },
    [matchId, partnerId]
  );

  const displayPartnerName = partnerProfile
    ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
    : 'Your match';

  const onJoinFromBanner = useCallback(async () => {
    if (!matchId || !lastGameInvite) return;
    setGameInviteBusy(true);
    try {
      void markGameInviteNotificationsReadForMatch(matchId);
      const accepted = await setGameInviteAccepted(matchId, lastGameInvite.invite_id);
      if (!accepted) {
        Alert.alert('Invite ended', 'This game invite is no longer active.');
        return;
      }
      const gt = (lastGameInvite.game_type || 'tictactoe').toLowerCase();
      router.push({
        pathname: '/game-webview',
        params: { room: lastGameInvite.game_room_id || lastGameInvite.invite_id, matchId, gameType: gt, opponentName: displayPartnerName, myName, inviteId: lastGameInvite.invite_id },
      } as any);
    } finally {
      setGameInviteBusy(false);
    }
  }, [matchId, lastGameInvite, displayPartnerName, myName, router]);

  const onDeclineFromBanner = useCallback(async () => {
    if (!matchId || !lastGameInvite?.invite_id) return;
    setGameInviteBusy(true);
    try {
      await setGameInviteDeclined(matchId, lastGameInvite.invite_id);
      void markGameInviteNotificationsReadForMatch(matchId);
    } finally {
      setGameInviteBusy(false);
    }
  }, [matchId, lastGameInvite?.invite_id]);

  const onResendFromBanner = useCallback(async () => {
    if (!matchId || !partnerId || !lastGameInvite) return;
    setGameInviteBusy(true);
    try {
      const inviteId = await sendGameInvite(partnerId, matchId, lastGameInvite.game_type || 'tictactoe');
      if (!inviteId) {
        Alert.alert('Could not send', 'Try again in a moment.');
        return;
      }
      router.push({
        pathname: '/game-webview',
        params: {
          room: inviteId,
          matchId,
          gameType: lastGameInvite.game_type || 'tictactoe',
          opponentName: displayPartnerName,
          myName,
          inviteId,
        },
      } as any);
    } finally {
      setGameInviteBusy(false);
    }
  }, [matchId, partnerId, lastGameInvite, displayPartnerName, myName, router]);

  const gameInviteBanner = useMemo(() => {
    if (!currentUserId || !partnerId || !lastGameInvite) return null;
    const st = (lastGameInvite.status || 'none').toLowerCase();
    const gt = lastGameInvite.game_type;
    const freshPending =
      st === 'pending' &&
      lastGameInvite.from_user_id === partnerId &&
      inviteExpiresAtIsFuture(lastGameInvite.expires_at);

    if (freshPending) {
      return (
        <View style={styles.inviteCard} accessibilityRole="summary">
          <Text style={styles.inviteKicker}>Game invite</Text>
          <Text style={styles.inviteLine}>
            {displayPartnerName} invited you to play {gameTitle(gt)}
          </Text>
          {gameInviteBusy ? (
            <View style={styles.inviteBusyRow}>
              <ActivityIndicator size="small" color={tokens.colors.pink} />
            </View>
          ) : (
            <View style={styles.inviteActions}>
              <Pressable onPress={onDeclineFromBanner} style={[styles.inviteBtn, styles.inviteBtnGhost]}>
                <Text style={styles.inviteBtnGhostText}>Decline</Text>
              </Pressable>
              <Pressable onPress={onJoinFromBanner} style={[styles.inviteBtn, styles.inviteBtnPrimary]}>
                <Text style={styles.inviteBtnPrimaryText}>Join</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    }
    const declinedAt = lastGameInvite.declined_at;
    const isLiveDeclineForSender =
      st === 'declined' &&
      lastGameInvite.from_user_id === currentUserId &&
      !declinedBannerDismissed &&
      !!declinedAt?.trim() &&
      inviteCreatedAtIsRecent(declinedAt, DECLINED_AT_LIVE_MS);

    if (isLiveDeclineForSender) {
      return (
        <View style={[styles.inviteCard, styles.inviteCardMuted]} accessibilityRole="summary">
          <Text style={styles.inviteLine}>
            {displayPartnerName} declined the game invite
          </Text>
          {gameInviteBusy ? (
            <View style={styles.inviteBusyRow}>
              <ActivityIndicator size="small" color={tokens.colors.pink} />
            </View>
          ) : (
            <View style={styles.inviteActions}>
              <Pressable
                onPress={() => {
                  setDeclinedBannerDismissed(true);
                  if (matchId) void clearMatchLastGameInvite(matchId);
                }}
                style={[styles.inviteBtn, styles.inviteBtnGhost]}
              >
                <Text style={styles.inviteBtnGhostText}>Dismiss</Text>
              </Pressable>
              <Pressable onPress={onResendFromBanner} style={[styles.inviteBtn, styles.inviteBtnPrimary]}>
                <Text style={styles.inviteBtnPrimaryText}>Resend</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    }
    return null;
  }, [
    matchId,
    currentUserId,
    partnerId,
    lastGameInvite,
    displayPartnerName,
    declinedBannerDismissed,
    gameInviteBusy,
    onJoinFromBanner,
    onDeclineFromBanner,
    onResendFromBanner,
  ]);

  const handlePlay = () => {
    if (!matchId || !partnerId) return;
    Alert.alert('Choose game', "Invite your match to play. They'll get a notification.", [
      {
        text: 'Tic-Tac-Toe',
        onPress: async () => {
          const inviteId = await sendGameInvite(partnerId, matchId, 'tictactoe');
          if (!inviteId) {
            Alert.alert('Could not send', 'Try again in a moment.');
            return;
          }
          router.push({
            pathname: '/game-webview',
            params: { room: inviteId, matchId, gameType: 'tictactoe', opponentName: displayPartnerName, myName, inviteId },
          } as any);
        },
      },
      {
        text: 'Chess',
        onPress: async () => {
          const inviteId = await sendGameInvite(partnerId, matchId, 'chess');
          if (!inviteId) {
            Alert.alert('Could not send', 'Try again in a moment.');
            return;
          }
          router.push({
            pathname: '/game-webview',
            params: { room: inviteId, matchId, gameType: 'chess', opponentName: displayPartnerName, myName, inviteId },
          } as any);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const chatData = useMemo(() => toChatData(loadingMessages, messages), [loadingMessages, messages]);
  const canSend = text.trim().length > 0;

  if (!matchId || !partnerId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.centered, { padding: 24 }]}>
          <Text style={chatStyles.title}>Chat</Text>
          <Text style={chatStyles.subtitle}>Missing match info</Text>
          <HuzzPressable style={chatStyles.headerBtn} onPress={() => router.back()} haptic="light">
            <Text style={styles.headerBtnText}>Back</Text>
          </HuzzPressable>
        </View>
      </SafeAreaView>
    );
  }

  const partnerName = displayPartnerName;

  const header = (
    <View style={chatStyles.header}>
      <HuzzPressable style={chatStyles.headerBtn} onPress={() => router.back()} haptic="light">
        <Feather name="chevron-left" size={20} color={tokens.colors.text} />
      </HuzzPressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={chatStyles.title} numberOfLines={1}>{partnerName}</Text>
        {(gameScore.myWins > 0 || gameScore.partnerWins > 0) ? (
          <Text style={chatStyles.subtitle}>You {gameScore.myWins} – {gameScore.partnerWins} {partnerName}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <HuzzPressable style={chatStyles.headerBtn} onPress={handlePlay} haptic="light">
          <Feather name="grid" size={18} color={tokens.colors.text} />
        </HuzzPressable>
        <HuzzPressable style={chatStyles.headerBtn} onPress={handleUnfriend} haptic="light">
          <Feather name="user-minus" size={18} color={tokens.colors.text} />
        </HuzzPressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SharedChatLayout
        header={header}
        chatData={chatData}
        currentUserId={currentUserId}
        text={text}
        setText={setText}
        onSend={handleSend}
        canSend={canSend}
        sending={sending}
        showEmoji={true}
        placeholder="Message..."
        onReportMessage={handleReportMessage}
        contentAboveList={gameInviteBanner}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 13, fontWeight: '600', color: tokens.colors.text },
  inviteCard: {
    marginHorizontal: tokens.spacing.screenHorizontal,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.45)',
  },
  inviteCardMuted: {
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  inviteKicker: { fontSize: 11, fontWeight: '700', color: tokens.colors.pink, letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  inviteLine: { fontSize: 14, fontWeight: '600', color: tokens.colors.text, lineHeight: 20 },
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  inviteBusyRow: { alignItems: 'center', marginTop: 10, paddingVertical: 4 },
  inviteBtn: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  inviteBtnPrimary: { backgroundColor: tokens.colors.pink },
  inviteBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  inviteBtnGhost: { backgroundColor: tokens.colors.surfaceElevated, borderWidth: 1, borderColor: tokens.colors.border },
  inviteBtnGhostText: { color: tokens.colors.text, fontSize: 15, fontWeight: '600' },
});
