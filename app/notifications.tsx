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
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'new_post' | 'message' | 'group_message';
  created_at: string;
  read: boolean;
  profiles: {
    id: string;
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
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
    setupRealtimeSubscriptions();
    
    return () => {
      // Cleanup subscriptions
      supabase.removeAllChannels();
    };
  }, []);

  const setupRealtimeSubscriptions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Subscribe to new followers
    const followersChannel = supabase
      .channel('followers-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'followers',
          filter: `following_id=eq.${user.id}`
        },
        async (payload) => {
          const newFollower = payload.new as any;
          // Fetch follower profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, anonymous_username, avatar_url')
            .eq('id', newFollower.follower_id)
            .single();

          if (profile) {
            const notification: Notification = {
              id: `follow-${newFollower.created_at}-${Date.now()}`,
              type: 'follow',
              created_at: newFollower.created_at,
              read: false,
              profiles: profile
            };
            setNotifications(prev => [notification, ...prev]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      )
      .subscribe();

    // Subscribe to new likes on user's posts
    const likesChannel = supabase
      .channel('likes-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_votes',
          filter: `vote_type=eq.upvote`
        },
        async (payload) => {
          const newVote = payload.new as any;
          // Check if this is for user's post
          const { data: post } = await supabase
            .from('posts')
            .select('id, user_id, content, media_url')
            .eq('id', newVote.post_id)
            .single();

          if (post && post.user_id === user.id && newVote.user_id !== user.id) {
            // Fetch voter profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, display_name, anonymous_username, avatar_url')
              .eq('id', newVote.user_id)
              .single();

            if (profile) {
              const notification: Notification = {
                id: `like-${newVote.created_at}-${Date.now()}`,
                type: 'like',
                created_at: newVote.created_at,
                read: false,
                profiles: profile,
                posts: {
                  id: post.id,
                  content: post.content,
                  media_url: post.media_url
                }
              };
              setNotifications(prev => [notification, ...prev]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to new comments on user's posts
    const commentsChannel = supabase
      .channel('comments-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments'
        },
        async (payload) => {
          const newComment = payload.new as any;
          // Check if this is on user's post
          const { data: post } = await supabase
            .from('posts')
            .select('id, user_id, content, media_url')
            .eq('id', newComment.post_id)
            .single();

          if (post && post.user_id === user.id && newComment.user_id !== user.id) {
            // Fetch commenter profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, display_name, anonymous_username, avatar_url')
              .eq('id', newComment.user_id)
              .single();

            if (profile) {
              const notification: Notification = {
                id: `comment-${newComment.id}-${Date.now()}`,
                type: 'comment',
                created_at: newComment.created_at,
                read: false,
                profiles: profile,
                posts: {
                  id: post.id,
                  content: post.content,
                  media_url: post.media_url
                },
                comments: {
                  id: newComment.id,
                  content: newComment.content
                }
              };
              setNotifications(prev => [notification, ...prev]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to new posts from followed users
    const { data: following } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id);

    if (following && following.length > 0) {
      const followingIds = following.map(f => f.following_id);
      
      const postsChannel = supabase
        .channel('new-posts-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'posts'
          },
          async (payload) => {
            const newPost = payload.new as any;
            // Check if this is from a followed user
            if (followingIds.includes(newPost.user_id) && newPost.user_id !== user.id) {
              // Fetch poster profile
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, display_name, anonymous_username, avatar_url')
                .eq('id', newPost.user_id)
                .single();

              if (profile) {
                const notification: Notification = {
                  id: `post-${newPost.id}-${Date.now()}`,
                  type: 'new_post',
                  created_at: newPost.created_at,
                  read: false,
                  profiles: profile,
                  posts: {
                    id: newPost.id,
                    content: newPost.content,
                    media_url: newPost.media_url
                  }
                };
                setNotifications(prev => [notification, ...prev]);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            }
          }
        )
        .subscribe();
    }

    // Subscribe to new messages (when not in chat)
    const messagesChannel = supabase
      .channel('messages-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload) => {
          const newMessage = payload.new as any;
          // Check if message is for current user
          const { data: conversation } = await supabase
            .from('conversations')
            .select('participant1_id, participant2_id')
            .eq('id', newMessage.conversation_id)
            .single();

          if (conversation && (conversation.participant1_id === user.id || conversation.participant2_id === user.id) && newMessage.sender_id !== user.id) {
            // Fetch sender profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, display_name, anonymous_username, avatar_url')
              .eq('id', newMessage.sender_id)
              .single();

            if (profile) {
              const notification: Notification = {
                id: `message-${newMessage.id}-${Date.now()}`,
                type: 'message',
                created_at: newMessage.created_at,
                read: false,
                profiles: profile,
                messages: {
                  id: newMessage.id,
                  content: newMessage.content,
                  conversation_id: newMessage.conversation_id
                }
              };
              setNotifications(prev => [notification, ...prev]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to new group messages
    const groupMessagesChannel = supabase
      .channel('group-messages-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages'
        },
        async (payload) => {
          const newMessage = payload.new as any;
          // Check if user is member of the group
          const { data: member } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', newMessage.group_id)
            .eq('user_id', user.id)
            .single();

          if (member && newMessage.user_id !== user.id) {
            // Fetch sender profile and group name
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, display_name, anonymous_username, avatar_url')
              .eq('id', newMessage.user_id)
              .single();

            const { data: group } = await supabase
              .from('groups')
              .select('name')
              .eq('id', newMessage.group_id)
              .single();

            if (profile) {
              const notification: Notification = {
                id: `group-message-${newMessage.id}-${Date.now()}`,
                type: 'group_message',
                created_at: newMessage.created_at,
                read: false,
                profiles: profile,
                group_messages: {
                  id: newMessage.id,
                  content: newMessage.content,
                  group_id: newMessage.group_id,
                  group_name: group?.name
                }
              };
              setNotifications(prev => [notification, ...prev]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      )
      .subscribe();
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get follow notifications
      const { data: followNotifications } = await supabase
        .from('followers')
        .select(`
          created_at,
          profiles!followers_follower_id_fkey (
            id,
            display_name,
            anonymous_username,
            avatar_url
          )
        `)
        .eq('following_id', user.id)
        .order('created_at', { ascending: false });

      // Get like notifications
      const { data: likeNotifications } = await supabase
        .from('post_votes')
        .select(`
          created_at,
          posts!post_votes_post_id_fkey (
            id,
            content,
            media_url
          ),
          profiles!post_votes_user_id_fkey (
            id,
            display_name,
            anonymous_username,
            avatar_url
          )
        `)
        .eq('posts.user_id', user.id)
        .eq('vote_type', 'upvote')
        .order('created_at', { ascending: false });

      // Get comment notifications
      const { data: commentNotifications } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          posts!comments_post_id_fkey (
            id,
            content,
            media_url
          ),
          profiles!comments_user_id_fkey (
            id,
            display_name,
            anonymous_username,
            avatar_url
          )
        `)
        .eq('posts.user_id', user.id)
        .order('created_at', { ascending: false });

      // Get new posts from followed users
      const { data: following } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', user.id);

      let newPostNotifications: any[] = [];
      if (following && following.length > 0) {
        const followingIds = following.map(f => f.following_id);
        const { data: newPosts } = await supabase
          .from('posts')
          .select(`
            id,
            content,
            media_url,
            created_at,
            user_id,
            profiles!posts_user_id_fkey (
              id,
              display_name,
              anonymous_username,
              avatar_url
            )
          `)
          .in('user_id', followingIds)
          .neq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        
        newPostNotifications = newPosts || [];
      }

      // Get recent messages (last 24 hours)
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, participant1_id, participant2_id')
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`);

      let messageNotifications: any[] = [];
      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: recentMessages } = await supabase
          .from('messages')
          .select(`
            id,
            content,
            created_at,
            sender_id,
            conversation_id,
            profiles!messages_sender_id_fkey (
              id,
              display_name,
              anonymous_username,
              avatar_url
            )
          `)
          .in('conversation_id', conversationIds)
          .neq('sender_id', user.id)
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false })
          .limit(20);
        
        messageNotifications = recentMessages || [];
      }

      // Format notifications
      const formattedNotifications: Notification[] = [];

      // Add follow notifications
      followNotifications?.forEach(notif => {
        formattedNotifications.push({
          id: `follow-${notif.created_at}`,
          type: 'follow',
          created_at: notif.created_at,
          read: false,
          profiles: notif.profiles
        });
      });

      // Add like notifications
      likeNotifications?.forEach(notif => {
        formattedNotifications.push({
          id: `like-${notif.created_at}`,
          type: 'like',
          created_at: notif.created_at,
          read: false,
          profiles: notif.profiles,
          posts: notif.posts
        });
      });

      // Add comment notifications
      commentNotifications?.forEach(notif => {
        formattedNotifications.push({
          id: `comment-${notif.id}`,
          type: 'comment',
          created_at: notif.created_at,
          read: false,
          profiles: notif.profiles,
          posts: notif.posts,
          comments: {
            id: notif.id,
            content: notif.content
          }
        });
      });

      // Add new post notifications from followed users
      newPostNotifications.forEach(notif => {
        formattedNotifications.push({
          id: `post-${notif.id}`,
          type: 'new_post',
          created_at: notif.created_at,
          read: false,
          profiles: notif.profiles,
          posts: {
            id: notif.id,
            content: notif.content,
            media_url: notif.media_url
          }
        });
      });

      // Add message notifications
      messageNotifications.forEach(notif => {
        formattedNotifications.push({
          id: `message-${notif.id}`,
          type: 'message',
          created_at: notif.created_at,
          read: false,
          profiles: notif.profiles,
          messages: {
            id: notif.id,
            content: notif.content,
            conversation_id: notif.conversation_id
          }
        });
      });

      // Sort by date
      formattedNotifications.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setNotifications(formattedNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
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
      default:
        return 'New notification';
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Mark as read
    setNotifications(prev => 
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
    
    if (notification.type === 'follow') {
      router.push(`/profile?userId=${notification.profiles.id}` as any);
    } else if (notification.type === 'message' && notification.messages) {
      router.push(`/(tabs)/messages` as any);
    } else if (notification.type === 'group_message' && notification.group_messages) {
      router.push(`/group?groupId=${notification.group_messages.group_id}` as any);
    } else if (notification.posts) {
      router.push(`/comments?postId=${notification.posts.id}` as any);
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
            You'll see notifications when someone follows you or likes your posts
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
