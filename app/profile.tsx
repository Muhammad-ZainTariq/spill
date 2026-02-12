import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  downvotePost,
  followUser,
  formatTimeAgo,
  getUserProfile,
  handleComment,
  Post,
  removeVote,
  unfollowUser,
  upvotePost
} from './functions';

interface UserProfile {
  id: string;
  display_name?: string;
  anonymous_username?: string;
  avatar_url?: string;
  followers_count: number;
  following_count: number;
  created_at: string;
  posts: any[];
  isFollowing: boolean;
}

// TwitterVideo component for profile posts
const TwitterVideo = ({ videoUrl, postId }: { videoUrl: string; postId: string }) => {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    player.muted = true;
  });

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        setIsPlaying(status.isPlaying || false);
      }
    });

    return () => subscription?.remove();
  }, [player]);

  const handlePress = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <Pressable style={styles.videoContainer} onPress={handlePress}>
      <VideoView
        style={styles.video}
        player={player}
        fullscreenOptions={{ allowsFullscreen: false } as any}
        allowsPictureInPicture={false}
        contentFit="cover"
        nativeControls={false}
      />
      
      {/* Play/Pause Overlay */}
      {!isPlaying && (
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
};

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiResponses, setAiResponses] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userId) {
      loadProfile();
    }
  }, [userId]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileData = await getUserProfile(userId);
      if (profileData) {
        setProfile(profileData);
        setFollowing(profileData.isFollowing);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!profile) return;

    try {
      const success = following 
        ? await unfollowUser(profile.id)
        : await followUser(profile.id);

      if (success) {
        setFollowing(!following);
        // Update the profile data
        setProfile(prev => prev ? {
          ...prev,
          isFollowing: !following,
          followers_count: following 
            ? prev.followers_count - 1 
            : prev.followers_count + 1
        } : null);
        
        // Add haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  // Voting functions for posts
  const onUpvote = async (postId: string) => {
    if (!profile) return;
    const current = profile.posts.find((p: Post) => p.id === postId);
    if (!current) return;
    if (current.user_vote === 'upvote') {
      const ok = await removeVote(postId);
      if (ok) {
        setProfile((prev: any) => ({
          ...prev,
          posts: prev.posts.map((post: Post) => post.id === postId ? {
            ...post,
            user_vote: null,
            post_stats: { ...post.post_stats, upvotes_count: Math.max(0, (post.post_stats?.upvotes_count || 0) - 1) }
          } : post)
        }));
      }
    } else {
      const ok = await upvotePost(postId);
      if (ok) {
        setProfile((prev: any) => ({
          ...prev,
          posts: prev.posts.map((post: Post) => post.id === postId ? {
            ...post,
            user_vote: 'upvote',
            post_stats: { 
              ...post.post_stats, 
              upvotes_count: (post.post_stats?.upvotes_count || 0) + 1,
              downvotes_count: current.user_vote === 'downvote' ? Math.max(0, (post.post_stats?.downvotes_count || 0) - 1) : (post.post_stats?.downvotes_count || 0)
            }
          } : post)
        }));
      }
    }
  };

  const onDownvote = async (postId: string) => {
    if (!profile) return;
    const current = profile.posts.find((p: Post) => p.id === postId);
    if (!current) return;
    if (current.user_vote === 'downvote') {
      const ok = await removeVote(postId);
      if (ok) {
        setProfile((prev: any) => ({
          ...prev,
          posts: prev.posts.map((post: Post) => post.id === postId ? {
            ...post,
            user_vote: null,
            post_stats: { ...post.post_stats, downvotes_count: Math.max(0, (post.post_stats?.downvotes_count || 0) - 1) }
          } : post)
        }));
      }
    } else {
      const ok = await downvotePost(postId);
      if (ok) {
        setProfile((prev: any) => ({
          ...prev,
          posts: prev.posts.map((post: Post) => post.id === postId ? {
            ...post,
            user_vote: 'downvote',
            post_stats: { 
              ...post.post_stats, 
              downvotes_count: (post.post_stats?.downvotes_count || 0) + 1,
              upvotes_count: current.user_vote === 'upvote' ? Math.max(0, (post.post_stats?.upvotes_count || 0) - 1) : (post.post_stats?.upvotes_count || 0)
            }
          } : post)
        }));
      }
    }
  };

  const onRemoveVote = async (postId: string) => {
    const success = await removeVote(postId);
    if (success) {
      // Reload the profile to get updated vote counts
      loadProfile();
    }
  };

  const renderPost = ({ item }: { item: any }) => (
    <View style={styles.postItem}>
      <Text style={styles.postContent}>{item.content}</Text>
      {item.media_url && (
        <View style={styles.postMediaContainer}>
          {item.media_url.includes('video-data') ? (
            <TwitterVideo videoUrl={item.media_url} postId={item.id} />
          ) : (
            <Image source={{ uri: item.media_url }} style={styles.postMedia} />
          )}
        </View>
      )}
      <View style={styles.postStats}>
        <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
          <Pressable 
            style={styles.voteButton}
            onPress={() => onUpvote(item.id)}
          >
            <Feather name="thumbs-up" size={20} color="#ec4899" style={{ marginRight: 6 }} />
          </Pressable>
          <Text style={styles.voteText}>
            {item.post_stats?.upvotes_count || 0}
          </Text>
          {/* animation removed per request */}
        </View>
        <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
          <Pressable 
            style={styles.voteButton}
            onPress={() => onDownvote(item.id)}
          >
            <Feather name="thumbs-down" size={20} color="#666" style={{ marginRight: 6 }} />
          </Pressable>
          <Text style={styles.voteText}>
            {item.post_stats?.downvotes_count || 0}
          </Text>
          {/* animation removed per request */}
        </View>
        <Pressable 
          style={styles.actionButton}
          onPress={() => handleComment(item.id, router)}
        >
          <Text style={styles.actionText}>
            💬 {item.post_stats?.comments_count || 0}
          </Text>
        </Pressable>
        <Text style={styles.postTime}>
          {formatTimeAgo(item.created_at)}
        </Text>
      </View>

      {/* AI Opinion */}
      <View style={{ marginTop: 8 }}>
        {aiResponses[item.id] ? (
          <View style={{ backgroundColor: '#f6f7f9', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e1e5e9' }}>
            <Text style={{ color: '#111', fontWeight: '700', marginBottom: 6 }}>AI thinks:</Text>
            <Text style={{ color: '#333' }}>{aiResponses[item.id]}</Text>
          </View>
        ) : null}
        <Pressable
          style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#ec4899', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, opacity: aiLoadingId === item.id ? 0.6 : 1 }}
          disabled={aiLoadingId === item.id}
          onPress={async () => {
            try {
              setAiLoadingId(item.id);
              const { getAIOpinion } = await import('./functions');
              const text = await getAIOpinion(item.content);
              setAiResponses(prev => ({ ...prev, [item.id]: text }));
            } finally {
              setAiLoadingId(null);
            }
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{aiLoadingId === item.id ? 'Thinking…' : 'See what AI thinks'}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Profile not found</Text>
        <Text style={styles.errorSubtitle}>This user doesn't exist or has been deleted.</Text>
        <Pressable 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const displayName = profile.display_name || profile.anonymous_username || 'Anonymous';

  return (
    <>
      {/* Header options moved to _layout.tsx to avoid duplication and navigation inconsistencies */}
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.defaultAvatar}>
                <Text style={styles.defaultAvatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.joinDate}>
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </Text>
          
          {/* Follow Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{profile.followers_count}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{profile.following_count}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{(profile.posts && profile.posts.length) ? profile.posts.length : 0}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
          </View>
          
          {/* Follow Button */}
          <Pressable 
            style={[
              styles.followButton,
              following && styles.followingButton
            ]}
            onPress={handleFollow}
          >
            <Text style={[
              styles.followButtonText,
              following && styles.followingButtonText
            ]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>

        {/* Posts Section */}
        <View style={styles.postsSection}>
          <Text style={styles.postsSectionTitle}>Posts</Text>
          {!profile.posts || profile.posts.length === 0 ? (
            <View style={styles.emptyPosts}>
              <Text style={styles.emptyPostsText}>No posts yet</Text>
              <Text style={styles.emptyPostsSubtext}>
                {displayName} hasn't shared anything yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={profile.posts}
              renderItem={renderPost}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </ScrollView>
    </>
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
    color: '#333',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileHeader: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  defaultAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  displayName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  joinDate: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  followButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
  },
  followingButton: {
    backgroundColor: '#e0e0e0',
  },
  followButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  followingButtonText: {
    color: '#333',
  },
  postsSection: {
    backgroundColor: '#fff',
    padding: 16,
  },
  postsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  emptyPosts: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyPostsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyPostsSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  postItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  postContent: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  postMediaContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  postMedia: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  videoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    fontSize: 24,
    color: '#666',
  },
  postStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postStat: {
    fontSize: 14,
    color: '#666',
  },
  postTime: {
    fontSize: 12,
    color: '#999',
  },
  voteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  voteText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  videoContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  playIcon: {
    fontSize: 24,
    color: '#333',
    marginLeft: 4, // Slight offset to center the triangle
  },
});
