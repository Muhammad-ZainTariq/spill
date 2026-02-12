import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
export interface Post {
  id: string;
  content: string;
  category?: string;
  media_url?: string;
  created_at: string;
  user_id: string;
  is_vent?: boolean;
  expires_at?: string | null;
  profiles: {
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  } | null;
  post_stats: {
    upvotes_count: number;
    downvotes_count: number;
    views_count: number;
    comments_count: number;
  } | null;
  user_vote?: 'upvote' | 'downvote' | null;
}

export const fetchPosts = async (category?: string): Promise<Post[]> => {
  try {
    // First get posts including vent mode fields
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('id, content, category, media_url, created_at, user_id, is_vent, expires_at')
      .order('created_at', { ascending: false });

    let filtered = postsData || [];
    
    // Filter out expired vent posts
    const now = new Date();
    filtered = filtered.filter((p: any) => {
      if (p.is_vent && p.expires_at) {
        return new Date(p.expires_at) > now;
      }
      return true;
    });
    
    if (category && category !== 'All') {
      filtered = filtered.filter((p: any) => p.category === category);
    }

    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return [];
    }

    // Then get profiles for each post
    const postsWithProfiles = await Promise.all(
      filtered.map(async (post) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, anonymous_username, avatar_url')
          .eq('id', post.user_id)
          .single();

        // Get post stats
        const { data: stats } = await supabase
          .from('post_stats')
          .select('upvotes_count, downvotes_count, views_count, comments_count')
          .eq('post_id', post.id)
          .single();

        // Get user vote
        const { data: { user } } = await supabase.auth.getUser();
        let userVote = null;
        if (user) {
          const { data: vote } = await supabase
            .from('post_votes')
            .select('vote_type')
            .eq('post_id', post.id)
            .eq('user_id', user.id)
            .single();
          userVote = vote?.vote_type || null;
        }

        return {
          ...post,
          profiles: profile || null,
          post_stats: stats || { upvotes_count: 0, downvotes_count: 0, views_count: 0, comments_count: 0 },
          user_vote: userVote,
        };
      })
    );

    return postsWithProfiles;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
};



