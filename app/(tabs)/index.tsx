import { extractYoutubeId, youtubeThumbnailUrl } from '@/app/therapist/_marketplace';
import { useLivePodcast } from '@/components/live/LivePodcastProvider';
import { SpeakingWave } from '@/components/live/SpeakingWave';
import { LivePodcastRoom, subscribeLivePodcastRooms } from '@/lib/livePodcasts';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addComment, addReply, cancelPremium, checkPremiumStatus, deletePost, downvotePost, fetchComments, fetchPosts, fetchUserProfile, formatTimeAgo, getActiveMatch, getAIOpinion, getConversations, getPartnerProfile, handleMoreOptions, handleScroll, Post, removeVote, sendMatchMessage, sendMessage, subscribeToPosts, upvotePost } from '../functions';

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
  const iconName = type === 'upvote' ? 'heart' : 'frown';
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
          size={16}
          color={isActive ? activeColor : '#94a3b8'}
          fill={isActive ? activeColor : 'none'}
          strokeWidth={1.8}
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
  const { presentRoom } = useLivePodcast();
  const feedScrollRef = useRef<ScrollView>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [liveRooms, setLiveRooms] = useState<LivePodcastRoom[]>([]);
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
  const [showStopTouching, setShowStopTouching] = useState(false);
  const logoScale = useSharedValue(1);
  const [sheetComments, setSheetComments] = useState<SheetComment[]>([]);
  const [sheetCommentsLoading, setSheetCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingToSheetComment, setReplyingToSheetComment] = useState<SheetComment | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showLivePeek, setShowLivePeek] = useState(false);
  const [dismissedLiveRoomId, setDismissedLiveRoomId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [shareConversations, setShareConversations] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSendingId, setShareSendingId] = useState<string | null>(null);
  const menuTranslateX = useSharedValue(-320);
  
  // Animated style for side menu - must be called unconditionally
  const menuAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: menuTranslateX.value }],
    opacity: menuTranslateX.value > -320 ? 1 : 0, // Hide when completely off-screen
  }));

  // Animated style for header logo - must be called unconditionally (before any early return)
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
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
    const offsetY = Number(event?.nativeEvent?.contentOffset?.y || 0);
    const shouldShowLivePeek =
      liveRooms.length > 0 && liveRooms[0]?.id !== dismissedLiveRoomId && offsetY > 84;
    setShowLivePeek((prev) => (prev === shouldShowLivePeek ? prev : shouldShowLivePeek));
  };

  // Real-time feed: updates when posts are flagged or approved without refresh
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToPosts(
      (postsData) => {
        setPosts(postsData);
        setLoading(false);
      },
      selectedCategory === 'All' ? undefined : selectedCategory
    );
    loadUserProfile().then(setUserProfile);
    checkPremiumStatus().then(setIsPremium);
    return () => unsub();
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
      setReplyingToSheetComment(null);
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

  useEffect(() => {
    const unsub = subscribeLivePodcastRooms((rooms) => {
      setLiveRooms(rooms.filter((room) => room.status === 'live').slice(0, 3));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (liveRooms.length === 0) {
      setShowLivePeek(false);
    }
  }, [liveRooms.length]);

  useEffect(() => {
    if (!dismissedLiveRoomId) return;
    const stillDismissed = liveRooms.some((room) => room.id === dismissedLiveRoomId);
    if (!stillDismissed) {
      setDismissedLiveRoomId(null);
    }
  }, [dismissedLiveRoomId, liveRooms]);

  const handleAddCommentSheet = async () => {
    if (!commentSheetPostId || !newCommentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const parentId = replyingToSheetComment?.id;
      const comment = parentId
        ? await addReply(commentSheetPostId, parentId, newCommentText.trim())
        : await addComment(commentSheetPostId, newCommentText.trim());
      const newC: SheetComment = {
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
        parent_comment_id: comment.parent_comment_id ?? null,
        profiles: comment.profiles ?? null,
        replies: [],
      };
      setSheetComments(prev => parentId
        ? prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies || []), newC] } : c)
        : [...prev, newC]
      );
      setNewCommentText('');
      setReplyingToSheetComment(null);
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

  const renderSheetComment = (comment: SheetComment, isReply = false) => {
    const displayName = comment.profiles?.display_name || comment.profiles?.anonymous_username || 'Anonymous';
    return (
      <View key={comment.id} style={[styles.sheetCommentRow, isReply && styles.sheetReplyRow]}>
        {!isReply ? (
          <View style={styles.sheetThreadLine} />
        ) : null}
        <View style={[styles.sheetCommentAvatar, isReply && styles.sheetReplyAvatar]}>
          <Text style={[styles.sheetCommentAvatarText, isReply && styles.sheetReplyAvatarText]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.sheetCommentBody}>
          <View style={[styles.sheetCommentBubble, isReply && styles.sheetReplyBubble]}>
            <Text style={styles.sheetCommentAuthor}>{displayName}</Text>
            <Text style={styles.sheetCommentText}>{comment.content}</Text>
          </View>
          <View style={styles.sheetCommentMetaRow}>
            <Text style={styles.sheetCommentTime}>{formatTimeAgo(comment.created_at)}</Text>
            {!isReply ? (
              <Pressable
                onPress={() => {
                  setReplyingToSheetComment(comment);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                hitSlop={8}
              >
                <Text style={styles.sheetReplyAction}>Reply</Text>
              </Pressable>
            ) : null}
          </View>
          {!isReply && comment.replies?.length ? (
            <View style={styles.sheetReplies}>
              {comment.replies.map(reply => renderSheetComment(reply, true))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const openShareSheet = async (post: Post) => {
    setSharePost(post);
    setShareLoading(true);
    try {
      const [convs, activeMatch] = await Promise.all([
        getConversations(),
        getActiveMatch(),
      ]);
      const targets = Array.isArray(convs)
        ? convs.map((c: any) => ({ ...c, shareType: 'dm' }))
        : [];
      if (activeMatch?.id && activeMatch.partnerId) {
        const partner = await getPartnerProfile(activeMatch.partnerId);
        targets.unshift({
          id: activeMatch.id,
          shareType: 'match',
          otherUser: {
            id: activeMatch.partnerId,
            ...(partner || {}),
          },
          updated_at: '',
        });
      }
      setShareConversations(targets);
    } catch (error) {
      console.error('Error loading share conversations:', error);
      setShareConversations([]);
    } finally {
      setShareLoading(false);
    }
  };

  const closeShareSheet = () => {
    if (shareSendingId) return;
    setSharePost(null);
    setShareConversations([]);
  };

  const sharePostToConversation = async (conversation: any) => {
    if (!sharePost || !conversation?.id || shareSendingId) return;
    setShareSendingId(conversation.id);
    try {
      const authorName = sharePost.profiles?.display_name || sharePost.profiles?.anonymous_username || 'Anonymous';
      const sharedPostPayload = {
        message_type: 'shared_post',
        shared_post: {
          id: sharePost.id,
          content: String(sharePost.content || '').slice(0, 500),
          author_name: authorName,
          media_url: sharePost.media_url || null,
          youtube_url: sharePost.youtube_url || null,
          youtube_id: sharePost.youtube_id || null,
          created_at: sharePost.created_at || null,
        },
      };
      if (conversation.shareType === 'match') {
        await sendMatchMessage(conversation.id, 'Shared a post', sharedPostPayload);
      } else {
        await sendMessage(conversation.id, 'Shared a post', sharedPostPayload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSharePost(null);
      setShareConversations([]);
      Alert.alert('Sent', `Post shared with ${conversation.otherUser?.display_name || conversation.otherUser?.anonymous_username || 'them'}.`);
    } catch (error: any) {
      console.error('Error sharing post:', error);
      Alert.alert('Could not share', error?.message || 'Try again.');
    } finally {
      setShareSendingId(null);
    }
  };

  const onUpvote = async (postId: string) => {
    const current = posts.find(p => p.id === postId);
    if (!current) return;

    // Optimistic UI update: apply locally first for instant feedback
    if (current.user_vote === 'upvote') {
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
      // Fire-and-forget server update; subscribeToPosts will reconcile
      removeVote(postId).catch((error) => console.error('Error removing upvote:', error));
    } else {
      setPosts(prev => prev.map(post => post.id === postId ? {
        ...post,
        user_vote: 'upvote',
        post_stats: {
          ...post.post_stats,
          upvotes_count: (post.post_stats?.upvotes_count || 0) + 1,
          downvotes_count: current.user_vote === 'downvote'
            ? Math.max(0, (post.post_stats?.downvotes_count || 0) - 1)
            : (post.post_stats?.downvotes_count || 0),
          views_count: post.post_stats?.views_count || 0,
          comments_count: post.post_stats?.comments_count || 0,
        }
      } as Post : post));
      upvotePost(postId).catch((error) => console.error('Error upvoting:', error));
    }
  };

  const onDownvote = async (postId: string) => {
    const current = posts.find(p => p.id === postId);
    if (!current) return;

    if (current.user_vote === 'downvote') {
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
      removeVote(postId).catch((error) => console.error('Error removing downvote:', error));
    } else {
      setPosts(prev => prev.map(post => post.id === postId ? {
        ...post,
        user_vote: 'downvote',
        post_stats: {
          ...post.post_stats,
          downvotes_count: (post.post_stats?.downvotes_count || 0) + 1,
          upvotes_count: current.user_vote === 'upvote'
            ? Math.max(0, (post.post_stats?.upvotes_count || 0) - 1)
            : (post.post_stats?.upvotes_count || 0),
          views_count: post.post_stats?.views_count || 0,
          comments_count: post.post_stats?.comments_count || 0,
        }
      } as Post : post));
      downvotePost(postId).catch((error) => console.error('Error downvoting:', error));
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
      <View style={styles.mainContent}>
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

          <View style={styles.headerCenter}>
            <Pressable
              onPressIn={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowStopTouching(true);
                logoScale.value = withSequence(
                  withTiming(1.3, { duration: 300, easing: Easing.out(Easing.cubic) }),
                  withTiming(1.0, { duration: 700, easing: Easing.inOut(Easing.cubic) })
                );
                setTimeout(() => setShowStopTouching(false), 1000);
                onRefresh();
              }}
              hitSlop={10}
              style={styles.headerLogoPressable}
            >
              <Reanimated.View style={[logoAnimatedStyle, styles.headerLogoRow]}>
                <Text style={styles.headerTitle}>Spill</Text>
                <Image
                  source={showStopTouching ? require('@/assets/images/stop-touching.png') : require('@/assets/images/logo12.png')}
                  style={styles.headerLogo}
                  contentFit="contain"
                />
              </Reanimated.View>
            </Pressable>
          </View>

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
                    router.push('/live' as any);
                  }}
                >
                  <Feather name="radio" size={20} color="#2563eb" />
                  <Text style={[styles.sideMenuItemText, { color: '#2563eb', fontWeight: '700' }]}>Podcast Spaces</Text>
                  <Feather name="chevron-right" size={20} color="#9ca3af" />
                </Pressable>
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
                {(userProfile?.is_admin || userProfile?.is_staff) && (
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
        ref={feedScrollRef}
        style={styles.feedContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {liveRooms.length > 0 && liveRooms[0]?.id !== dismissedLiveRoomId ? (
          <View style={styles.liveCapsuleWrap}>
            <Pressable
              style={styles.liveCapsule}
              onPress={() => presentRoom(liveRooms[0].id)}
            >
              <View style={styles.liveCapsuleArtworkWrap}>
                {liveRooms[0].cover_url ? (
                  <Image source={{ uri: liveRooms[0].cover_url }} style={styles.liveCapsuleArtwork} contentFit="cover" />
                ) : (
                  <View style={styles.liveCapsuleArtworkFallback}>
                    <Feather name="mic" size={16} color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.liveCapsuleTextWrap}>
                <Text style={styles.liveCapsuleTitle} numberOfLines={1}>
                  {liveRooms[0].title}
                </Text>
                <View style={styles.liveCapsuleMetaRow}>
                  <SpeakingWave active compact level={0.45} color="rgba(255,255,255,0.95)" />
                  <Text style={styles.liveCapsuleMeta} numberOfLines={1}>
                    {liveRooms[0].host_name || 'Therapist'} is live now · Tap to listen while browsing
                  </Text>
                </View>
              </View>
              <View style={styles.liveCapsuleControls}>
                <Pressable
                  style={styles.liveCapsuleControlBtn}
                  onPress={(event) => {
                    event.stopPropagation();
                    setDismissedLiveRoomId(liveRooms[0].id);
                    setShowLivePeek(false);
                  }}
                >
                  <Feather name="x" size={15} color="#fff" />
                </Pressable>
                <Pressable
                  style={styles.liveCapsuleControlBtn}
                  onPress={(event) => {
                    event.stopPropagation();
                    presentRoom(liveRooms[0].id);
                  }}
                >
                  <Feather name="play" size={15} color="#fff" />
                </Pressable>
              </View>
            </Pressable>
          </View>
        ) : null}
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
          posts.map((post) => {
            const isFlagged = post.flagged_for_toxicity && !post.approved_safe_at;
            return (
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
                        const response = await getAIOpinion(post.content, { flagged: !!isFlagged });
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

              {/* Post Content – tap anywhere to open detail + comments */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/comments?postId=${post.id}` as any);
                }}
                style={styles.postContentPressable}
              >
                {isFlagged ? (
                  <View style={[styles.postContent, styles.flaggedContent]}>
                    <Text style={styles.flaggedTitle}>This post is under review</Text>
                    <Text style={styles.flaggedText}>
                      Our safety system flagged this content as possibly harmful. An admin will review it soon.
                    </Text>
                  </View>
                ) : (
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
                )}
              </Pressable>
              {/* YouTube video – tap to open in YouTube app */}
              {(post.youtube_id || (post.youtube_url && extractYoutubeId(post.youtube_url))) && (
                <Pressable
                  style={styles.youtubeThumbWrap}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const url = post.youtube_url || `https://www.youtube.com/watch?v=${post.youtube_id || extractYoutubeId(post.youtube_url)}`;
                    Linking.openURL(url);
                  }}
                >
                  <Image
                    source={{ uri: youtubeThumbnailUrl(post.youtube_id || extractYoutubeId(post.youtube_url)!, false) }}
                    style={styles.youtubeThumb}
                    contentFit="cover"
                  />
                  <View style={styles.youtubePlayOverlay}>
                    <Feather name="play-circle" size={56} color="rgba(255,255,255,0.95)" />
                  </View>
                </Pressable>
              )}

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
                  <Feather name="message-circle" size={18} color="#94a3b8" strokeWidth={2} />
                  <Text style={styles.actionCount}>{post.post_stats?.comments_count || 0}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openShareSheet(post);
                  }}
                >
                  <Feather name="send" size={18} color="#94a3b8" strokeWidth={2} />
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
          )})
        )}
      </ScrollView>

      {showLivePeek && liveRooms.length > 0 && !menuVisible && liveRooms[0]?.id !== dismissedLiveRoomId ? (
        <View pointerEvents="box-none" style={[styles.livePeekHost, { top: insets.top + 116 }]}>
          <Pressable
            style={styles.livePeekChip}
            onPress={() => {
              feedScrollRef.current?.scrollTo({ y: 0, animated: true });
              setShowLivePeek(false);
            }}
          >
            <Text style={styles.livePeekText}>Live</Text>
            <Feather name="chevron-up" size={14} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {/* Comments bottom sheet */}
      <Modal
        visible={commentSheetPostId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentSheetPostId(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setCommentSheetPostId(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.sheetAvoiding}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          >
            <Pressable style={[styles.sheet, { height: '85%', paddingBottom: insets.bottom + 12 }]} onPress={e => e.stopPropagation()}>
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
                <View style={styles.sheetKeyboard}>
                  <ScrollView
                    style={styles.sheetScroll}
                    contentContainerStyle={styles.sheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {sheetComments.length === 0 && !sheetCommentsLoading && (
                      <Text style={styles.sheetEmpty}>No comments yet. Be the first!</Text>
                    )}
                    {sheetComments.map((c) => renderSheetComment(c))}
                  </ScrollView>
                  {replyingToSheetComment ? (
                    <View style={styles.sheetReplyingBar}>
                      <Text style={styles.sheetReplyingText} numberOfLines={1}>
                        Replying to {replyingToSheetComment.profiles?.display_name || replyingToSheetComment.profiles?.anonymous_username || 'Anonymous'}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setReplyingToSheetComment(null);
                          setNewCommentText('');
                        }}
                        hitSlop={10}
                      >
                        <Feather name="x" size={18} color="#64748b" />
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={styles.sheetInputRow}>
                    <TextInput
                      style={styles.sheetInput}
                      placeholder={replyingToSheetComment ? 'Write a reply...' : 'Add a comment...'}
                      placeholderTextColor="#94a3b8"
                      value={newCommentText}
                      onChangeText={setNewCommentText}
                      multiline
                      maxLength={500}
                      editable={!submittingComment}
                      textAlignVertical="center"
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
                </View>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Share post to active DM */}
      <Modal
        visible={!!sharePost}
        animationType="slide"
        transparent
        onRequestClose={closeShareSheet}
      >
        <Pressable style={styles.shareOverlay} onPress={closeShareSheet}>
          <Pressable style={[styles.shareSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.shareHeader}>
              <View>
                <Text style={styles.shareTitle}>Share post</Text>
                <Text style={styles.shareSubtitle}>Send to an active conversation</Text>
              </View>
              <Pressable onPress={closeShareSheet} hitSlop={12}>
                <Feather name="x" size={24} color="#64748b" />
              </Pressable>
            </View>

            {sharePost ? (
              <View style={styles.sharePostPreview}>
                <Text style={styles.sharePostLabel}>Post preview</Text>
                <Text style={styles.sharePostAuthor}>
                  {sharePost.profiles?.display_name || sharePost.profiles?.anonymous_username || 'Anonymous'}
                </Text>
                <Text style={styles.sharePostText} numberOfLines={3}>{sharePost.content}</Text>
              </View>
            ) : null}

            {shareLoading ? (
              <View style={styles.shareLoading}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.shareLoadingText}>Loading conversations...</Text>
              </View>
            ) : shareConversations.length === 0 ? (
              <View style={styles.shareEmpty}>
                <Feather name="message-circle" size={34} color="#cbd5e1" />
                <Text style={styles.shareEmptyTitle}>No active conversations</Text>
                <Text style={styles.shareEmptyText}>Start or accept a DM first, then you can share posts here.</Text>
              </View>
            ) : (
              <ScrollView style={styles.shareList} contentContainerStyle={styles.shareListContent}>
                {shareConversations.map((conversation) => {
                  const name = conversation.otherUser?.display_name || conversation.otherUser?.anonymous_username || 'Anonymous';
                  const sendingThis = shareSendingId === conversation.id;
                  return (
                    <Pressable
                      key={conversation.id}
                      style={({ pressed }) => [styles.sharePersonRow, pressed && styles.sharePersonRowPressed]}
                      onPress={() => sharePostToConversation(conversation)}
                      disabled={!!shareSendingId}
                    >
                      {conversation.otherUser?.avatar_url ? (
                        <Image source={{ uri: conversation.otherUser.avatar_url }} style={styles.shareAvatar} />
                      ) : (
                        <View style={styles.shareAvatarFallback}>
                          <Text style={styles.shareAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={styles.sharePersonInfo}>
                        <Text style={styles.sharePersonName} numberOfLines={1}>{name}</Text>
                        <Text style={styles.sharePersonSubtext} numberOfLines={1}>
                          {conversation.shareType === 'match' ? 'Your friend chat' : 'Active conversation'}
                        </Text>
                      </View>
                      {sendingThis ? (
                        <ActivityIndicator size="small" color="#ec4899" />
                      ) : (
                        <Feather name="send" size={18} color="#ec4899" />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainContent: {
    flex: 1,
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
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  headerLogoPressable: {
    padding: 4,
  },
  headerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ec4899',
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
  liveCapsuleWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  liveCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  liveCapsuleArtworkWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  liveCapsuleArtwork: {
    width: '100%',
    height: '100%',
  },
  liveCapsuleArtworkFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  liveCapsuleTextWrap: {
    flex: 1,
  },
  liveCapsuleTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  liveCapsuleMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  liveCapsuleMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveCapsuleControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveCapsuleControlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  livePeekHost: {
    position: 'absolute',
    right: 16,
    zIndex: 15,
  },
  livePeekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  livePeekText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
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
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
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
  // Same look as group streak challenge card (group.tsx challengeCard / challengeGoal / challengeDuration)
  flaggedContent: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  flaggedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  flaggedText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
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
  postContentPressable: {
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
  youtubeThumbWrap: {
    marginTop: -8,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  youtubeThumb: {
    width: '100%',
    height: Math.round(Dimensions.get('window').width * (9 / 16)),
    borderRadius: 8,
  },
  youtubePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  actionItemPressed: {
    opacity: 0.5,
  },
  actionIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 14,
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
  sheetAvoiding: {
    width: '100%',
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  sheetEmpty: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 32,
  },
  sheetCommentRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
    position: 'relative',
  },
  sheetReplyRow: {
    marginTop: 8,
    marginBottom: 0,
  },
  sheetThreadLine: {
    position: 'absolute',
    left: 19,
    top: 44,
    bottom: -8,
    width: 2,
    backgroundColor: '#f1f5f9',
    borderRadius: 2,
  },
  sheetCommentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetReplyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f8fafc',
  },
  sheetCommentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ec4899',
  },
  sheetReplyAvatarText: {
    fontSize: 13,
    color: '#64748b',
  },
  sheetCommentBody: {
    flex: 1,
  },
  sheetCommentBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderTopLeftRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  sheetReplyBubble: {
    backgroundColor: '#fff',
    borderColor: '#f1f5f9',
  },
  sheetCommentAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 3,
  },
  sheetCommentText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
  },
  sheetCommentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 5,
    marginLeft: 4,
  },
  sheetCommentTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  sheetReplyAction: {
    fontSize: 12,
    color: '#ec4899',
    fontWeight: '700',
  },
  sheetReplies: {
    marginTop: 4,
  },
  sheetReplyingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: '#fff7fb',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#fbcfe8',
  },
  sheetReplyingText: {
    flex: 1,
    marginRight: 10,
    color: '#be185d',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  sheetInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: '#0f172a',
    maxHeight: 110,
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
  shareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  shareTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
  },
  shareSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  sharePostPreview: {
    margin: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff7fb',
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  sharePostLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#be185d',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sharePostAuthor: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  sharePostText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  shareLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  shareLoadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  shareEmpty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 34,
  },
  shareEmptyTitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  shareEmptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  shareList: {
    maxHeight: 360,
  },
  shareListContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sharePersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef2f7',
    marginBottom: 10,
  },
  sharePersonRowPressed: {
    backgroundColor: '#f8fafc',
  },
  shareAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  shareAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#fce7f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAvatarText: {
    color: '#ec4899',
    fontSize: 17,
    fontWeight: '900',
  },
  sharePersonInfo: {
    flex: 1,
    paddingRight: 10,
  },
  sharePersonName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  sharePersonSubtext: {
    marginTop: 3,
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
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
