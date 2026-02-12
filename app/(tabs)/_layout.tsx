import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    loadUnreadCounts();
    setupRealtimeCounts();

    return () => {
      supabase.removeAllChannels();
    };
  }, []);

  const loadUnreadCounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Count unread messages
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`);

      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', conversationIds)
          .neq('sender_id', user.id)
          .gte('created_at', oneDayAgo);

        setUnreadMessageCount(count || 0);
      }

      // Count unread notifications (simplified - just count recent notifications)
      const { count: notificationCount } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      setUnreadNotificationCount(notificationCount || 0);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const setupRealtimeCounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Subscribe to new messages for count updates
    const messagesChannel = supabase
      .channel('messages-count')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          loadUnreadCounts();
        }
      )
      .subscribe();

    // Subscribe to new followers for notification count
    const followersChannel = supabase
      .channel('followers-count')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'followers',
          filter: `following_id=eq.${user.id}`
        },
        () => {
          loadUnreadCounts();
        }
      )
      .subscribe();
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