// Create Post Function
export const createPost = async (content: string, mediaUrl?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('posts')
      .insert({
        content,
        media_url: mediaUrl,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

// Delete Post Function
export const deletePost = async (postId: string) => {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    return false;
  }
};

// ========================================
// VOTING FUNCTIONS
// ========================================
// Upvote Post Function
export const upvotePost = async (postId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('post_votes')
      .upsert(
        {
          post_id: postId,
          user_id: user.id,
          vote_type: 'upvote',
        },
        { onConflict: 'post_id,user_id' }
      );

    if (error) {
      console.error('Upvote error:', error);
      throw error;
    }

    console.log('Successfully upvoted post:', postId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  } catch (error) {
    console.error('Error upvoting post:', error);
    return false;
  }
};

// Downvote Post Function
export const downvotePost = async (postId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('post_votes')
      .upsert(
        {
          post_id: postId,
          user_id: user.id,
          vote_type: 'downvote',
        },
        { onConflict: 'post_id,user_id' }
      );

    if (error) throw error;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  } catch (error) {
    console.error('Error downvoting post:', error);
    return false;
  }
};

// Remove Vote Function
export const removeVote = async (postId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('post_votes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);

    if (error) throw error;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  } catch (error) {
    console.error('Error removing vote:', error);
    return false;
  }
};

// ========================================
// COMMENT FUNCTIONS
// ========================================
// Add Comment Function
export const addComment = async (postId: string, content: string, parentCommentId?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content,
        parent_comment_id: parentCommentId || null,
      })
      .select(`
        id,
        content,
        created_at,
        parent_comment_id,
        profiles (
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;
    console.log('Successfully added comment:', data);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return data;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
};

// Fetch Comments Function (with replies)
export const fetchComments = async (postId: string) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        parent_comment_id,
        profiles (
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const comments = data || [];
    const parentComments = comments.filter(comment => !comment.parent_comment_id);
    const replies = comments.filter(comment => comment.parent_comment_id);

    const organizedComments = parentComments.map(parent => ({
      ...parent,
      replies: replies.filter(reply => reply.parent_comment_id === parent.id)
    }));

    return organizedComments;
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
};

// Add Reply Function
export const addReply = async (postId: string, parentCommentId: string, content: string) => {
  return addComment(postId, content, parentCommentId);
};

// Delete Comment Function
export const deleteComment = async (commentId: string) => {
  try {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
    console.log('Successfully deleted comment:', commentId);
    return true;
  } catch (error) {
    console.error('Error deleting comment:', error);
    return false;
  }
};

// Get Comment Count Function
export const getCommentCount = async (postId: string) => {
  try {
    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting comment count:', error);
    return 0;
  }
};

// ========================================
// USER PROFILE FUNCTIONS
// ========================================
// Fetch User Profile Function
export const fetchUserProfile = async () => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.log('Auth error (likely refresh token issue):', authError.message);
      return null;
    }
    
    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          console.log('Profile not found, creating new profile...');
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              display_name: null,
              anonymous_username: null,
              avatar_url: null,
            })
            .select()
            .single();
          
          if (createError) {
            console.error('Error creating profile:', createError);
            return null;
          } else {
            console.log('Created new profile:', newProfile);
            return newProfile;
          }
        } else {
          console.error('Error fetching user profile:', error);
          return null;
        }
      } else {
        console.log('Fetched user profile:', profile);
        return profile;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
};

// Update User Profile Function
export const updateUserProfile = async (updates: {
  display_name?: string;
  anonymous_username?: string;
  avatar_url?: string;
}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================
// Format Time Ago Function
export const formatTimeAgo = (dateString: string) => {
  const now = new Date();
  const postDate = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - postDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

// Handle Scroll Function (for video visibility)
export const handleScroll = (
  event: any,
  posts: Post[],
  visibleVideoId: string | null,
  setVisibleVideoId: (id: string | null) => void
) => {
  const scrollY = event.nativeEvent.contentOffset.y;
  const screenHeight = event.nativeEvent.layoutMeasurement.height;
  const screenCenter = scrollY + screenHeight / 2;

  let newVisibleVideoId: string | null = null;

  posts.forEach((post, index) => {
    if (post.media_url && post.media_url.includes('video-data')) {
      const postTop = index * 400;
      const postBottom = postTop + 300;
      const viewportTop = scrollY + screenHeight * 0.2;
      const viewportBottom = scrollY + screenHeight * 0.8;

      if (postTop < viewportBottom && postBottom > viewportTop) {
        const videoCenter = postTop + (postBottom - postTop) / 2;
        const distanceFromScreenCenter = Math.abs(videoCenter - screenCenter);
        if (!newVisibleVideoId || distanceFromScreenCenter < Math.abs((newVisibleVideoId === post.id ? 0 : 999999))) {
          newVisibleVideoId = post.id;
        }
      }
    }
  });

  if (newVisibleVideoId !== visibleVideoId) {
    setVisibleVideoId(newVisibleVideoId);
  }
};

// ========================================
// UI HELPER FUNCTIONS
// ========================================
// Show Success Alert
export const showSuccessAlert = (message: string) => {
  Alert.alert('Success', message);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// Show Error Alert
export const showErrorAlert = (message: string) => {
  Alert.alert('Error', message);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
};

// Show Confirmation Alert
export const showConfirmationAlert = (
  title: string,
  message: string,
  onConfirm: () => void
) => {
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm }
    ]
  );
};

// Handle More Options (for post menu)
export const handleMoreOptions = async (postId: string, postUserId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (user.id === postUserId) {
      showConfirmationAlert(
        'Delete Post',
        'Are you sure you want to delete this post?',
        () => deletePost(postId)
      );
    } else {
      Alert.alert('Options', 'This is not your post');
    }
  } catch (error) {
    console.error('Error handling more options:', error);
  }
};

// Handle Comment - Navigate to comments screen
export const handleComment = (postId: string, router: any) => {
  router.push(`/comments?postId=${postId}` as any);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

// Handle Share (placeholder)
export const handleShare = (postId: string) => {
  Alert.alert('Share', 'Share feature coming soon!');
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};


export const getAIOpinion = async (content: string): Promise<string> => {
  try {
    const apiKey =
      (Constants as any)?.expoConfig?.extra?.openaiApiKey ||
      (Constants as any)?.manifest?.extra?.openaiApiKey;

    if (!apiKey) {
      console.warn('OpenAI API key missing – add "openaiApiKey" to app.json extra');
      return 'AI is not configured.';
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a kind, supportive friend. Keep your reply short (≤ 120 tokens) and always positive.',
          },
          {
            role: 'user',
            content: `What do you think about this post?\n\n"""${content}"""`,
          },
        ],
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('OpenAI error:', res.status, text);
      return 'AI had trouble responding.';
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'No response.';
  } catch (e: any) {
    console.error('AI failed:', e.message);
    return 'AI request failed.';
  }
};




// ========================================
// FOLLOW FUNCTIONS
// ========================================
// Follow User Function
export const followUser = async (userId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    if (user.id === userId) return false;

    const { error } = await supabase
      .from('followers')
      .insert({
        follower_id: user.id,
        following_id: userId,
      });

    if (error) {
      console.error('Follow error:', error);
      return false;
    }

    console.log('Successfully followed user:', userId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    console.error('Error following user:', error);
    return false;
  }
};

// Unfollow User Function
export const unfollowUser = async (userId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', userId);

    if (error) {
      console.error('Unfollow error:', error);
      return false;
    }

    console.log('Successfully unfollowed user:', userId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return false;
  }
};

// Check if user is following another user
export const isFollowing = async (userId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking follow status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
};

// Get User Profile with Follow Stats
export const getUserProfile = async (userId: string) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        media_url,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (postsError) {
      console.error('Error fetching user posts:', postsError);
    }

    let postsWithStats = [];
    if (posts && posts.length > 0) {
      const postIds = posts.map(post => post.id);
      const { data: statsData } = await supabase
        .from('post_stats')
        .select('*')
        .in('post_id', postIds);

      postsWithStats = posts.map(post => {
        const stats = statsData?.find(stat => stat.post_id === post.id);
        return {
          ...post,
          post_stats: stats || {
            upvotes_count: 0,
            downvotes_count: 0,
            views_count: 0,
            comments_count: 0
          }
        };
      });
    }

    const isFollowingUser = await isFollowing(userId);

    return {
      ...profile,
      posts: postsWithStats,
      isFollowing: isFollowingUser,
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// Get Followers List
export const getFollowers = async (userId: string) => {
  try {
    const { data, error } = await supabase
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
      .eq('following_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching followers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting followers:', error);
    return [];
  }
};

// Get Following List
export const getFollowing = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('followers')
      .select(`
        created_at,
        profiles!followers_following_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('follower_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching following:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting following:', error);
    return [];
  }
};

// ========================================
// MESSAGING FUNCTIONS
// ========================================

// Get or create a conversation between two users
// Ensures BOTH participants are recorded in conversation_users
// so that getConversations() and RLS can see the conversation
// for both users immediately.
export const getOrCreateConversation = async (userId: string) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check recipient's message preference first
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('message_preference')
      .eq('id', userId)
      .single();

    if (recipientProfile?.message_preference === 'none') {
      throw new Error('This user is not accepting messages');
    }

    // Deterministic ordering: the same pair of users always maps
    // to the same (participant1_id, participant2_id) combination.
    const participant1 = user.id < userId ? user.id : userId;
    const participant2 = user.id < userId ? userId : user.id;

    // 1) Try to find an existing conversation between these two users.
    const { data: existing, error: findError } = await supabase
      .from('conversations')
      .select('*')
      .eq('participant1_id', participant1)
      .eq('participant2_id', participant2)
      .single();

    if (existing && !findError) {
      // Make sure BOTH users are in conversation_users so each
      // can see this conversation in their list.
      const { error: linkError } = await supabase
        .from('conversation_users')
        .upsert(
          [
            { conversation_id: existing.id, user_id: participant1 },
            { conversation_id: existing.id, user_id: participant2 },
          ],
          { onConflict: 'conversation_id,user_id' }
        );

      if (linkError) {
        console.error(
          'Error upserting conversation_users for existing conversation:',
          linkError
        );
      }

      return existing;
    }

    // If there was an error that is not "no rows", surface it.
    if (findError && (findError as any).code && (findError as any).code !== 'PGRST116') {
      throw findError;
    }

    // Determine initial status based on recipient's preference
    // 'direct' = accepted immediately, 'requests' = pending for approval
    const initialStatus = recipientProfile?.message_preference === 'direct' ? 'accepted' : 'pending';

    // 2) Create a new conversation row.
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        participant1_id: participant1,
        participant2_id: participant2,
        updated_at: new Date().toISOString(),
        status: initialStatus,
      })
      .select()
      .single();

    if (createError) throw createError;

    // 3) Record both participants as members of the conversation.
    const { error: linkErrorNew } = await supabase
      .from('conversation_users')
      .upsert(
        [
          { conversation_id: newConv.id, user_id: participant1 },
          { conversation_id: newConv.id, user_id: participant2 },
        ],
        { onConflict: 'conversation_id,user_id' }
      );

    if (linkErrorNew) {
      console.error(
        'Error upserting conversation_users for new conversation:',
        linkErrorNew
      );
    }

    return newConv;
  } catch (error) {
    console.error('Error getting/creating conversation:', error);
    throw error;
  }
};

