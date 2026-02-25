import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { auth } from '@/lib/firebase';
import { savePushTokenToFirestore } from '@/lib/pushNotifications';
import * as Notifications from 'expo-notifications';
import { onAuthStateChanged } from 'firebase/auth';
import { getConversations, getUnreadNotificationCount, subscribeToUnreadNotificationCount } from '@/app/functions';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    loadUnreadCounts();
    const interval = setInterval(loadUnreadCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) savePushTokenToFirestore();
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const d = response.notification.request.content.data as { type?: string };
      if (d?.type === 'match_accepted') {
        router.replace('/(tabs)/matches' as any);
      }
    });
    return () => sub.remove();
  }, []);

  // Keep app icon badge in sync with unread notification count
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = subscribeToUnreadNotificationCount((count) => {
      setUnreadNotificationCount(count);
      Notifications.setBadgeCountAsync(count).catch(() => {});
    });
    return () => unsub();
  }, []);

  // (Games removed) No game-invite listeners

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
        animation: 'shift',
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
          title: 'Matches',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={24} name="heart.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
