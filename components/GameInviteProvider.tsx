import { markNotificationRead, setGameInviteAccepted, setGameInviteDeclined, subscribeToGameInvites } from '@/app/functions';
import { auth } from '@/lib/firebase';
import { addNotificationResponseListener, dismissAllAppNotifications } from '@/lib/pushNotifications';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type GameInvitePrompt = {
  id: string;
  invite_id: string;
  game_room_id: string;
  match_id: string;
  game_type: string;
};

export function GameInviteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const actionedRef = useRef<Set<string>>(new Set());
  const openIdRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState<GameInvitePrompt | null>(null);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      sub = await addNotificationResponseListener((response) => {
        const d = response.notification.request.content.data as {
          type?: string;
          match_id?: string;
          game_type?: string;
          invite_id?: string;
          group_id?: string;
          room_id?: string;
        };
        if (d?.type === 'group_streak' && d.group_id) {
          router.push(`/group?groupId=${d.group_id}` as any);
          return;
        }
        if (d?.type === 'match_accepted') {
          router.replace('/(tabs)/matches' as any);
          return;
        }
        if ((d?.type === 'live_podcast_started' || d?.type === 'live_podcast_soon') && d.room_id) {
          router.push(`/live/${d.room_id}` as any);
          return;
        }
        if (d?.type !== 'game_invite' || !d.match_id || !d.invite_id) return;
        const gameType = (d.game_type || 'tictactoe').toLowerCase();
        void (async () => {
          await dismissAllAppNotifications();
          const accepted = await setGameInviteAccepted(String(d.match_id), String(d.invite_id));
          if (!accepted) {
            Alert.alert('Invite ended', 'This game invite is no longer active.');
            return;
          }
          router.push({
            pathname: '/game-webview',
            params: {
              room: d.room_id ? String(d.room_id) : String(d.invite_id),
              matchId: String(d.match_id),
              gameType,
              inviteId: String(d.invite_id),
            },
          } as any);
        })();
      });
      if (cancelled) {
        sub?.remove();
        sub = null;
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  useEffect(() => {
    let inviteUnsub: (() => void) | undefined;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      inviteUnsub?.();
      inviteUnsub = undefined;
      if (!user) {
        actionedRef.current.clear();
        openIdRef.current = null;
        setPrompt(null);
        return;
      }
      inviteUnsub = subscribeToGameInvites((invites) => {
        const unread = invites.filter((i) => !i.read);
        if (openIdRef.current !== null) {
          const stillActive = unread.some((i) => i.id === openIdRef.current);
          if (!stillActive) {
            openIdRef.current = null;
            setPrompt(null);
          }
          return;
        }
        unread.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const next = unread.find((i) => !actionedRef.current.has(i.id));
        if (!next) return;
        openIdRef.current = next.id;
        setPrompt({
          id: next.id,
          invite_id: next.invite_id,
          game_room_id: next.game_room_id,
          match_id: next.match_id,
          game_type: (next.game_type || 'tictactoe').toLowerCase(),
        });
      });
    });
    return () => {
      inviteUnsub?.();
      authUnsub();
    };
  }, []);

  const closePrompt = () => {
    const payload = prompt;
    if (!payload) return;
    setPrompt(null);
    openIdRef.current = null;
    actionedRef.current.add(payload.id);
    void (async () => {
      await markNotificationRead(payload.id);
      await dismissAllAppNotifications();
      await setGameInviteDeclined(payload.match_id, payload.invite_id);
    })();
  };

  const joinPrompt = () => {
    const payload = prompt;
    if (!payload) return;
    const gameType = payload.game_type;
    setPrompt(null);
    openIdRef.current = null;
    actionedRef.current.add(payload.id);
    void (async () => {
      await markNotificationRead(payload.id);
      await dismissAllAppNotifications();
      const accepted = await setGameInviteAccepted(payload.match_id, payload.invite_id);
      if (!accepted) {
        Alert.alert('Invite ended', 'This game invite is no longer active.');
        return;
      }
      router.push({
        pathname: '/game-webview',
        params: {
          room: payload.game_room_id || payload.invite_id,
          matchId: String(payload.match_id),
          gameType,
          inviteId: payload.invite_id,
        },
      } as any);
    })();
  };

  const inviteGameLabel = prompt
    ? { tictactoe: 'Tic-Tac-Toe', chess: 'Chess' }[prompt.game_type] || prompt.game_type
    : '';

  return (
    <>
      {children}
      <Modal visible={!!prompt} transparent animationType="fade" statusBarTranslucent onRequestClose={closePrompt}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePrompt} accessibilityRole="button" accessibilityLabel="Dismiss" />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Game invite</Text>
            <Text style={styles.cardBody}>
              {inviteGameLabel ? `Your friend invited you to play ${inviteGameLabel}.` : 'Your friend invited you to play.'}
            </Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={closePrompt}>
                <Text style={styles.btnSecondaryText}>Decline</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={joinPrompt}>
                <Text style={styles.btnPrimaryText}>Join</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  cardBody: { fontSize: 15, color: '#4b5563', lineHeight: 22, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#f3f4f6' },
  btnPrimary: { backgroundColor: '#ec4899' },
  btnSecondaryText: { color: '#374151', fontWeight: '700', fontSize: 15 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
