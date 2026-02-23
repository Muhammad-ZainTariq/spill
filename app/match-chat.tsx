import {
  endMatch,
  getPartnerProfile,
  sendGameInvite,
  sendMatchMessage,
  subscribeToMatchMessages,
} from '@/app/functions';
import { auth } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const INPUT_BAR_MIN_HEIGHT = 56;
const INPUT_BAR_EXTRA_PADDING = 12;

export default function MatchChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { matchId, partnerId } = useLocalSearchParams<{ matchId: string; partnerId: string }>();
  const [partnerProfile, setPartnerProfile] = useState<{ display_name?: string; anonymous_username?: string } | null>(null);
  const [matchMessages, setMatchMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const listRef = useRef<FlatList>(null);
  const currentUserId = auth.currentUser?.uid ?? null;

  const listBottomInset = INPUT_BAR_MIN_HEIGHT + INPUT_BAR_EXTRA_PADDING + Math.max(insets.bottom, 0);

  useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    getPartnerProfile(partnerId).then((p) => {
      if (!cancelled) setPartnerProfile(p);
    });
    return () => { cancelled = true; };
  }, [partnerId]);

  useEffect(() => {
    if (!matchId) return;
    const unsub = subscribeToMatchMessages(matchId, setMatchMessages);
    return () => unsub();
  }, [matchId]);

  const handleSendMessage = async () => {
    const content = messageText.trim();
    if (!content || !matchId || sendingMessage) return;
    setMessageText('');
    setSendingMessage(true);
    try {
      await sendMatchMessage(matchId, content);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setMessageText(content);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleUnfriend = () => {
    if (!matchId) return;
    Alert.alert(
      'Unfriend',
      'End this match and remove the connection?',
      [
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
      ]
    );
  };

  const handlePlay = () => {
    Alert.alert('Choose game', "Invite your match to play. They'll get a notification.", [
      {
        text: 'Chess',
        onPress: async () => {
          await sendGameInvite(partnerId!, matchId!, 'chess');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'chess', opponentName: partnerName } } as any);
        },
      },
      {
        text: 'Tic-Tac-Toe',
        onPress: async () => {
          await sendGameInvite(partnerId!, matchId!, 'tictactoe');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'tictactoe', opponentName: partnerName } } as any);
        },
      },
      {
        text: 'Square Off!',
        onPress: async () => {
          await sendGameInvite(partnerId!, matchId!, 'squareoff');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'squareoff', opponentName: partnerName } } as any);
        },
      },
      {
        text: 'Breakout',
        onPress: async () => {
          await sendGameInvite(partnerId!, matchId!, 'breakout');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'breakout', opponentName: partnerName } } as any);
        },
      },
      {
        text: 'Space Shooter',
        onPress: async () => {
          await sendGameInvite(partnerId!, matchId!, 'spaceshooter');
          router.push({ pathname: '/game-webview', params: { room: matchId, gameType: 'spaceshooter', opponentName: partnerName } } as any);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!matchId || !partnerId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Missing match info</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const partnerName = partnerProfile
    ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
    : 'Your match';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header – fixed, not affected by keyboard */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{partnerName}</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.actionBtn} onPress={handlePlay}>
            <Feather name="grid" size={18} color="#ec4899" />
            <Text style={styles.actionBtnTextPink}>Play</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnRed]} onPress={handleUnfriend}>
            <Feather name="user-minus" size={18} color="#ef4444" />
            <Text style={styles.actionBtnTextRed}>Unfriend</Text>
          </Pressable>
        </View>
      </View>

      {/* Message list – fills space; bottom padding so last message is above input bar */}
      <FlatList
        ref={listRef}
        data={matchMessages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomInset }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>{item.content}</Text>
              <Text style={styles.bubbleTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      {/* Input bar – sticks to keyboard (only this moves); no container resize */}
      <KeyboardStickyView
        offset={{ closed: 0, opened: 0 }}
        style={styles.stickyWrapper}
      >
        <View style={[styles.inputBar, { paddingBottom: INPUT_BAR_EXTRA_PADDING + Math.max(insets.bottom, 0) }]}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor="#9ca3af"
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={500}
            blurOnSubmit={false}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sendingMessage}
          >
            {sendingMessage ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6b7280', marginBottom: 16 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#ec4899', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backButton: { padding: 8, marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#111827' },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ec4899',
    gap: 4,
  },
  actionBtnTextPink: { fontSize: 12, fontWeight: '600', color: '#ec4899' },
  actionBtnRed: { borderColor: '#ef4444' },
  actionBtnTextRed: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  bubble: { maxWidth: '78%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, marginBottom: 6 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#ec4899', borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#111827' },
  bubbleTime: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  stickyWrapper: {
    backgroundColor: '#f0f2f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: INPUT_BAR_MIN_HEIGHT,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#c4c8cc', opacity: 0.9 },
});