// Send a message
export const sendMessage = async (conversationId: string, content: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

// Fetch messages for a conversation
export const fetchMessages = async (conversationId: string, limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

// Get all conversations for current user (only accepted ones)
export const getConversations = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get muted and deleted conversation IDs
    const { data: mutedData } = await supabase
      .from('muted_conversations')
      .select('conversation_id')
      .eq('user_id', user.id);

    const { data: deletedData } = await supabase
      .from('deleted_conversations')
      .select('conversation_id')
      .eq('user_id', user.id);

    const mutedIds = (mutedData || []).map(m => m.conversation_id);
    const deletedIds = (deletedData || []).map(d => d.conversation_id);
    const excludedIds = [...mutedIds, ...deletedIds];

    // Get blocked user IDs
    const { data: blockedData } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    const blockedIds = (blockedData || []).map(b => b.blocked_id);

    // Get all conversations where user is either participant1 or participant2
    // ONLY get accepted conversations (status = 'accepted')
    const { data: data1, error: error1 } = await supabase
      .from('conversations')
      .select(`
        *,
        participant1:profiles!conversations_participant1_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        ),
        participant2:profiles!conversations_participant2_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('participant1_id', user.id)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false });

    const { data: data2, error: error2 } = await supabase
      .from('conversations')
      .select(`
        *,
        participant1:profiles!conversations_participant1_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        ),
        participant2:profiles!conversations_participant2_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('participant2_id', user.id)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false });

    if (error1 || error2) {
      console.error('Error fetching conversations:', error1 || error2);
      throw error1 || error2;
    }

    // Combine and deduplicate conversations
    const allConversations = [...(data1 || []), ...(data2 || [])];
    const uniqueConversations = allConversations.filter((conv, index, self) =>
      index === self.findIndex((c) => c.id === conv.id)
    );

    // Sort by updated_at
    const data = uniqueConversations.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });

    // Format conversations - we'll get last messages separately if needed
    // For now, just use the nested query result
    const conversationsWithMessages = (data || []).map(conv => ({
      ...conv,
      last_message: [],
    }));

    
    const filtered = conversationsWithMessages
      .filter(conv => {
        // Exclude deleted conversations (but keep muted ones)
        if (deletedIds.includes(conv.id)) return false;
        
        // Exclude conversations with blocked users
        const otherUserId = conv.participant1_id === user.id ? conv.participant2_id : conv.participant1_id;
        if (blockedIds.includes(otherUserId)) return false;
        
        return true;
      })
      .map(conv => ({
        ...conv,
        otherUser: conv.participant1_id === user.id ? conv.participant2 : conv.participant1,
        isMuted: mutedIds.includes(conv.id),
      }));

    // Return conversations without last messages for now
    // Last messages will be loaded via realtime updates
    return filtered;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};

// Get pending message requests for current user
export const getPendingRequests = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get blocked user IDs
    const { data: blockedData } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    const blockedIds = (blockedData || []).map(b => b.blocked_id);

    // Get all pending conversations where current user is participant2
    // (participant1 is the one who initiated, participant2 receives the request)
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        participant1:profiles!conversations_participant1_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        ),
        participant2:profiles!conversations_participant2_id_fkey (
          id,
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('participant2_id', user.id)
      .eq('status', 'pending')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }

    // Get first message for each request
    const requestsWithMessages = await Promise.all(
      (data || []).map(async (conv) => {
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true })
          .limit(1);

        return {
          ...conv,
          otherUser: conv.participant1, // The sender is participant1
          firstMessage: messages && messages.length > 0 ? messages[0] : null,
        };
      })
    );

    // Filter out blocked users
    const filtered = requestsWithMessages.filter(req => {
      return !blockedIds.includes(req.otherUser.id);
    });

    return filtered;
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    return [];
  }
};

// Accept a message request
export const acceptMessageRequest = async (conversationId: string) => {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'accepted' })
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error accepting message request:', error);
    return false;
  }
};

// Decline a message request
export const declineMessageRequest = async (conversationId: string) => {
  try {
    // Delete the conversation and its messages
    await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error declining message request:', error);
    return false;
  }
};
export interface Group {
  id: string;
  name: string;
  description?: string;
  category?: string;
  creator_id: string;
  cover_image_url?: string;
  is_public: boolean;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  creator?: {
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
}

export interface GroupActivity {
  id: string;
  group_id: string;
  activity_type: 'meditation' | 'journaling' | 'gratitude';
  name: string;
  description?: string;
}

export interface DailyUpdate {
  id: string;
  group_id: string;
  user_id: string;
  activity_type: string;
  content: string;
  created_at: string;
  ai_analysis?: string;
  user?: {
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
}

export interface Streak {
  id: string;
  group_id: string;
  user_id: string;
  activity_type: string;
  current_streak: number;
  longest_streak: number;
  last_update_date?: string;
}

// Create a new group
export const createGroup = async (name: string, description: string, category: string = 'general', isPublic: boolean = true, coverImageUrl?: string | null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('groups')
      .insert({
        name,
        description,
        category,
        creator_id: user.id,
        is_public: isPublic,
        cover_image_url: coverImageUrl || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return null;
    }

    // Add creator as member with 'creator' role
    await supabase
      .from('group_members')
      .insert({
        group_id: data.id,
        user_id: user.id,
        role: 'creator',
      });

    // Create default activities
    const activities = [
      { activity_type: 'meditation', name: 'Daily Meditation', description: 'Share your meditation practice' },
      { activity_type: 'journaling', name: 'Daily Journaling', description: 'Write about your day' },
      { activity_type: 'gratitude', name: 'Gratitude Sharing', description: 'Share what you\'re grateful for' },
    ];

    await supabase
      .from('group_activities')
      .insert(
        activities.map(activity => ({
          group_id: data.id,
          ...activity,
        }))
      );

    return data;
  } catch (error) {
    console.error('Error creating group:', error);
    return null;
  }
};

// Get all groups (public or user's groups)
export const getGroups = async (includePrivate: boolean = false, category?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    let query = supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (!includePrivate) {
      query = query.eq('is_public', true);
    }
    
    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching groups:', error);
      return [];
    }
    
