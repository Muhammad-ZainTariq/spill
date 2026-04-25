import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getConversations, getUnreadNotificationCount, subscribeToLivePodcastNotifications, subscribeToUnreadNotificationCount } from '@/app/functions';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth } from '@/lib/firebase';
import { notificationsRuntimeSupported, savePushTokenToFirestore, setNotificationBadgeCount, showLocalNotification } from '@/lib/pushNotifications';
import { onAuthStateChanged } from 'firebase/auth';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

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

  // Listen for live podcast notifications in tabs; game invites are handled root-wide by GameInviteProvider.
  useEffect(() => {
    let liveUnsub: (() => void) | undefined;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      liveUnsub?.();
      liveUnsub = undefined;
      if (!user) return;
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
      liveUnsub?.();
      authUnsub();
    };
  }, [router]);

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

  return (
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
  );
}
