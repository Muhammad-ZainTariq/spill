import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getConversations, getUnreadNotificationCount, markNotificationRead, setGameInviteAccepted, setGameInviteDeclined, subscribeToGameInvites, subscribeToLivePodcastNotifications, subscribeToUnreadNotificationCount } from '@/app/functions';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth } from '@/lib/firebase';
import { addNotificationResponseListener, dismissAllAppNotifications, notificationsRuntimeSupported, savePushTokenToFirestore, setNotificationBadgeCount, showLocalNotification } from '@/lib/pushNotifications';
import { onAuthStateChanged } from 'firebase/auth';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const gameInviteActionedRef = useRef<Set<string>>(new Set());
 
  const gameInviteModalOpenIdRef = useRef<string | null>(null);
  const [gameInvitePrompt, setGameInvitePrompt] = useState<{
    id: string;
    invite_id: string;
    match_id: string;
    game_type: string;
  } | null>(null);
  const livePodcastsShownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadUnreadCounts();
    const interval = setInterval(loadUnreadCounts, 30000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) savePushTokenToFirestore();
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      sub = await addNotificationResponseListener((response) => {
        const d = response.notification.request.content.data as { type?: string; match_id?: string; game_type?: string; invite_id?: string; group_id?: string; room_id?: string };
        if (d?.type === 'game_invite' && d?.match_id) {
          const gameType = (d?.game_type || 'tictactoe').toLowerCase();
          void (async () => {
            await dismissAllAppNotifications();
            const accepted = await setGameInviteAccepted(String(d.match_id), d.invite_id ? String(d.invite_id) : undefined);
            if (!accepted) {
              Alert.alert('Invite ended', 'This game invite is no longer active.');
              return;
            }
            router.push({
              pathname: '/game-webview',
              params: { room: String(d.match_id), gameType, inviteId: d.invite_id ? String(d.invite_id) : undefined },
            } as any);
          })();
        } else if (d?.type === 'group_streak' && d?.group_id) {
          router.push(`/group?groupId=${d.group_id}` as any);
        } else if (d?.type === 'match_accepted') {
          router.replace('/(tabs)/matches' as any);
        } else if (
          (d?.type === 'live_podcast_started' || d?.type === 'live_podcast_soon') &&
          d?.room_id
        ) {
          router.push(`/live/${d.room_id}` as any);
        }
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

  // Keep app icon badge in sync with unread notification count (tear down on logout so snapshot never fires permission errors)
  useEffect(() => {
    let firestoreUnsub: (() => void) | undefined;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      firestoreUnsub?.();
      firestoreUnsub = undefined;
      if (!user) {
        setUnreadNotificationCount(0);
        setNotificationBadgeCount(0);
        return;
      }
      firestoreUnsub = subscribeToUnreadNotificationCount((count) => {
        setUnreadNotificationCount(count);
        setNotificationBadgeCount(count);
      });
    });
    return () => {
      authUnsub();
      firestoreUnsub?.();
    };
  }, []);

  // Listen for game invites app-wide (any tab) — only subscribe once auth is ready
  useEffect(() => {
    let inviteUnsub: (() => void) | undefined;
    let liveUnsub: (() => void) | undefined;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      inviteUnsub?.();
      liveUnsub?.();
      inviteUnsub = undefined;
      liveUnsub = undefined;
      if (!user) {
        gameInviteActionedRef.current.clear();
        gameInviteModalOpenIdRef.current = null;
        setGameInvitePrompt(null);
        return;
      }
      inviteUnsub = subscribeToGameInvites((invites) => {
        const unread = invites.filter((i) => !i.read);
        if (gameInviteModalOpenIdRef.current !== null) {
          const stillActive = unread.some((i) => i.id === gameInviteModalOpenIdRef.current);
          if (!stillActive) {
            gameInviteModalOpenIdRef.current = null;
            setGameInvitePrompt(null);
          }
          return;
        }
        unread.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const next = unread.find((i) => !gameInviteActionedRef.current.has(i.id));
        if (!next) return;
        gameInviteModalOpenIdRef.current = next.id;
        setGameInvitePrompt({
          id: next.id,
          invite_id: next.invite_id,
          match_id: next.match_id,
          game_type: (next.game_type || 'tictactoe').toLowerCase(),
        });
      });
      liveUnsub = subscribeToLivePodcastNotifications((items) => {
        const unread = items.filter((item) => !item.read);
        const latest = unread[0];
        if (!latest || livePodcastsShownRef.current.has(latest.id)) return;
        livePodcastsShownRef.current.add(latest.id);
        const isSoon = latest.type === 'live_podcast_soon';
        const title = isSoon
          ? `Starting soon · ${latest.host_name || 'Therapist'}`
          : `${latest.host_name || 'Therapist'} is live now`;
        const body = latest.body || (isSoon ? 'A live podcast is starting soon. Tap to open the room.' : 'A live podcast has started. Tap to join.');
        showLocalNotification(title, body, {
          type: latest.type,
          room_id: latest.room_id,
        }).then((shown) => {
          if (shown || notificationsRuntimeSupported()) return;
          Alert.alert(title, body, [
            { text: 'Later' },
            { text: 'Open room', onPress: () => router.push(`/live/${latest.room_id}` as any) },
          ]);
        });
      });
    });
    return () => {
      inviteUnsub?.();
      liveUnsub?.();
      authUnsub();
    };
  }, [router]);

  const handleGameInviteLater = () => {
    const payload = gameInvitePrompt;
    if (!payload) return;
    setGameInvitePrompt(null);
    gameInviteModalOpenIdRef.current = null;
    gameInviteActionedRef.current.add(payload.id);
    void (async () => {
      await markNotificationRead(payload.id);
      await dismissAllAppNotifications();
      await setGameInviteDeclined(payload.match_id, payload.invite_id);
    })();
  };

  const handleGameInviteJoin = () => {
    const payload = gameInvitePrompt;
    if (!payload) return;
    const gt = payload.game_type;
    setGameInvitePrompt(null);
    gameInviteModalOpenIdRef.current = null;
    gameInviteActionedRef.current.add(payload.id);
    void (async () => {
      await markNotificationRead(payload.id);
      await dismissAllAppNotifications();
      const accepted = await setGameInviteAccepted(payload.match_id, payload.invite_id);
      if (!accepted) {
        Alert.alert('Invite ended', 'This game invite is no longer active.');
        return;
      }
      setTimeout(() => {
        router.push({
          pathname: '/game-webview',
          params: { room: String(payload.match_id), gameType: gt, inviteId: payload.invite_id },
        } as any);
      }, 50);
    })();
  };

  const loadUnreadCounts = async () => {
    try {
      if (!auth.currentUser) return;
      const [convs, notifCount] = await Promise.all([getConversations(), getUnreadNotificationCount()]);
      setUnreadMessageCount(convs.length);
      setUnreadNotificationCount(notifCount);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const inviteGameLabel = gameInvitePrompt
    ? { tictactoe: 'Tic-Tac-Toe', chess: 'Chess' }[gameInvitePrompt.game_type] || gameInvitePrompt.game_type
    : '';

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#ec4899',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60 + Math.max(insets.bottom, 0),
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e1e5e9',
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 0),
          paddingHorizontal: 0,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: -1,
          },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 3,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
        },
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={24} name="house.fill" color={color} />,
          tabBarBadge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ef4444',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Mood',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={24} name="heart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'Connections',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={24} name="bubble.left.and.bubble.right.fill" color={color} />,
          tabBarBadge: unreadMessageCount > 0 ? unreadMessageCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ef4444',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={24} name="heart.circle.fill" color={color} />,
        }}
      />
    </Tabs>
    <Modal
      visible={!!gameInvitePrompt}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleGameInviteLater}
    >
      <View style={inviteStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleGameInviteLater} accessibilityRole="button" accessibilityLabel="Dismiss" />
        <View style={inviteStyles.card}>
          <Text style={inviteStyles.cardTitle}>Game invite</Text>
          <Text style={inviteStyles.cardBody}>
            {inviteGameLabel ? `Your friend invited you to play ${inviteGameLabel}.` : 'Your friend invited you to play.'}
          </Text>
          <View style={inviteStyles.row}>
            <Pressable style={[inviteStyles.btn, inviteStyles.btnSecondary]} onPress={handleGameInviteLater}>
              <Text style={inviteStyles.btnSecondaryText}>Decline</Text>
            </Pressable>
            <Pressable style={[inviteStyles.btn, inviteStyles.btnPrimary]} onPress={handleGameInviteJoin}>
              <Text style={inviteStyles.btnPrimaryText}>Join</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const inviteStyles = StyleSheet.create({
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
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  cardBody: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 10, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12, marginTop: 22 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#ec4899' },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnSecondary: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  btnSecondaryText: { fontSize: 16, fontWeight: '600', color: '#334155' },
});