    const groupsWithCreator = await Promise.all(
      (data || []).map(async (group: any) => {
        const { data: creator } = await supabase
          .from('profiles')
          .select('id, display_name, anonymous_username, avatar_url')
          .eq('id', group.creator_id)
          .single();
        
        return { ...group, creator: creator || null };
      })
    );

    // Get member counts and check if user is member
    const groupsWithStats = await Promise.all(
      groupsWithCreator.map(async (group: any) => {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);

        let isMember = false;
        if (user) {
          // Creator is automatically a member
          if (group.creator_id === user.id) {
            isMember = true;
          } else {
            const { data: member } = await supabase
              .from('group_members')
              .select('id')
              .eq('group_id', group.id)
              .eq('user_id', user.id)
              .maybeSingle();
            isMember = !!member;
          }
        }

        return {
          ...group,
          member_count: count || 1, // At least 1 (creator)
          is_member: isMember,
        };
      })
    );

    return groupsWithStats;
  } catch (error) {
    console.error('Error getting groups:', error);
    return [];
  }
};

// Get group details
export const getGroup = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: groupData, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();
    
    if (error) {
      console.error('Error fetching group:', error);
      return null;
    }
    
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, display_name, anonymous_username, avatar_url')
      .eq('id', groupData.creator_id)
      .single();
    
    const data = { ...groupData, creator: creator || null };

    // Get member count (includes creator who is in group_members)
    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);

    // Check if user is member or creator
    let isMember = false;
    if (user) {
      // Creator is automatically a member
      if (data.creator_id === user.id) {
        isMember = true;
      } else {
        const { data: member } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .maybeSingle();
        isMember = !!member;
      }
    }

    return {
      ...data,
      member_count: count || 1, // At least 1 (creator)
      is_member: isMember,
    };
  } catch (error) {
    console.error('Error getting group:', error);
    return null;
  }
};

// Join a group
export const joinGroup = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be logged in to join a group');
      return false;
    }

    // Check if user is creator
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id, requires_approval')
      .eq('id', groupId)
      .single();

    if (!group) {
      Alert.alert('Error', 'Group not found');
      return false;
    }

    if (group.creator_id === user.id) {
      // Creator is automatically a member, no need to join
      return true;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Already a member, return true silently
      return true;
    }

    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        role: 'member',
      });

    if (error) {
      console.error('Error joining group:', error);
      if (error.code === '23505') {
        // Already a member (race condition)
        return true;
      } else {
        Alert.alert('Error', error.message || 'Failed to join group');
        return false;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error: any) {
    console.error('Error joining group:', error);
    Alert.alert('Error', error.message || 'Failed to join group');
    return false;
  }
};

// Leave a group
export const leaveGroup = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error leaving group:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error leaving group:', error);
    return false;
  }
};

// Create a new streak (activity) in a group
export const createStreak = async (groupId: string, name: string, description?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Generate a unique activity_type from the name
    const activityType = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const { data, error } = await supabase
      .from('group_activities')
      .insert({
        group_id: groupId,
        activity_type: activityType,
        name: name,
        description: description || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating streak:', error);
      return null;
    }

    // Automatically accept the streak for the creator
    await acceptStreak(groupId, activityType);

    return data;
  } catch (error) {
    console.error('Error creating streak:', error);
    return null;
  }
};

// Accept a streak (join it)
export const acceptStreak = async (groupId: string, activityType: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if streak already exists
    const { data: existing } = await supabase
      .from('streaks')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('activity_type', activityType)
      .single();

    if (existing) {
      return true; // Already accepted
    }

    // Create streak record
    const { error } = await supabase
      .from('streaks')
      .insert({
        group_id: groupId,
        user_id: user.id,
        activity_type: activityType,
        current_streak: 0,
        longest_streak: 0,
      });

    if (error) {
      console.error('Error accepting streak:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error accepting streak:', error);
    return false;
  }
};

// Check if user has accepted a streak
export const hasAcceptedStreak = async (groupId: string, activityType: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from('streaks')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('activity_type', activityType)
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
};

// Get all available streaks in a group with acceptance status
export const getAvailableStreaks = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get all activities
    const { data: activities, error: activitiesError } = await supabase
      .from('group_activities')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (activitiesError) {
      console.error('Error fetching activities:', activitiesError);
      return [];
    }

    // Get user's accepted streaks
    const { data: userStreaks } = await supabase
      .from('streaks')
      .select('activity_type')
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    const acceptedTypes = new Set((userStreaks || []).map(s => s.activity_type));

    // Get creator info for each activity
    const activitiesWithStatus = await Promise.all(
      (activities || []).map(async (activity) => {
        // Get creator profile
        const { data: groupData } = await supabase
          .from('groups')
          .select('creator_id')
          .eq('id', groupId)
          .single();

        let creatorProfile = null;
        if (groupData) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, anonymous_username, avatar_url')
            .eq('id', groupData.creator_id)
            .single();
          creatorProfile = profile;
        }

        // Get participant count
        const { count } = await supabase
          .from('streaks')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('activity_type', activity.activity_type);

        return {
          ...activity,
          creator: creatorProfile,
          participant_count: count || 0,
          is_accepted: acceptedTypes.has(activity.activity_type),
        };
      })
    );

    return activitiesWithStatus;
  } catch (error) {
    console.error('Error getting available streaks:', error);
    return [];
  }
};

// Check in to a streak (create daily update)
export const checkInToStreak = async (groupId: string, activityType: string, content?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Verify user has accepted this streak
    const hasAccepted = await hasAcceptedStreak(groupId, activityType);
    if (!hasAccepted) {
      console.error('User has not accepted this streak');
      return null;
    }

    // Create daily update (this will trigger streak update via trigger)
    const update = await createDailyUpdate(
      groupId,
      activityType,
      content || 'Checked in! 🔥'
    );

    return update;
  } catch (error) {
    console.error('Error checking in to streak:', error);
    return null;
  }
};

// Get group activities
export const getGroupActivities = async (groupId: string) => {
  try {
    const { data, error } = await supabase
      .from('group_activities')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching activities:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting activities:', error);
    return [];
  }
};

