import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  endMatch,
  fetchUserProfile,
  getPartnerProfile,
  sendGameInvite,
  sendMatchMessage,
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

export default function MatchChatScreen() {
  const router = useRouter();
  const { matchId, partnerId } = useLocalSearchParams<{ matchId: string; partnerId: string }>();

  const [partnerProfile, setPartnerProfile] = useState<{ display_name?: string; anonymous_username?: string } | null>(null);
  const [myName, setMyName] = useState<string>('Player');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [gameScore, setGameScore] = useState<{ myWins: number; partnerWins: number }>({ myWins: 0, partnerWins: 0 });

  const currentUserId = auth.currentUser?.uid ?? null;

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
          <Text style={chatStyles.title}>Chat</Text>
          <Text style={chatStyles.subtitle}>Missing match info</Text>
          <HuzzPressable style={chatStyles.headerBtn} onPress={() => router.back()} haptic="light">
            <Text style={styles.headerBtnText}>Back</Text>
          </HuzzPressable>
        </View>
      </SafeAreaView>
    );
  }

  const partnerName = partnerProfile
    ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
    : 'Your match';

  const chatData = useMemo(() => toChatData(loadingMessages, messages), [loadingMessages, messages]);
  const canSend = text.trim().length > 0;

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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 13, fontWeight: '600', color: tokens.colors.text },
});
