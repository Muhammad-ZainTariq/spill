import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addComment,
  cancelPremium,
  checkPremiumStatus,
  deletePost,
  downvotePost,
  fetchComments,
  fetchPosts,
  fetchUserProfile,
  formatTimeAgo,
  getAIOpinion,
  handleMoreOptions,
  handleScroll,
  Post,
  removeVote,
  upvotePost
} from '../functions';

type SheetComment = {
  id: string;
  content: string;
  created_at: string;
  parent_comment_id?: string | null;
  profiles: { display_name?: string; anonymous_username?: string; avatar_url?: string } | null;
  replies?: SheetComment[];
};

// Animated Hamburger Menu Component
function HamburgerMenu({ isOpen }: { isOpen: boolean }) {
  const topLineRotation = useSharedValue(0);
  const topLineY = useSharedValue(0);
  const middleLineOpacity = useSharedValue(1);
  const bottomLineRotation = useSharedValue(0);
  const bottomLineY = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      // Animate to X
      topLineRotation.value = withSpring(45, { damping: 15, stiffness: 200 });
      topLineY.value = withSpring(8, { damping: 15, stiffness: 200 });
      middleLineOpacity.value = withTiming(0, { duration: 200 });
      bottomLineRotation.value = withSpring(-45, { damping: 15, stiffness: 200 });
      bottomLineY.value = withSpring(-8, { damping: 15, stiffness: 200 });
    } else {
      // Animate back to hamburger
      topLineRotation.value = withSpring(0, { damping: 15, stiffness: 200 });
      topLineY.value = withSpring(0, { damping: 15, stiffness: 200 });
      middleLineOpacity.value = withTiming(1, { duration: 200 });
      bottomLineRotation.value = withSpring(0, { damping: 15, stiffness: 200 });
      bottomLineY.value = withSpring(0, { damping: 15, stiffness: 200 });
    }
  }, [isOpen]);

  const topLineStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${topLineRotation.value}deg` },
      { translateY: topLineY.value }
    ],
  }));

  const middleLineStyle = useAnimatedStyle(() => ({
    opacity: middleLineOpacity.value,
  }));

  const bottomLineStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${bottomLineRotation.value}deg` },
      { translateY: bottomLineY.value }
    ],
  }));

  return (
    <View style={styles.hamburger}>
      <Reanimated.View style={[styles.hamburgerLine, topLineStyle]} />
      <Reanimated.View style={[styles.hamburgerLine, middleLineStyle]} />
      <Reanimated.View style={[styles.hamburgerLine, bottomLineStyle]} />
    </View>
  );
}

// Animated Vote Button Component
function VoteButton({ 
  postId, 
  type, 
  isActive, 
  count, 
  onPress 
}: { 
  postId: string; 
  type: 'upvote' | 'downvote'; 
  isActive: boolean; 
  count: number; 
  onPress: (postId: string) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconName = type === 'upvote' ? 'heart' : 'thumbs-down';
  const activeColor = type === 'upvote' ? '#ec4899' : '#64748b';

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.2, useNativeDriver: true, duration: 80 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 400, friction: 12 }),
    ]).start();
    onPress(postId);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
    >
      <Animated.View style={[styles.actionIconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Feather
          name={iconName}
          size={22}
          color={isActive ? activeColor : '#94a3b8'}
          fill={isActive ? activeColor : 'none'}
          strokeWidth={2.2}
        />
      </Animated.View>
      <Text style={[styles.actionCount, isActive && { color: activeColor }]}>{count}</Text>
    </Pressable>
  );
}