// Create daily update
export const createDailyUpdate = async (
  groupId: string,
  activityType: string,
  content: string
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if update already exists for today
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('daily_updates')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('activity_type', activityType)
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('daily_updates')
        .update({ content })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating daily update:', error);
        return null;
      }

      return data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('daily_updates')
        .insert({
          group_id: groupId,
          user_id: user.id,
          activity_type: activityType,
          content,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating daily update:', error);
        return null;
      }

      // Get AI analysis
      try {
        const aiAnalysis = await getAIOpinion(content);
        await supabase
          .from('daily_updates')
          .update({ ai_analysis: aiAnalysis })
          .eq('id', data.id);
        return { ...data, ai_analysis: aiAnalysis };
      } catch (aiError) {
        console.error('Error getting AI analysis:', aiError);
        return data;
      }
    }
  } catch (error) {
    console.error('Error creating daily update:', error);
    return null;
  }
};

// Get daily updates for a group
export const getDailyUpdates = async (groupId: string, activityType?: string) => {
  try {
    let query = supabase
      .from('daily_updates')
      .select(`
        *,
        user:profiles!daily_updates_user_id_fkey (
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (activityType) {
      query = query.eq('activity_type', activityType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching daily updates:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting daily updates:', error);
    return [];
  }
};

// Get user streaks for a group
export const getUserStreaks = async (groupId: string, userId?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    const { data, error } = await supabase
      .from('streaks')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', targetUserId);

    if (error) {
      console.error('Error fetching streaks:', error);
      return [];
    }

    // Check and reset streaks if needed (24 hour check)
    const now = new Date();
    const updatedStreaks = (data || []).map(streak => {
      if (!streak.last_update_date) {
        return { ...streak, current_streak: 0 };
      }

      const lastUpdate = new Date(streak.last_update_date);
      const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

      if (hoursSinceUpdate > 24) {
        return { ...streak, current_streak: 0 };
      }

      return streak;
    });

    return updatedStreaks;
  } catch (error) {
    console.error('Error getting streaks:', error);
    return [];
  }
};

// Get group leaderboard (top streaks)
export const getGroupLeaderboard = async (groupId: string, activityType?: string) => {
  try {
    let query = supabase
      .from('streaks')
      .select(`
        *,
        user:profiles!streaks_user_id_fkey (
          display_name,
          anonymous_username,
          avatar_url
        )
      `)
      .eq('group_id', groupId)
      .order('current_streak', { ascending: false })
      .limit(20);

    if (activityType) {
      query = query.eq('activity_type', activityType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
};

// Get all streaks for the current user across all groups
export const getAllUserStreaks = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Fetch all streaks for this user
    const { data: streaks, error: streaksError } = await supabase
      .from('streaks')
      .select('*')
      .eq('user_id', user.id);

    if (streaksError) {
      console.error('Error fetching user streaks:', streaksError);
      return [];
    }

    if (!streaks || streaks.length === 0) return [];

    // Fetch groups for these streaks
    const groupIds = Array.from(new Set(streaks.map((s: any) => s.group_id)));
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, category, cover_image_url')
      .in('id', groupIds);

    if (groupsError) {
      console.error('Error fetching groups for streaks:', groupsError);
    }

    // Fetch activities (one per streak)
    const activitiesByKey: Record<string, any> = {};
    await Promise.all(
      (streaks || []).map(async (s: any) => {
        const key = `${s.group_id}-${s.activity_type}`;
        if (activitiesByKey[key]) return;
        const { data: activity } = await supabase
          .from('group_activities')
          .select('group_id, activity_type, name, description')
          .eq('group_id', s.group_id)
          .eq('activity_type', s.activity_type)
          .maybeSingle();
        activitiesByKey[key] = activity || null;
      })
    );

    return (streaks || []).map((s: any) => {
      const group = groups?.find((g: any) => g.id === s.group_id) || null;
      const activityKey = `${s.group_id}-${s.activity_type}`;
      const activity = activitiesByKey[activityKey] || null;
      return {
        ...s,
        group,
        activity,
      };
    });
  } catch (error) {
    console.error('Error getting all user streaks:', error);
    return [];
  }
};

// Invite user to group
export const inviteUserToGroup = async (groupId: string, inviteeEmail: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('group_invitations')
      .insert({
        group_id: groupId,
        inviter_id: user.id,
        invitee_email: inviteeEmail,
        status: 'pending',
      });

    if (error) {
      console.error('Error inviting user:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error inviting user:', error);
    return false;
  }
};

// ========================================
// ADMIN FUNCTIONS
// ========================================

// Check if user is admin/creator of group
export const isGroupAdmin = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // First check if user is creator (from groups table to avoid RLS recursion)
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', groupId)
      .single();

    if (group && group.creator_id === user.id) {
      return true;
    }

    // Then check if user is admin in group_members
    const { data: member } = await supabase
      .from('group_members')
      .select('role, can_remove_members, can_add_members, can_delete_group, can_manage_settings')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) return false;
    
    return member.role === 'creator' || 
           member.role === 'admin' || 
           member.can_remove_members === true ||
           member.can_add_members === true ||
           member.can_delete_group === true ||
           member.can_manage_settings === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Remove member from group
export const removeMemberFromGroup = async (groupId: string, userId: string) => {
  try {
    const isAdmin = await isGroupAdmin(groupId);
    if (!isAdmin) {
      Alert.alert('Error', 'You do not have permission to remove members');
      return false;
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing member:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error removing member:', error);
    return false;
  }
};

// Issue warning to member
export const issueWarningToMember = async (groupId: string, userId: string) => {
  try {
    const isAdmin = await isGroupAdmin(groupId);
    if (!isAdmin) {
      Alert.alert('Error', 'You do not have permission to issue warnings');
      return false;
    }

    const { data: member } = await supabase
      .from('group_members')
      .select('warnings')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!member) return false;

    const newWarnings = (member.warnings || 0) + 1;

    const { error } = await supabase
      .from('group_members')
      .update({ warnings: newWarnings })
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error issuing warning:', error);
      return false;
    }

    if (newWarnings >= 3) {
      await removeMemberFromGroup(groupId, userId);
      Alert.alert('Member Removed', 'Member has been removed after 3 warnings');
    }

    return true;
  } catch (error) {
    console.error('Error issuing warning:', error);
    return false;
  }
};

// Add member to group (admin function)
export const addMemberToGroup = async (groupId: string, userId: string) => {
  try {
    const isAdmin = await isGroupAdmin(groupId);
    if (!isAdmin) {
      Alert.alert('Error', 'You do not have permission to add members');
      return false;
    }

    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role: 'member',
      });

    if (error) {
      console.error('Error adding member:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding member:', error);
    return false;
  }
};

// Delete group
export const deleteGroup = async (groupId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if user is creator (from groups table to avoid RLS recursion)
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', groupId)
      .single();

    if (!group) {
      Alert.alert('Error', 'Group not found');
      return false;
    }

    if (group.creator_id !== user.id) {
      const isAdmin = await isGroupAdmin(groupId);
      if (!isAdmin) {
        Alert.alert('Error', 'You do not have permission to delete this group');
        return false;
      }
    }

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('Error deleting group:', error);
      Alert.alert('Error', error.message || 'Failed to delete group');
      return false;
    }

    return true;
  } catch (error: any) {
    console.error('Error deleting group:', error);
    Alert.alert('Error', error.message || 'Failed to delete group');
    return false;
  }
};

// Update group cover image
export const updateGroupCoverImage = async (groupId: string, imageUrl: string | null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if user is creator (from groups table to avoid RLS recursion)
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', groupId)
      .single();

    if (!group || group.creator_id !== user.id) {
      const isAdmin = await isGroupAdmin(groupId);
      if (!isAdmin) {
        Alert.alert('Error', 'You do not have permission to update group image');
        return false;
      }
    }

    const { error } = await supabase
      .from('groups')
      .update({ cover_image_url: imageUrl })
      .eq('id', groupId);

    if (error) {
      console.error('Error updating group image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating group image:', error);
    return false;
  }
};

// Update group settings
export const updateGroupSettings = async (
  groupId: string,
  settings: {
    allow_member_posting?: boolean;
    allow_member_messaging?: boolean;
    requires_approval?: boolean;
    name?: string;
    description?: string;
    is_public?: boolean;
    cover_image_url?: string;
  }
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if user is creator (from groups table to avoid RLS recursion)
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', groupId)
      .single();

    if (!group || group.creator_id !== user.id) {
      const isAdmin = await isGroupAdmin(groupId);
      if (!isAdmin) {
        Alert.alert('Error', 'You do not have permission to update group settings');
        return false;
      }
    }

    const { error } = await supabase
      .from('groups')
      .update(settings)
      .eq('id', groupId);

    if (error) {
      console.error('Error updating group settings:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating group settings:', error);
    return false;
  }
};

// Get group members with admin info
export const getGroupMembers = async (groupId: string) => {
  try {
    // Fetch members first (without foreign key relationship)
    const { data: membersData, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Error fetching members:', error);
      return [];
    }

    if (!membersData || membersData.length === 0) {
      return [];
    }

    // Fetch user profiles separately
    const membersWithProfiles = await Promise.all(
      membersData.map(async (member: any) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, anonymous_username, avatar_url')
          .eq('id', member.user_id)
          .maybeSingle();

        return { ...member, user: profile || null };
      })
    );

    return membersWithProfiles;
  } catch (error) {
    console.error('Error getting group members:', error);
    return [];
  }
};

// Promote member to admin
export const promoteMemberToAdmin = async (groupId: string, userId: string) => {
  try {
    const isAdmin = await isGroupAdmin(groupId);
    if (!isAdmin) {
      Alert.alert('Error', 'You do not have permission to promote members');
      return false;
    }

    const { error } = await supabase
      .from('group_members')
      .update({
        role: 'admin',
        can_remove_members: true,
        can_add_members: true,
        can_manage_settings: true,
      })
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error promoting member:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error promoting member:', error);
    return false;
  }
};

// ========================================
// GROUP MESSAGING FUNCTIONS
// ========================================

export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: {
    id: string;
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
}

// Send message to group
export const sendGroupMessage = async (groupId: string, content: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if messaging is allowed
    const { data: group } = await supabase
      .from('groups')
      .select('allow_member_messaging, creator_id')
      .eq('id', groupId)
      .single();

    if (!group) return null;

    // Creator can always message
    const isCreator = group.creator_id === user.id;
    
    if (!isCreator) {
      // Check if user is member first
      const { data: member } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) {
        Alert.alert('Error', 'You must be a member to send messages');
        return null;
      }

      // Check if messaging is allowed for members
      const isAdminCheck = await isGroupAdmin(groupId);
      
      if (!isAdminCheck && !group.allow_member_messaging) {
        Alert.alert('Error', 'Messaging is disabled in this group');
        return null;
      }
    }

    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error sending group message:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error sending group message:', error);
    return null;
  }
};

// Get group messages
export const getGroupMessages = async (groupId: string, limit: number = 50) => {
  try {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching group messages:', error);
      return [];
    }

    // Get user profiles for messages
    const messagesWithUsers = await Promise.all(
      (data || []).map(async (message: any) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, anonymous_username, avatar_url')
          .eq('id', message.user_id)
          .single();

        return {
          ...message,
          user: profile || null,
        };
      })
    );

    return messagesWithUsers.reverse();
  } catch (error) {
    console.error('Error getting group messages:', error);
    return [];
  }
};

// ========================================
// PREMIUM MEMBERSHIP FUNCTIONS
// ========================================

// Check if current user has premium membership
export const checkPremiumStatus = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    return profile?.is_premium || false;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
};

// Activate premium membership for current user
export const activatePremium = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({
        is_premium: true,
        premium_activated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error activating premium:', error);
    return false;
  }
};

// ========================================
// MOOD & GRATITUDE FUNCTIONS
// ========================================

export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number; // 1-5
  note?: string | null;
  created_at: string;
}

export interface GratitudeEntry {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

// Log a mood entry
export const logMood = async (moodValue: number, note?: string): Promise<MoodEntry | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (moodValue < 1 || moodValue > 5) {
      throw new Error('Mood value must be between 1 and 5');
    }

    const { data, error } = await supabase
      .from('mood_entries')
      .insert({
        user_id: user.id,
        mood_value: moodValue,
        note: note || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error logging mood:', error);
    return null;
  }
};

// Get mood entries for a date range
export const getMoodEntries = async (days: number = 30): Promise<MoodEntry[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching mood entries:', error);
    return [];
  }
};

// Get average mood for a period
export const getAverageMood = async (days: number = 7): Promise<number | null> => {
  try {
    const entries = await getMoodEntries(days);
    if (entries.length === 0) return null;

    const sum = entries.reduce((acc, entry) => acc + entry.mood_value, 0);
    return sum / entries.length;
  } catch (error) {
    console.error('Error calculating average mood:', error);
    return null;
  }
};

// Add a gratitude entry
export const addGratitude = async (content: string): Promise<GratitudeEntry | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (!content.trim()) {
      throw new Error('Gratitude content cannot be empty');
    }

    const { data, error } = await supabase
      .from('gratitude_entries')
      .insert({
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) throw error;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return data;
  } catch (error) {
    console.error('Error adding gratitude:', error);
    return null;
  }
};

// Get all gratitude entries
export const getGratitudeEntries = async (limit?: number): Promise<GratitudeEntry[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('gratitude_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching gratitude entries:', error);
    return [];
  }
};

// Get a random gratitude entry
export const getRandomGratitude = async (): Promise<GratitudeEntry | null> => {
  try {
    const entries = await getGratitudeEntries();
    if (entries.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * entries.length);
    return entries[randomIndex];
  } catch (error) {
    console.error('Error getting random gratitude:', error);
    return null;
  }
};

// Get gratitude count
export const getGratitudeCount = async (): Promise<number> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('gratitude_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting gratitude count:', error);
    return 0;
  }
};

// Delete a gratitude entry
export const deleteGratitude = async (gratitudeId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('gratitude_entries')
      .delete()
      .eq('id', gratitudeId)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting gratitude:', error);
    return false;
  }
};

// Generate AI gratitude suggestion (Premium feature)
export const generateAIGratitude = async (): Promise<string | null> => {
  try {
    const apiKey =
      (Constants as any)?.expoConfig?.extra?.openaiApiKey ||
      (Constants as any)?.manifest?.extra?.openaiApiKey;

    if (!apiKey) {
      console.warn('OpenAI API key missing');
      return null;
    }

    const prompts = [
      "Generate a short, personal gratitude message (1-2 sentences) that feels genuine and uplifting. Focus on simple, everyday things people might be grateful for.",
      "Create a brief gratitude reflection (1-2 sentences) that's warm and authentic. Think about small joys, relationships, or moments of peace.",
      "Write a concise gratitude note (1-2 sentences) that feels personal and positive. Consider health, nature, learning, or connections with others.",
    ];

    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates thoughtful, genuine gratitude messages. Keep responses short (1-2 sentences), warm, and personal.',
          },
          {
            role: 'user',
            content: randomPrompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('OpenAI error:', res.status, text);
      return null;
    }

    const data = await res.json();
    const gratitude = data.choices?.[0]?.message?.content?.trim();

    if (!gratitude) {
      return null;
    }

    return gratitude;
  } catch (error) {
    console.error('Error generating AI gratitude:', error);
    return null;
  }
};

// Cancel premium membership (for demo purposes)
export const cancelPremium = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({
        is_premium: false,
        premium_expires_at: null,
      })
      .eq('id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error cancelling premium:', error);
    return false;
  }
};

// ========================================
// AI THERAPY PROMPTS FUNCTIONS
// ========================================

// Generate personalized AI therapy prompt based on posts and mood
export const generateAITherapyPrompt = async (): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const apiKey =
      (Constants as any)?.expoConfig?.extra?.openaiApiKey ||
      (Constants as any)?.manifest?.extra?.openaiApiKey;

    if (!apiKey) {
      console.warn('OpenAI API key missing');
      return null;
    }

    // Get recent posts and mood entries
    const [postsData, moodData] = await Promise.all([
      supabase
        .from('posts')
        .select('content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('mood_entries')
        .select('mood_value, note, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(7),
    ]);

    const recentPosts = postsData.data || [];
    const recentMoods = moodData.data || [];
    
    // Calculate average mood
    const avgMood = recentMoods.length > 0
      ? recentMoods.reduce((sum, m) => sum + m.mood_value, 0) / recentMoods.length
      : null;

    // Build context for AI
    let context = '';
    if (recentPosts.length > 0) {
      context += `Recent posts:\n${recentPosts.slice(0, 3).map(p => `- ${p.content.substring(0, 100)}`).join('\n')}\n\n`;
    }
    if (avgMood !== null) {
      const moodLabels = { 1: 'very low', 2: 'low', 3: 'neutral', 4: 'good', 5: 'great' };
      context += `Average mood: ${moodLabels[Math.round(avgMood) as keyof typeof moodLabels] || 'neutral'}\n\n`;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a supportive, empathetic therapist. Generate personalized reflection questions based on the user\'s recent activity and mood. Keep questions thoughtful, non-judgmental, and encouraging. Format as a single question (1-2 sentences).',
          },
          {
            role: 'user',
            content: `Based on this user's activity:\n\n${context || 'No recent activity available.'}\n\nGenerate a personalized reflection question that might help them gain insight or process their feelings.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('OpenAI error:', res.status, text);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('Error generating AI therapy prompt:', error);
    return null;
  }
};

// Get weekly summary with insights
export const getWeeklySummary = async (): Promise<{
  summary: string;
  insights: string[];
  moodTrend: 'improving' | 'stable' | 'declining';
} | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const apiKey =
      (Constants as any)?.expoConfig?.extra?.openaiApiKey ||
      (Constants as any)?.manifest?.extra?.openaiApiKey;

    if (!apiKey) {
      console.warn('OpenAI API key missing');
      return null;
    }

    // Get last 7 days of data
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [postsData, moodData] = await Promise.all([
      supabase
        .from('posts')
        .select('content, created_at')
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString()),
      supabase
        .from('mood_entries')
        .select('mood_value, created_at')
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: true }),
    ]);

    const posts = postsData.data || [];
    const moods = moodData.data || [];

    if (moods.length === 0 && posts.length === 0) {
      return {
        summary: 'No activity this week. Start logging your mood and sharing posts to get insights!',
        insights: [],
        moodTrend: 'stable',
      };
    }

    // Calculate mood trend
    let moodTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (moods.length >= 2) {
      const firstHalf = moods.slice(0, Math.ceil(moods.length / 2));
      const secondHalf = moods.slice(Math.ceil(moods.length / 2));
      const firstAvg = firstHalf.reduce((sum, m) => sum + m.mood_value, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + m.mood_value, 0) / secondHalf.length;
      if (secondAvg > firstAvg + 0.3) moodTrend = 'improving';
      else if (secondAvg < firstAvg - 0.3) moodTrend = 'declining';
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a supportive mental health assistant. Generate a brief weekly summary (2-3 sentences) and 2-3 actionable insights based on the user\'s activity. Be positive, encouraging, and specific.',
          },
          {
            role: 'user',
            content: `User's week:\n- Posts: ${posts.length}\n- Mood entries: ${moods.length}\n- Mood trend: ${moodTrend}\n- Average mood: ${moods.length > 0 ? (moods.reduce((sum, m) => sum + m.mood_value, 0) / moods.length).toFixed(1) : 'N/A'}\n\nGenerate a weekly summary and insights.`,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('OpenAI error:', res.status, text);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse summary and insights (simple parsing)
    const lines = content.split('\n').filter(l => l.trim());
    const summary = lines[0] || 'Your week in review.';
    const insights = lines.slice(1).filter(l => l.startsWith('-') || l.startsWith('•')).map(l => l.replace(/^[-•]\s*/, ''));

    return {
      summary,
      insights: insights.length > 0 ? insights : ['Keep tracking your mood to see patterns!'],
      moodTrend,
    };
  } catch (error) {
    console.error('Error getting weekly summary:', error);
    return null;
  }
};

