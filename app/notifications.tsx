import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNotifications, markNotificationRead } from '../app/functions';
import { auth } from '../lib/firebase';

interface Notification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'new_post' | 'message' | 'group_message' | 'match_accepted' | 'game_invite';
  created_at: string;
  read: boolean;
  profiles: {
    id: string;
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
  match_id?: string;
  from_user_id?: string;
  game_type?: string;
  posts?: {
    id: string;
    content: string;
    media_url?: string;
  };
  comments?: {
    id: string;
    content: string;
  };
  messages?: {
    id: string;
    content: string;
    conversation_id: string;
  };
  group_messages?: {
    id: string;
    content: string;
    group_id: string;
    group_name?: string;
  };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      if (!auth.currentUser) {
        setNotifications([]);
        return;
      }
      const list = await getNotifications();
      setNotifications(list);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getNotificationText = (notification: Notification) => {
    const username = notification.profiles.display_name || notification.profiles.anonymous_username || 'Someone';
    
    switch (notification.type) {
      case 'follow':
        return `${username} started following you`;
      case 'like':
        return `${username} liked your post`;
      case 'comment':
        return `${username} commented on your post`;
      case 'new_post':
        return `${username} posted something new`;
      case 'message':
        return `${username} sent you a message`;
      case 'group_message':
        return `${username} sent a message in ${notification.group_messages?.group_name || 'a group'}`;
      case 'match_accepted':
        return `${username} accepted your match request. Tap to open the chat!`;
      case 'game_invite': {
        const gameLabel = { chess: 'Chess', tictactoe: 'Tic-Tac-Toe', squareoff: 'Square Off!', breakout: 'Breakout', spaceshooter: 'Space Shooter' }[notification.game_type || ''] || notification.game_type || 'a game';
        return `${username} invited you to play ${gameLabel}. Tap to join!`;
      }
      default:
        return 'New notification';
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
    await markNotificationRead(notification.id);

    if (notification.type === 'follow') {
      router.push(`/profile?userId=${notification.profiles.id}` as any);
    } else if (notification.type === 'message' && notification.messages) {
      router.push(`/(tabs)/messages` as any);
    } else if (notification.type === 'group_message' && notification.group_messages) {
      router.push(`/group?groupId=${notification.group_messages.group_id}` as any);
    } else if (notification.posts) {
      router.push(`/comments?postId=${notification.posts.id}` as any);
    } else if (notification.type === 'match_accepted') {
      router.replace('/(tabs)/matches' as any);
    } else if (notification.type === 'game_invite' && notification.match_id && notification.game_type) {
      router.push({ pathname: '/game-webview', params: { room: notification.match_id, gameType: notification.game_type } } as any);
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const username = item.profiles.display_name || item.profiles.anonymous_username || 'Someone';
    
    return (
      <Pressable 
        style={[styles.notificationItem, !item.read && styles.unreadNotification]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={styles.notificationAvatar}>
          {item.profiles.avatar_url ? (
            <Image 
              source={{ uri: item.profiles.avatar_url }} 
              style={styles.avatarImage} 
            />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.defaultAvatarText}>
                {username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.notificationContent}>
          <Text style={styles.notificationText}>
            {getNotificationText(item)}
          </Text>
          
          {item.type === 'comment' && item.comments && (
            <Text style={styles.commentPreview} numberOfLines={2}>
              "{item.comments.content}"
            </Text>
          )}
          
          {item.type === 'like' && item.posts && (
            <Text style={styles.postPreview} numberOfLines={1}>
              "{item.posts.content}"
            </Text>
          )}
          
          {item.type === 'new_post' && item.posts && (
            <Text style={styles.postPreview} numberOfLines={2}>
              "{item.posts.content}"
            </Text>
          )}
          
          {item.type === 'message' && item.messages && (
            <Text style={styles.commentPreview} numberOfLines={2}>
              "{item.messages.content}"
            </Text>
          )}
          
          {item.type === 'group_message' && item.group_messages && (
            <Text style={styles.commentPreview} numberOfLines={2}>
              "{item.group_messages.content}"
            </Text>
          )}
          
          <Text style={styles.notificationTime}>
            {formatTimeAgo(item.created_at)}
          </Text>
        </View>
        
        {!item.read && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>
      
      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>
            You'll see notifications when someone accepts your match request, follows you, or likes your posts
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ec4899"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  unreadNotification: {
    backgroundColor: '#f8f9ff',
  },
  notificationAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  defaultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  commentPreview: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  postPreview: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  unreadDot: {
    position: 'absolute',
    top: 20,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ec4899',
  },
});