// Twitter-style Video Component
function TwitterVideo({ uri, postId, isVisible }: { uri: string; postId: string; isVisible: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const sub = player.addListener('statusChange', (s) => {
      if (s.status === 'readyToPlay') {
        setDuration((s as any).durationMillis || 0);
      }
    });
    const timeSub = player.addListener('timeUpdate', (t) => {
      setCurrentTime((t as any).currentTimeMillis || 0);
    });
    return () => {
      sub?.remove();
      timeSub?.remove();
    };
  }, [player]);

  useEffect(() => {
    if (isVisible) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
    }
  }, [isVisible, player]);

  const toggleMute = (e: any) => {
    e.stopPropagation();
    player.muted = !player.muted;
    setIsMuted(player.muted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const remainingTime = Math.max(0, duration - currentTime);

  return (
    <Pressable style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        nativeControls={false}
        fullscreenOptions={{ allowsFullscreen: false } as any}
        allowsPictureInPicture={false}
        contentFit="cover"
      />
      <View style={styles.durationContainer}>
        <Text style={styles.durationText}>{formatTime(remainingTime)}</Text>
      </View>
      <Pressable onPress={toggleMute} style={styles.muteButton}>
        <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
      </Pressable>
    </Pressable>
  );
}

// Component to display remaining time for vent posts
function VentTimeRemaining({ expiresAt }: { expiresAt: string }) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const calculateTimeRemaining = () => {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;

    if (diff <= 0) {
      return 'Expired';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  useEffect(() => {
    // Calculate immediately
    setTimeRemaining(calculateTimeRemaining());

    // Update every second for accurate countdown
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining());
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!timeRemaining || timeRemaining === 'Expired') {
    return null;
  }

  return (
    <Text style={styles.expiresText}> • Expires in {timeRemaining}</Text>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [visibleVideoId, setVisibleVideoId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'General' | 'Anxiety Share' | 'Depression Vent'>('All');
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiResponses, setAiResponses] = useState<Record<string, string>>({});
  const [isPremium, setIsPremium] = useState(false);
  const [commentSheetPostId, setCommentSheetPostId] = useState<string | null>(null);
  const [sheetComments, setSheetComments] = useState<SheetComment[]>([]);
  const [sheetCommentsLoading, setSheetCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const menuTranslateX = useSharedValue(-320);
  
  // Animated style for side menu - must be called unconditionally
  const menuAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: menuTranslateX.value }],
    opacity: menuTranslateX.value > -320 ? 1 : 0, // Hide when completely off-screen
  }));

  const loadPosts = async () => {
    const postsData = await fetchPosts(selectedCategory === 'All' ? undefined : selectedCategory);
    setPosts(postsData);
  };

  const loadUserProfile = async () => {
    const profile = await fetchUserProfile();
    setUserProfile(profile);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPosts(), loadUserProfile()]);
    setRefreshing(false);
  };

  const onScroll = (event: any) => {
    handleScroll(event, posts, visibleVideoId, setVisibleVideoId);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadPosts(), loadUserProfile()]);
      const premium = await checkPremiumStatus();
      setIsPremium(premium);
      setLoading(false);
    };
    loadData();
  }, [selectedCategory]);

  useEffect(() => {
    if (menuVisible) {
      menuTranslateX.value = withSpring(0, { damping: 20, stiffness: 90 });
    } else {
      menuTranslateX.value = withSpring(-320, { 
        damping: 20, 
        stiffness: 90,
      }, (finished) => {
        if (finished && !menuVisible) {
          menuTranslateX.value = -320;
        }
      });
    }
  }, [menuVisible]);

  useEffect(() => {
    if (!commentSheetPostId) {
      setSheetComments([]);
      setNewCommentText('');
      return;
    }
    let cancelled = false;
    (async () => {
      setSheetCommentsLoading(true);
      try {
        const list = await fetchComments(commentSheetPostId);
        if (!cancelled) setSheetComments(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setSheetComments([]);
      } finally {
        if (!cancelled) setSheetCommentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [commentSheetPostId]);

  const handleAddCommentSheet = async () => {
    if (!commentSheetPostId || !newCommentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const comment = await addComment(commentSheetPostId, newCommentText.trim());
      const newC: SheetComment = {
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
        parent_comment_id: comment.parent_comment_id ?? null,
        profiles: comment.profiles ?? null,
        replies: [],
      };
      setSheetComments(prev => [newC, ...prev]);
      setNewCommentText('');
      setPosts(prev => prev.map(p => p.id === commentSheetPostId ? {
        ...p,
        post_stats: {
          ...p.post_stats,
          comments_count: (p.post_stats?.comments_count || 0) + 1,
          upvotes_count: p.post_stats?.upvotes_count ?? 0,
          downvotes_count: p.post_stats?.downvotes_count ?? 0,
          views_count: p.post_stats?.views_count ?? 0,
        }
      } as Post : p));
    } catch (e) {
      Alert.alert('Error', 'Could not add comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const onUpvote = async (postId: string) => {
    try {
      const current = posts.find(p => p.id === postId);
      if (!current) return;
      if (current.user_vote === 'upvote') {
        const success = await removeVote(postId);
        if (success) {
          setPosts(prev => prev.map(post => post.id === postId ? {
            ...post,
            user_vote: null,
            post_stats: {
              ...post.post_stats,
              upvotes_count: Math.max(0, (post.post_stats?.upvotes_count || 0) - 1),
              downvotes_count: post.post_stats?.downvotes_count || 0,
              views_count: post.post_stats?.views_count || 0,
              comments_count: post.post_stats?.comments_count || 0,
            }
          } as Post : post));
        }
      } else {
        const success = await upvotePost(postId);
        if (success) {
          setPosts(prev => prev.map(post => post.id === postId ? {
            ...post,
            user_vote: 'upvote',
            post_stats: {
              ...post.post_stats,
              upvotes_count: (post.post_stats?.upvotes_count || 0) + 1,
              downvotes_count: current.user_vote === 'downvote' ? Math.max(0, (post.post_stats?.downvotes_count || 0) - 1) : (post.post_stats?.downvotes_count || 0),
              views_count: post.post_stats?.views_count || 0,
              comments_count: post.post_stats?.comments_count || 0,
            }
          } as Post : post));
        }
      }
    } catch (error) {
      console.error('Error upvoting:', error);
    }
  };

  const onDownvote = async (postId: string) => {
    try {
      const current = posts.find(p => p.id === postId);
      if (!current) return;
      if (current.user_vote === 'downvote') {
        const success = await removeVote(postId);
        if (success) {
          setPosts(prev => prev.map(post => post.id === postId ? {
            ...post,
            user_vote: null,
            post_stats: {
              ...post.post_stats,
              downvotes_count: Math.max(0, (post.post_stats?.downvotes_count || 0) - 1),
              upvotes_count: post.post_stats?.upvotes_count || 0,
              views_count: post.post_stats?.views_count || 0,
              comments_count: post.post_stats?.comments_count || 0,
            }
          } as Post : post));
        }
      } else {
        const success = await downvotePost(postId);
        if (success) {
          setPosts(prev => prev.map(post => post.id === postId ? {
            ...post,
            user_vote: 'downvote',
            post_stats: {
              ...post.post_stats,
              downvotes_count: (post.post_stats?.downvotes_count || 0) + 1,
              upvotes_count: current.user_vote === 'upvote' ? Math.max(0, (post.post_stats?.upvotes_count || 0) - 1) : (post.post_stats?.upvotes_count || 0),
              views_count: post.post_stats?.views_count || 0,
              comments_count: post.post_stats?.comments_count || 0,
            }
          } as Post : post));
        }
      }
    } catch (error) {
      console.error('Error downvoting:', error);
    }
  };

  const onDeletePost = async (postId: string) => {
    const success = await deletePost(postId);
    if (success) {
      loadPosts();
    }
  };

  const onProfilePress = (userId: string) => {
    router.push(`/profile?userId=${userId}` as any);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading posts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          style={styles.menuButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuVisible(!menuVisible);
          }}
        >
          <HamburgerMenu isOpen={menuVisible} />
        </Pressable>

        <Text style={styles.headerTitle}>Spill</Text>

        <Pressable
          style={styles.notificationsButton}
          onPress={() => router.push('/notifications' as any)}
        >
          <Feather name="bell" size={22} color="#333" />
        </Pressable>
      </View>

      {/* Side Menu (Twitter-style) */}
      {menuVisible && (
        <>
          {/* Backdrop */}
          <Pressable 
            style={styles.menuBackdrop}
            onPress={() => setMenuVisible(false)}
          />
          {/* Side Menu Panel */}
          <Reanimated.View 
            style={[
              styles.sideMenu,
              menuAnimatedStyle,
            ]}
          >
            <View style={[styles.sideMenuContent, { paddingTop: insets.top + 20 }]}>
              {/* Close Button */}
              <Pressable
                style={styles.closeButton}
                onPress={() => setMenuVisible(false)}
              >
                <Feather name="x" size={24} color="#333" />
              </Pressable>

              {/* Menu Items */}
              <View style={styles.sideMenuItems}>
                {!isPremium && (
                  <Pressable
                    style={styles.sideMenuItem}
                    onPress={() => {
                      setMenuVisible(false);
                      router.push('/premium' as any);
                    }}
                  >
                    <Feather name="star" size={20} color="#ec4899" />
                    <Text style={styles.sideMenuItemText}>Go Premium</Text>
                    <Feather name="chevron-right" size={20} color="#9ca3af" />
                  </Pressable>
                )}
                {isPremium && (
                  <Pressable
                    style={styles.sideMenuItem}
                    onPress={() => {
                      setMenuVisible(false);
                      Alert.alert(
                        'Premium Membership',
                        'You are currently a premium member. Would you like to cancel your membership?',
                        [
                          { text: 'Keep Premium', style: 'cancel' },
                          {
                            text: 'Cancel Membership',
                            style: 'destructive',
                            onPress: () => {
                              Alert.alert(
                                'Cancel Membership',
                                'Are you sure you want to cancel? You will lose access to premium features.',
                                [
                                  { text: 'Keep It', style: 'cancel' },
                                  {
                                    text: 'Cancel',
                                    style: 'destructive',
                                    onPress: async () => {
                                      const success = await cancelPremium();
                                      if (success) {
                                        Alert.alert(
                                          'Membership Cancelled',
                                          'Your premium membership has been cancelled. You can reactivate anytime.',
                                          [{ text: 'OK' }]
                                        );
                                        // Refresh premium status
                                        const premium = await checkPremiumStatus();
                                        setIsPremium(premium);
                                      } else {
                                        Alert.alert('Error', 'Failed to cancel membership. Please try again.');
                                      }
                                    },
                                  },
                                ]
                              );
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Feather name="check-circle" size={20} color="#10b981" />
                    <Text style={styles.sideMenuItemText}>Premium Member</Text>
                    <Feather name="chevron-right" size={20} color="#9ca3af" />
                  </Pressable>
                )}
                <Pressable
                  style={styles.sideMenuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push('/settings' as any);
                  }}
                >
                  <Feather name="settings" size={20} color="#666" />
                  <Text style={styles.sideMenuItemText}>Settings</Text>
                  <Feather name="chevron-right" size={20} color="#9ca3af" />
                </Pressable>
                {userProfile?.is_admin && (
                  <Pressable
                    style={styles.sideMenuItem}
                    onPress={() => {
                      setMenuVisible(false);
                      router.push('/admin' as any);
                    }}
                  >
                    <Feather name="shield" size={20} color="#ec4899" />
                    <Text style={[styles.sideMenuItemText, { color: '#ec4899', fontWeight: '700' }]}>Admin</Text>
                    <Feather name="chevron-right" size={20} color="#9ca3af" />
                  </Pressable>
                )}
              </View>
            </View>
          </Reanimated.View>
        </>
      )}

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <View style={styles.categoryRow}>
          {(['All', 'General', 'Anxiety Share', 'Depression Vent'] as const).map((c) => (
            <Pressable
              key={c}
              onPress={() => setSelectedCategory(c)}
              style={[styles.catChip, selectedCategory === c && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, selectedCategory === c && styles.catChipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Posts Feed */}
      <ScrollView
        style={styles.feedContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            titleColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
            title=""
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to share something!</Text>
            <Pressable
              style={styles.createPostButton}
              onPress={() => router.push('/createpost' as any)}
            >
              <Text style={styles.createPostButtonText}>Create Post</Text>
            </Pressable>
          </View>
        ) : (
          posts.map((post) => (
            <View key={post.id} style={styles.postCard}>
              {/* Post Header */}
              <View style={styles.postHeader}>
                <View style={styles.userInfo}>
                  <Pressable
                    style={styles.avatarContainer}
                    onPress={() => onProfilePress(post.user_id)}
                  >
                    {post.profiles?.avatar_url ? (
                      <Image
                        source={{ uri: post.profiles.avatar_url }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.defaultAvatar}>
                        <Text style={styles.defaultAvatarText}>
                          {post.profiles?.display_name?.[0] || post.profiles?.anonymous_username?.[0] || '?'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.userDetails}
                    onPress={() => onProfilePress(post.user_id)}
                  >
                    <View style={styles.usernameRow}>
                      <Text style={styles.username}>
                        {post.profiles?.display_name || post.profiles?.anonymous_username || 'Anonymous'}
                      </Text>
                      {post.is_vent && (
                        <View style={styles.ventBadge}>
                          <Text style={styles.ventBadgeText}>🔥 VENT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.postTime}>
                      {formatTimeAgo(post.created_at)}
                      {post.is_vent && post.expires_at && (
                        <VentTimeRemaining expiresAt={post.expires_at} />
                      )}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.headerRightRow}>
                  <Pressable
                    style={[styles.aiPill, aiLoadingId === post.id && styles.aiPillLoading]}
                    disabled={aiLoadingId === post.id}
                    onPress={async () => {
                      if (aiResponses[post.id]) return;
                      try {
                        setAiLoadingId(post.id);
                        const response = await getAIOpinion(post.content);
                        setAiResponses(prev => ({ ...prev, [post.id]: response }));
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch (error) {
                        console.error('Error getting AI opinion', error);
                      } finally {
                        setAiLoadingId(null);
                      }
                    }}
                  >
                    {aiLoadingId === post.id ? (
                      <ActivityIndicator size="small" color="#ec4899" style={{ marginRight: 4 }} />
                    ) : null}
                    <Text style={styles.aiPillText}>AI</Text>
                  </Pressable>
                  <Pressable
                    style={styles.moreButton}
                    onPress={() => handleMoreOptions(post.id, post.user_id)}
                  >
                    <Text style={styles.moreIcon}>⋯</Text>
                  </Pressable>
                </View>
              </View>

              {/* Post Content */}
              <View style={styles.postContent}>
                <Text style={styles.postText}>{post.content}</Text>
                {post.media_url && (
                  <View style={styles.mediaContainer}>
                    {post.media_url.includes('video-data') ? (
                      <TwitterVideo uri={post.media_url} postId={post.id} isVisible={visibleVideoId === post.id} />
                    ) : (
                      <Image
                        source={{ uri: post.media_url }}
                        style={styles.postMedia}
                        contentFit="cover"
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Post actions: minimal, fast */}
              <View style={styles.postActions}>
                <VoteButton
                  postId={post.id}
                  type="upvote"
                  isActive={post.user_vote === 'upvote'}
                  count={post.post_stats?.upvotes_count || 0}
                  onPress={onUpvote}
                />
                <VoteButton
                  postId={post.id}
                  type="downvote"
                  isActive={post.user_vote === 'downvote'}
                  count={post.post_stats?.downvotes_count || 0}
                  onPress={onDownvote}
                />
                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCommentSheetPostId(post.id);
                  }}
                >
                  <Feather name="message-circle" size={22} color="#94a3b8" strokeWidth={2.2} />
                  <Text style={styles.actionCount}>{post.post_stats?.comments_count || 0}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/message' as any);
                  }}
                >
                  <Feather name="send" size={22} color="#94a3b8" strokeWidth={2.2} />
                </Pressable>
              </View>

              {/* AI response in-place (no big button) */}
              {aiLoadingId === post.id ? (
                <View style={styles.aiThinkingBar}>
                  <ActivityIndicator size="small" color="#ec4899" />
                  <Text style={styles.aiThinkingText}>Thinking...</Text>
                </View>
              ) : null}
              {aiResponses[post.id] ? (
                <View style={styles.aiResponseBox}>
                  <Text style={styles.aiResponseLabel}>AI thinks:</Text>
                  <Text style={styles.aiResponseText}>{aiResponses[post.id]}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Comments bottom sheet */}
      <Modal
        visible={commentSheetPostId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentSheetPostId(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setCommentSheetPostId(null)}>
          <Pressable style={[styles.sheet, { maxHeight: '85%', paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Comments</Text>
              <Pressable onPress={() => setCommentSheetPostId(null)} hitSlop={12} style={styles.sheetClose}>
                <Feather name="x" size={24} color="#64748b" />
              </Pressable>
            </View>
            {sheetCommentsLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.sheetLoadingText}>Loading comments...</Text>
              </View>
            ) : (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.sheetKeyboard}
                keyboardVerticalOffset={0}
              >
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {sheetComments.length === 0 && !sheetCommentsLoading && (
                    <Text style={styles.sheetEmpty}>No comments yet. Be the first!</Text>
                  )}
                  {sheetComments.map((c) => (
                    <View key={c.id} style={styles.sheetCommentRow}>
                      <View style={styles.sheetCommentAvatar}>
                        <Text style={styles.sheetCommentAvatarText}>
                          {(c.profiles?.display_name || c.profiles?.anonymous_username || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.sheetCommentBody}>
                        <Text style={styles.sheetCommentAuthor}>
                          {c.profiles?.display_name || c.profiles?.anonymous_username || 'Anonymous'}
                        </Text>
                        <Text style={styles.sheetCommentText}>{c.content}</Text>
                        <Text style={styles.sheetCommentTime}>{formatTimeAgo(c.created_at)}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.sheetInputRow}>
                  <TextInput
                    style={styles.sheetInput}
                    placeholder="Add a comment..."
                    placeholderTextColor="#94a3b8"
                    value={newCommentText}
                    onChangeText={setNewCommentText}
                    multiline
                    maxLength={500}
                    editable={!submittingComment}
                  />
                  <Pressable
                    style={[styles.sheetSendBtn, (!newCommentText.trim() || submittingComment) && styles.sheetSendBtnDisabled]}
                    onPress={handleAddCommentSheet}
                    disabled={!newCommentText.trim() || submittingComment}
                  >
                    {submittingComment ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="send" size={20} color="#fff" strokeWidth={2} />
                    )}
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating Action Button */}
      <Pressable
        style={[styles.fab, { bottom: 60 + insets.bottom + 24 }]}
        onPress={() => router.push('/createpost' as any)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
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
    color: '#333',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
    zIndex: 1000,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ec4899',
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  menuButton: {
    padding: 8,
    zIndex: 1001,
  },
  hamburger: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 24,
    height: 2.5,
    backgroundColor: '#333',
    borderRadius: 1.25,
  },
  notificationsButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
  },
  categoryRow: {
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: '#ec4899',
  },
  catChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  catChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 998,
  },
  sideMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#fff',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  sideMenuContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 20,
  },
  sideMenuItems: {
    gap: 4,
  },
  sideMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
  },
  sideMenuItemText: {
    flex: 1,
    fontSize: 17,
    color: '#333',
    fontWeight: '500',
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  premiumMenuItem: {
    backgroundColor: '#fdf2f8',
  },
  premiumMenuItemText: {
    fontSize: 16,
    color: '#ec4899',
    fontWeight: '700',
  },
  premiumBadgeText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginLeft: 12,
  },
  feedContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createPostButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createPostButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  postCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  ventBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  ventBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400e',
  },
  postTime: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  expiresText: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  aiPillLoading: {
    opacity: 0.8,
  },
  aiPillText: {
    color: '#ec4899',
    fontSize: 12,
    fontWeight: '700',
  },
  moreButton: {
    padding: 8,
  },
  moreIcon: {
    color: '#666',
    fontSize: 18,
  },
  postContent: {
    marginBottom: 16,
  },
  postText: {
    color: '#333',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  mediaContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  reviewCover: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reviewCoverTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
  },
  reviewCoverSub: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  approvedSafeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#fef3c7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  approvedSafeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },
  videoContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  muteButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  muteIcon: {
    fontSize: 14,
    color: 'white',
  },
  durationContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 32,
    alignItems: 'center',
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  postMedia: {
    width: '100%',
    height: 300,
    borderRadius: 8,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  actionItemPressed: {
    opacity: 0.5,
  },
  actionIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 18,
  },
  aiThinkingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#faf5f7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fce7ef',
  },
  aiThinkingText: {
    color: '#be185d',
    fontSize: 13,
    fontWeight: '600',
  },
  aiResponseBox: {
    backgroundColor: '#f6f7f9',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  aiResponseLabel: {
    color: '#111',
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 14,
  },
  aiResponseText: {
    color: '#333',
    fontSize: 14,
    lineHeight: 20,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    minHeight: 280,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  sheetClose: {
    padding: 4,
  },
  sheetLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  sheetLoadingText: {
    fontSize: 15,
    color: '#64748b',
  },
  sheetKeyboard: {
    flex: 1,
  },
  sheetScroll: {
    flexGrow: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetEmpty: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 32,
  },
  sheetCommentRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  sheetCommentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCommentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ec4899',
  },
  sheetCommentBody: {
    flex: 1,
  },
  sheetCommentAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  sheetCommentText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 4,
  },
  sheetCommentTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  sheetInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  sheetInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sheetSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSendBtnDisabled: {
    opacity: 0.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
});