// ========================================
// ANONYMOUS MATCHING FUNCTIONS
// ========================================

// Get available users for matching (those who opted in)
export const getAvailableUsers = async (category?: string): Promise<any[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('❌ No user found');
      return [];
    }

    console.log('🔍 Fetching available users, category:', category || 'All');

    // First, get all available users
    let query = supabase
      .from('profiles')
      .select('id, display_name, anonymous_username, avatar_url, match_struggles')
      .eq('available_for_matches', true)
      .neq('id', user.id);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

    if (error) {
      console.error('❌ Error querying available users:', error);
      throw error;
    }

    console.log('✅ Found', data?.length || 0, 'available users (before category filter)');

    // Filter by category in JavaScript if needed (more reliable than SQL array filter)
    let filteredData = data || [];
    if (category && category !== 'All' && filteredData.length > 0) {
      filteredData = filteredData.filter((user: any) => {
        const struggles = user.match_struggles || [];
        return struggles.includes(category);
      });
      console.log('✅ After category filter:', filteredData.length, 'users');
    }

    return filteredData;
  } catch (error) {
    console.error('❌ Error getting available users:', error);
    return [];
  }
};

// Send a match request to a specific user
export const sendMatchRequest = async (targetUserId: string): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if request already exists
    const { data: existing } = await supabase
      .from('match_requests')
      .select('id')
      .eq('sender_id', user.id)
      .eq('receiver_id', targetUserId)
      .in('status', ['pending', 'accepted'])
      .single();

    if (existing) {
      return null; // Request already exists
    }

    // Create match request
    const { data, error } = await supabase
      .from('match_requests')
      .insert({
        sender_id: user.id,
        receiver_id: targetUserId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.error('Error sending match request:', error);
    return null;
  }
};

// Get pending match requests (requests sent to current user)
export const getPendingMatchRequests = async (): Promise<any[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get match requests
    const { data: requests, error: requestsError } = await supabase
      .from('match_requests')
      .select('id, sender_id, status, created_at')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (requestsError) throw requestsError;
    if (!requests || requests.length === 0) return [];

    // Get sender profiles
    const senderIds = requests.map(r => r.sender_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, anonymous_username, avatar_url, match_struggles')
      .in('id', senderIds);

    if (profilesError) throw profilesError;

    // Combine requests with profiles
    const requestsWithProfiles = requests.map(request => ({
      ...request,
      profiles: profiles?.find(p => p.id === request.sender_id) || null,
    }));

    return requestsWithProfiles;
  } catch (error) {
    console.error('Error getting pending match requests:', error);
    return [];
  }
};

// Accept a match request
export const acceptMatchRequest = async (requestId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Get the request
    const { data: request } = await supabase
      .from('match_requests')
      .select('sender_id, receiver_id')
      .eq('id', requestId)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .single();

    if (!request) return false;

    // Create match (30 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    const { data: match, error: matchError } = await supabase
      .from('anonymous_matches')
      .insert({
        user1_id: request.sender_id,
        user2_id: request.receiver_id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (matchError) throw matchError;

    // Update request status
    const { error: updateError } = await supabase
      .from('match_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error('Error accepting match request:', error);
    return false;
  }
};

// Decline a match request
export const declineMatchRequest = async (requestId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('match_requests')
      .update({ status: 'declined' })
      .eq('id', requestId)
      .eq('receiver_id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error declining match request:', error);
    return false;
  }
};


// Get active match
export const getActiveMatch = async (): Promise<{
  id: string;
  partnerId: string;
  expiresAt: string;
  timeRemaining: number;
} | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: match } = await supabase
      .from('anonymous_matches')
      .select('id, user1_id, user2_id, expires_at')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq('status', 'active')
      .single();

    if (!match) return null;

    const partnerId = match.user1_id === user.id ? match.user2_id : match.user1_id;
    const expiresAt = new Date(match.expires_at);
    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000 / 60));

    if (timeRemaining <= 0) {
      // Match expired
      await supabase
        .from('anonymous_matches')
        .update({ status: 'expired' })
        .eq('id', match.id);
      return null;
    }

    return {
      id: match.id,
      partnerId,
      expiresAt: match.expires_at,
      timeRemaining,
    };
  } catch (error) {
    console.error('Error getting active match:', error);
    return null;
  }
};

// Extend match time (add 15 more minutes)
export const extendMatch = async (matchId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: match } = await supabase
      .from('anonymous_matches')
      .select('expires_at')
      .eq('id', matchId)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .single();

    if (!match) return false;

    const currentExpiry = new Date(match.expires_at);
    currentExpiry.setMinutes(currentExpiry.getMinutes() + 15);

    const { error } = await supabase
      .from('anonymous_matches')
      .update({ expires_at: currentExpiry.toISOString() })
      .eq('id', matchId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error extending match:', error);
    return false;
  }
};

// End match gracefully
export const endMatch = async (matchId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('anonymous_matches')
      .update({ status: 'ended' })
      .eq('id', matchId)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error ending match:', error);
    return false;
  }
};

// Get match conversation (messages between matched users)
export const getMatchMessages = async (matchId: string): Promise<any[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: messages } = await supabase
      .from('match_messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    return messages || [];
  } catch (error) {
    console.error('Error getting match messages:', error);
    return [];
  }
};

// Send message in match
export const sendMatchMessage = async (matchId: string, content: string): Promise<any | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('match_messages')
      .insert({
        match_id: matchId,
        sender_id: user.id,
        content,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error sending match message:', error);
    return null;
  }
};

// Default export for React component compatibility
export default function Functions() {
  return null; // This is just a utility file, not a component
}