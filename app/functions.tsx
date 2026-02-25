import { auth, db, functions } from '@/lib/firebase';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    Timestamp,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Alert } from 'react-native';

// Stub for removed Supabase – returns empty data; migrate to Firestore when needed
const _stub = (out: any) => Promise.resolve(out);
const _chain = (out: any) => ({
  select: () => ({ single: () => _stub(out), maybeSingle: () => _stub(out), order: () => ({ ascending: () => ({ limit: () => _stub(out) }), descending: () => _stub(out) }), eq: () => ({ eq: () => ({ single: () => _stub(out), maybeSingle: () => _stub(out) }), order: () => _stub(out), gte: () => ({ lt: () => ({ single: () => _stub(out) }) }), in: () => ({ single: () => _stub(out) }) }), gte: () => ({ order: () => ({ limit: () => _stub(out) }) }) }),
  insert: (v: any) => ({ select: () => ({ single: () => _stub(v) }) }),
  update: (v: any) => ({ eq: () => _stub({ error: null }) }),
  delete: () => ({ eq: () => ({ eq: () => _stub({ error: null }) }) }),
});
const supabase = {
  auth: { getUser: async () => ({ data: { user: auth.currentUser ? { id: auth.currentUser.uid } : null } }) },
  from: () => ({ select: (...args: any[]) => _chain(args.length ? null : []), insert: (v: any) => ({ select: () => ({ single: () => _stub(v) }) }), update: (v: any) => ({ eq: () => _stub({ error: null }) }), delete: () => ({ eq: () => ({ eq: () => _stub({ error: null }) }) }) }),
  storage: { from: () => ({ upload: () => _stub({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};

export interface Post {
  id: string;
  content: string;
  category?: string;
  media_url?: string;
  created_at: string;
  user_id: string;
  is_vent?: boolean;
  expires_at?: string | null;
  /** True when auto-flagged for toxicity; content is hidden until admin approves. */
  flagged_for_toxicity?: boolean;
  /** When set, post is shown with a "might be dangerous or toxic" badge. */
  approved_safe_at?: string | null;
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

/** Feed algorithm: mix of posts from people you follow + discovery (others). Interleaves 1 from followed, 1 from discovery. */
function mergeFollowedAndDiscovery(followed: any[], discovery: any[]): any[] {
  const out: any[] = [];
  let i = 0;
  let j = 0;
  while (i < followed.length || j < discovery.length) {
    if (i < followed.length) out.push(followed[i++]);
    if (j < discovery.length) out.push(discovery[j++]);
  }
  return out;
}

export const fetchPosts = async (category?: string): Promise<Post[]> => {
  try {
    const uid = auth.currentUser?.uid;
    const now = new Date();
    const normCreatedAt = (data: any): string => {
      if (typeof data?.created_at === 'string') return data.created_at;
      const ts = data?.createdAt;
      if (ts != null && typeof (ts as Timestamp).toMillis === 'function') return new Date((ts as Timestamp).toMillis()).toISOString();
      return '';
    };

    const q = query(
      collection(db, 'posts'),
      orderBy('created_at', 'desc'),
      limit(150)
    );
    const snap = await getDocs(q);
    let posts: any[] = snap.docs
      .map((d) => {
        const data = d.data();
        return { id: d.id, ...data, created_at: normCreatedAt(data) };
      })
      .filter((p: any) => {
        if (p.is_vent && p.expires_at) return new Date(p.expires_at) > now;
        return true;
      });
    if (category && category !== 'All') posts = posts.filter((p: any) => p.category === category);

    if (uid && posts.length > 0) {
      const followingIds = await getFollowingIds();
      const followingSet = new Set(followingIds);
      const fromFollowed = posts.filter((p: any) => followingSet.has(p.user_id));
      const discovery = posts.filter((p: any) => !followingSet.has(p.user_id));
      posts = mergeFollowedAndDiscovery(fromFollowed, discovery).slice(0, 100);
    } else {
      posts = posts.slice(0, 100);
    }

    const withProfiles = await Promise.all(
      posts.map(async (post: any) => {
        let profile = null;
        const userSnap = await getDoc(doc(db, 'users', post.user_id));
        if (userSnap.exists()) {
          const d = userSnap.data();
          profile = { display_name: d?.display_name, anonymous_username: d?.anonymous_username, avatar_url: d?.avatar_url };
        }
        const post_stats = {
          upvotes_count: post.upvotes_count ?? 0,
          downvotes_count: post.downvotes_count ?? 0,
          views_count: post.views_count ?? 0,
          comments_count: post.comments_count ?? 0,
        };
        let userVote: 'upvote' | 'downvote' | null = null;
        if (uid) {
          const voteSnap = await getDocs(query(collection(db, 'postVotes'), where('post_id', '==', post.id), where('user_id', '==', uid), limit(1)));
          if (!voteSnap.empty) userVote = (voteSnap.docs[0].data().vote_type as 'upvote' | 'downvote') || null;
        }
        return { ...post, profiles: profile, post_stats, user_vote: userVote };
      })
    );
    return withProfiles;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
};



export const createPost = async (content: string, mediaUrl?: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const ref = await addDoc(collection(db, 'posts'), {
    content,
    media_url: mediaUrl ?? null,
    user_id: user.uid,
    created_at: new Date().toISOString(),
    upvotes_count: 0,
    downvotes_count: 0,
    views_count: 0,
    comments_count: 0,
  });
  return { id: ref.id, content, media_url: mediaUrl, user_id: user.uid, created_at: new Date().toISOString() };
};

export const deletePost = async (postId: string) => {
  try {
    await deleteDoc(doc(db, 'posts', postId));
    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    return false;
  }
};

async function setVote(postId: string, voteType: 'upvote' | 'downvote' | null) {
  const user = auth.currentUser;
  if (!user) return false;
  const voteId = `${postId}_${user.uid}`;
  const voteRef = doc(db, 'postVotes', voteId);
  const postRef = doc(db, 'posts', postId);
  const voteSnap = await getDoc(voteRef);
  const old = voteSnap.exists() ? (voteSnap.data()?.vote_type as 'upvote' | 'downvote') : null;
  let deltaUp = 0,
    deltaDown = 0;
  if (old === 'upvote') deltaUp -= 1;
  if (old === 'downvote') deltaDown -= 1;
  if (voteType === 'upvote') deltaUp += 1;
  if (voteType === 'downvote') deltaDown += 1;
  const batch = writeBatch(db);
  if (voteType) batch.set(voteRef, { post_id: postId, user_id: user.uid, vote_type: voteType }, { merge: true });
  else if (voteSnap.exists()) batch.delete(voteRef);
  batch.update(postRef, { upvotes_count: increment(deltaUp), downvotes_count: increment(deltaDown) });
  await batch.commit();
  return true;
}
export const upvotePost = async (postId: string) => {
  try {
    await setVote(postId, 'upvote');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  } catch (error) {
    console.error('Error upvoting post:', error);
    return false;
  }
};
export const downvotePost = async (postId: string) => {
  try {
    await setVote(postId, 'downvote');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  } catch (error) {
    console.error('Error downvoting post:', error);
    return false;
  }
};
export const removeVote = async (postId: string) => {
  try {
    await setVote(postId, null);
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
export const addComment = async (postId: string, content: string, parentCommentId?: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const ref = await addDoc(collection(db, 'comments'), {
    post_id: postId,
    user_id: user.uid,
    content,
    parent_comment_id: parentCommentId || null,
    created_at: new Date().toISOString(),
  });
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const u = userSnap.data();
  const profiles = u ? { display_name: u.display_name, anonymous_username: u.anonymous_username, avatar_url: u.avatar_url } : null;
  await updateDoc(doc(db, 'posts', postId), { comments_count: increment(1) });
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return { id: ref.id, content, created_at: new Date().toISOString(), parent_comment_id: parentCommentId || null, profiles };
};

export const fetchComments = async (postId: string) => {
  try {
    const q = query(collection(db, 'comments'), where('post_id', '==', postId), orderBy('created_at', 'asc'));
    const snap = await getDocs(q);
    const comments = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const userSnap = await getDoc(doc(db, 'users', data.user_id));
        const u = userSnap.data();
        return {
          id: d.id,
          content: data.content,
          created_at: data.created_at,
          parent_comment_id: data.parent_comment_id || null,
          profiles: u ? { display_name: u.display_name, anonymous_username: u.anonymous_username, avatar_url: u.avatar_url } : null,
        };
      })
    );
    const parentComments = comments.filter((c: any) => !c.parent_comment_id);
    const replies = comments.filter((c: any) => c.parent_comment_id);
    return parentComments.map((parent: any) => ({ ...parent, replies: replies.filter((r: any) => r.parent_comment_id === parent.id) }));
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
};

export const addReply = async (postId: string, parentCommentId: string, content: string) => {
  return addComment(postId, content, parentCommentId);
};

export const deleteComment = async (commentId: string) => {
  try {
    const c = await getDoc(doc(db, 'comments', commentId));
    if (c.exists()) await updateDoc(doc(db, 'posts', c.data().post_id), { comments_count: increment(-1) });
    await deleteDoc(doc(db, 'comments', commentId));
    return true;
  } catch (error) {
    console.error('Error deleting comment:', error);
    return false;
  }
};

export const getCommentCount = async (postId: string) => {
  try {
    const snap = await getDocs(query(collection(db, 'comments'), where('post_id', '==', postId)));
    return snap.size;
  } catch (error) {
    console.error('Error getting comment count:', error);
    return 0;
  }
};

export const fetchUserProfile = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (snap.exists()) return { id: user.uid, ...snap.data() };
  await setDoc(doc(db, 'users', user.uid), { display_name: null, anonymous_username: null, avatar_url: null, is_premium: false, is_admin: false, is_staff: false, created_at: new Date().toISOString() });
  return { id: user.uid, display_name: null, anonymous_username: null, avatar_url: null, is_premium: false, is_admin: false, is_staff: false };
};

export const updateUserProfile = async (updates: {
  display_name?: string; anonymous_username?: string; avatar_url?: string;
  message_preference?: string; auto_join_groups?: boolean; available_for_matches?: boolean; match_struggles?: string[];
}) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  const userRef = doc(db, 'users', user.uid);
  await setDoc(userRef, updates as any, { merge: true });
  const snap = await getDoc(userRef);
  return { id: user.uid, ...snap.data() };
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
    const user = auth.currentUser;
    if (!user) return;

    if (user.uid === postUserId) {
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
            content: `You're a real friend replying to someone's post in a feed. Reply in 1-3 short sentences max. Sound like a human: use contractions, vary your tone (warm, wry, or just real—match the post). React to what they actually said; don't give advice unless it fits.
Never use: "That's so valid", "Thank you for sharing", "It's great that you're", "I hear you", "You've got this", "Sending love", "That takes courage", or any list of three generic encouragements. No emojis. No "Remember that..." or "Just remember...". If the post is heavy, one genuine line beats a paragraph of support. If it's light, be brief and natural.`,
          },
          {
            role: 'user',
            content: `Reply to this post like a friend would (one short response):\n\n"""${content}"""`,
          },
        ],
        max_tokens: 120,
        temperature: 0.85,
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

/** Generate a playful challenge idea: name, goal, description, duration. Returns null if no API key or parse fails. */
export const generateChallengeIdeas = async (): Promise<{ name: string; goal: string; description: string; duration: number } | null> => {
  try {
    const apiKey =
      (Constants as any)?.expoConfig?.extra?.openaiApiKey ||
      (Constants as any)?.manifest?.extra?.openaiApiKey;
    if (!apiKey) return null;

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
            content: `You're a hype-person for a fun streak app. You ONLY respond with valid JSON. Format: {"name":"...","goal":"...","description":"...","duration":N}

name = short, punchy, memorable (like a band name or a dare). Be playful, weird, catchy—zero corporate speak. Examples: "No Screens Before Beams", "Chaos Mode", "Mismatched Socks Week".
goal = what people actually do daily, specific and a bit silly or wholesome.
description = 1-3 sentences that explain what the challenge is and what you do. Keep it direct and neutral—no cutesy stuff like "unleash your inner", "embrace the quirkiness", "giggle", "step into fun", or inspirational fluff. Just the facts with a bit of vibe.
duration = number of days (between 3 and 21).`,
          },
          {
            role: 'user',
            content: 'Give me one random challenge idea. JSON only.',
          },
        ],
        max_tokens: 220,
        temperature: 0.95,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    const goal = typeof parsed?.goal === 'string' ? parsed.goal.trim() : '';
    const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';
    let duration = typeof parsed?.duration === 'number' ? parsed.duration : 7;
    if (duration < 1 || duration > 365) duration = 7;
    if (!name || !goal) return null;
    return { name, goal, description: description || goal, duration };
  } catch (e) {
    console.error('generateChallengeIdeas', e);
    return null;
  }
};

// ========================================
// FOLLOW FUNCTIONS
// ========================================
export const followUser = async (userId: string) => {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    if (user.uid === userId) return false;
    const followId = `${user.uid}_${userId}`;
    await setDoc(doc(db, 'followers', followId), { follower_id: user.uid, following_id: userId, created_at: new Date().toISOString() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    console.error('Error following user:', error);
    return false;
  }
};

export const unfollowUser = async (userId: string) => {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const followId = `${user.uid}_${userId}`;
    await deleteDoc(doc(db, 'followers', followId));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return false;
  }
};

export const isFollowing = async (userId: string) => {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const snap = await getDoc(doc(db, 'followers', `${user.uid}_${userId}`));
    return snap.exists();
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
};

export const getUserProfile = async (userId: string) => {
  try {
    const profileSnap = await getDoc(doc(db, 'users', userId));
    if (!profileSnap.exists()) return null;
    const profile = { id: userId, ...profileSnap.data() };
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('user_id', '==', userId), orderBy('created_at', 'desc'), limit(50)));
    const postsWithStats = postsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        content: data.content,
        media_url: data.media_url,
        created_at: data.created_at,
        post_stats: {
          upvotes_count: data.upvotes_count ?? 0,
          downvotes_count: data.downvotes_count ?? 0,
          views_count: data.views_count ?? 0,
          comments_count: data.comments_count ?? 0,
        },
      };
    });
    const isFollowingUser = await isFollowing(userId);
    return { ...profile, posts: postsWithStats, isFollowing: isFollowingUser };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

export const getFollowers = async (userId: string) => {
  try {
    const snap = await getDocs(query(collection(db, 'followers'), where('following_id', '==', userId), orderBy('created_at', 'desc')));
    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const profileSnap = await getDoc(doc(db, 'users', data.follower_id));
        const p = profileSnap.data();
        return { created_at: data.created_at, profiles: p ? { id: data.follower_id, display_name: p.display_name, anonymous_username: p.anonymous_username, avatar_url: p.avatar_url } : null };
      })
    );
    return list;
  } catch (error) {
    console.error('Error getting followers:', error);
    return [];
  }
};

export const getFollowing = async (userId: string) => {
  try {
    const snap = await getDocs(query(collection(db, 'followers'), where('follower_id', '==', userId), orderBy('created_at', 'desc')));
    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const profileSnap = await getDoc(doc(db, 'users', data.following_id));
        const p = profileSnap.data();
        return { created_at: data.created_at, profiles: p ? { id: data.following_id, display_name: p.display_name, anonymous_username: p.anonymous_username, avatar_url: p.avatar_url } : null };
      })
    );
    return list;
  } catch (error) {
    console.error('Error getting following:', error);
    return [];
  }
};

/** Returns just the user IDs that the current user follows (for feed algorithm). */
export const getFollowingIds = async (): Promise<string[]> => {
  try {
    const user = auth.currentUser;
    if (!user) return [];
    const snap = await getDocs(query(collection(db, 'followers'), where('follower_id', '==', user.uid)));
    return snap.docs.map((d) => d.data().following_id as string).filter(Boolean);
  } catch (error) {
    console.error('Error getting following IDs:', error);
    return [];
  }
};

// ========================================
// ADMIN / STAFF
// ========================================
/** Returns { is_admin, is_staff } for the current user. Defaults to false if missing (e.g. existing docs). */
export const getCurrentUserRole = async (): Promise<{ is_admin: boolean; is_staff: boolean }> => {
  const user = auth.currentUser;
  if (!user) return { is_admin: false, is_staff: false };
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.data();
    return {
      is_admin: !!data?.is_admin,
      is_staff: !!data?.is_staff,
    };
  } catch {
    return { is_admin: false, is_staff: false };
  }
};

/** Admin-only: create a staff account via Cloud Function. Staff get emailVerified: true automatically. */
export const createStaffUser = async (
  staffEmail: string,
  staffPassword: string,
  staffDisplayName?: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const createStaff = httpsCallable<{ staffEmail: string; staffPassword: string; staffDisplayName?: string }, { ok: boolean }>(functions, 'createStaffUser');
    await createStaff({
      staffEmail: staffEmail.trim(),
      staffPassword,
      staffDisplayName: staffDisplayName?.trim() || undefined,
    });
    return { ok: true };
  } catch (e: any) {
    const code = e?.code;
    const msg = e?.message || '';
    if (code === 'functions/already-exists' || msg.includes('already registered')) return { ok: false, error: 'That email is already registered.' };
    if (code === 'functions/permission-denied') return { ok: false, error: 'Only admins can add staff.' };
    if (code === 'functions/unauthenticated') return { ok: false, error: 'Please log in again.' };
    if (code === 'functions/invalid-argument') return { ok: false, error: e?.message || 'Invalid email or password (min 6 characters).' };
    return { ok: false, error: e?.message || 'Could not create staff. Deploy the Cloud Function if you haven’t.' };
  }
};

/** Record a login event (call after successful sign-in). */
export const recordLogin = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'login_logs'), {
      user_id: user.uid,
      logged_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Could not record login', e);
  }
};

/** Admin-only: get login counts per day for the last N days. */
export const getLoginStatsForAdmin = async (days: number = 30): Promise<{ date: string; count: number }[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  const roleSnap = await getDoc(doc(db, 'users', user.uid));
  if (!roleSnap.data()?.is_admin) return [];

  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const q = query(
    collection(db, 'login_logs'),
    where('logged_at', '>=', startIso),
    orderBy('logged_at', 'asc')
  );
  const snap = await getDocs(q);
  const byDay: Record<string, number> = {};
  for (let d = 0; d <= days; d++) {
    const dte = new Date(start);
    dte.setDate(dte.getDate() + d);
    byDay[dte.toISOString().split('T')[0]] = 0;
  }
  snap.docs.forEach((docSnap) => {
    const at = docSnap.data().logged_at;
    if (typeof at === 'string') {
      const day = at.split('T')[0];
      byDay[day] = (byDay[day] ?? 0) + 1;
    }
  });
  return Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
};

// ========================================
// MESSAGING FUNCTIONS
// ========================================

function conversationId(a: string, b: string) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export const getOrCreateConversation = async (userId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const recipientSnap = await getDoc(doc(db, 'users', userId));
  const messagePreference = recipientSnap.data()?.message_preference;
  if (messagePreference === 'none') throw new Error('This user is not accepting messages');
  const p1 = user.uid < userId ? user.uid : userId;
  const p2 = user.uid < userId ? userId : user.uid;
  const convId = conversationId(user.uid, userId);
  const convRef = doc(db, 'conversations', convId);
  const existing = await getDoc(convRef);
  if (existing.exists()) return { id: convId, ...existing.data(), participant1_id: p1, participant2_id: p2 };
  const status = messagePreference === 'direct' ? 'accepted' : 'pending';
  const now = new Date().toISOString();
  await setDoc(convRef, { participant1_id: p1, participant2_id: p2, status, updated_at: now, created_at: now });
  return { id: convId, participant1_id: p1, participant2_id: p2, status, updated_at: now, created_at: now };
};

export const sendMessage = async (conversationId: string, content: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'messages'), { conversation_id: conversationId, sender_id: user.uid, content, created_at: now });
  await updateDoc(doc(db, 'conversations', conversationId), { updated_at: now });
  return { id: ref.id, conversation_id: conversationId, sender_id: user.uid, content, created_at: now };
};

export const fetchMessages = async (convId: string, limitCount = 50) => {
  try {
    const snap = await getDocs(
      query(collection(db, 'messages'), where('conversation_id', '==', convId), orderBy('created_at', 'asc'), limit(limitCount))
    );
    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const senderSnap = await getDoc(doc(db, 'users', data.sender_id));
        const s = senderSnap.data();
        const sender = s ? { id: data.sender_id, display_name: s.display_name, anonymous_username: s.anonymous_username, avatar_url: s.avatar_url } : null;
        return { id: d.id, ...data, sender };
      })
    );
    return list;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

// Query without orderBy so it works even while composite index is building; sort in memory.
export const getConversations = async () => {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q1 = query(collection(db, 'conversations'), where('participant1_id', '==', user.uid), where('status', '==', 'accepted'));
    const q2 = query(collection(db, 'conversations'), where('participant2_id', '==', user.uid), where('status', '==', 'accepted'));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const convs: any[] = [];
    const seen = new Set<string>();
    for (const s of [snap1, snap2]) {
      for (const d of s.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data();
        const otherId = data.participant1_id === user.uid ? data.participant2_id : data.participant1_id;
        const otherSnap = await getDoc(doc(db, 'users', otherId));
        const other = otherSnap.data();
        const otherUser = other ? { id: otherId, display_name: other.display_name, anonymous_username: other.anonymous_username, avatar_url: other.avatar_url } : null;
        convs.push({ id: d.id, ...data, participant1: otherUser, participant2: otherUser, otherUser, isMuted: false, last_message: [] });
      }
    }
    convs.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return convs;
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};

export const getPendingRequests = async () => {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'conversations'), where('participant2_id', '==', user.uid), where('status', '==', 'pending'))
    );
    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const otherSnap = await getDoc(doc(db, 'users', data.participant1_id));
        const other = otherSnap.data();
        const otherUser = other ? { id: data.participant1_id, display_name: other.display_name, anonymous_username: other.anonymous_username, avatar_url: other.avatar_url } : null;
        const msgSnap = await getDocs(query(collection(db, 'messages'), where('conversation_id', '==', d.id), orderBy('created_at', 'asc'), limit(1)));
        const firstMessage = msgSnap.empty ? null : { id: msgSnap.docs[0].id, ...msgSnap.docs[0].data() };
        return { id: d.id, ...data, otherUser, firstMessage };
      })
    );
    list.sort((a: any, b: any) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return list;
  } catch (error: any) {
    console.error('Error fetching pending requests:', error);
    return [];
  }
};

export const acceptMessageRequest = async (conversationId: string) => {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), { status: 'accepted' });
    return true;
  } catch (error) {
    console.error('Error accepting message request:', error);
    return false;
  }
};

export const declineMessageRequest = async (conversationId: string) => {
  try {
    const msgSnap = await getDocs(query(collection(db, 'messages'), where('conversation_id', '==', conversationId)));
    const batch = writeBatch(db);
    msgSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'conversations', conversationId));
    await batch.commit();
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

export const createGroup = async (name: string, description: string, category: string = 'general', isPublic: boolean = true, coverImageUrl?: string | null) => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const now = new Date().toISOString();
    const groupRef = await addDoc(collection(db, 'groups'), {
      name, description, category, creator_id: user.uid, is_public: isPublic, cover_image_url: coverImageUrl || null, created_at: now,
    });
    const groupId = groupRef.id;
    await setDoc(doc(db, 'group_members', `${groupId}_${user.uid}`), { group_id: groupId, user_id: user.uid, role: 'creator' });
    const activities = [
      { activity_type: 'meditation', name: 'Daily Meditation', description: 'Share your meditation practice' },
      { activity_type: 'journaling', name: 'Daily Journaling', description: 'Write about your day' },
      { activity_type: 'gratitude', name: 'Gratitude Sharing', description: 'Share what you\'re grateful for' },
    ];
    for (const a of activities) {
      await addDoc(collection(db, 'group_activities'), { group_id: groupId, ...a, created_at: now });
    }
    return { id: groupId, name, description, category, creator_id: user.uid, is_public: isPublic, cover_image_url: coverImageUrl || null, created_at: now };
  } catch (error) {
    console.error('Error creating group:', error);
    return null;
  }
};

// Query without orderBy to avoid composite index; sort in memory.
export const getGroups = async (includePrivate: boolean = false, category?: string) => {
  const user = auth.currentUser;
  try {
    const constraints: any[] = [];
    if (!includePrivate) constraints.push(where('is_public', '==', true));
    if (category && category !== 'All') constraints.push(where('category', '==', category));
    const snap = await getDocs(query(collection(db, 'groups'), ...constraints));
    const groupsWithCreator = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const creatorSnap = await getDoc(doc(db, 'users', data.creator_id));
        const creator = creatorSnap.exists() ? { id: data.creator_id, ...creatorSnap.data() } : null;
        return { id: d.id, ...data, creator };
      })
    );
    const groupsWithStats = await Promise.all(
      groupsWithCreator.map(async (group: any) => {
        const membersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', group.id)));
        const isMember = user ? (group.creator_id === user.uid || membersSnap.docs.some((m) => m.data().user_id === user.uid)) : false;
        return { ...group, member_count: membersSnap.size || 1, is_member: isMember };
      })
    );
    groupsWithStats.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return groupsWithStats;
  } catch (error) {
    console.error('Error getting groups:', error);
    return [];
  }
};

export const getGroup = async (groupId: string) => {
  const user = auth.currentUser;
  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists()) return null;
    const groupData = groupSnap.data();
    const creatorSnap = await getDoc(doc(db, 'users', groupData.creator_id));
    const data = { ...groupData, creator: creatorSnap.exists() ? { id: groupData.creator_id, ...creatorSnap.data() } : null };
    const membersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', groupId)));
    const isMember = user ? (data.creator_id === user.uid || membersSnap.docs.some((m) => m.data().user_id === user.uid)) : false;
    return { ...data, member_count: membersSnap.size || 1, is_member: isMember };
  } catch (error) {
    console.error('Error getting group:', error);
    return null;
  }
};

export const joinGroup = async (groupId: string) => {
  const user = auth.currentUser;
  if (!user) {
    Alert.alert('Error', 'You must be logged in to join a group');
    return false;
  }
  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists()) {
      Alert.alert('Error', 'Group not found');
      return false;
    }
    const groupData = groupSnap.data()!;
    if (groupData.creator_id === user.uid) return true;
    const memberId = `${groupId}_${user.uid}`;
    const existing = await getDoc(doc(db, 'group_members', memberId));
    if (existing.exists()) return true;
    const memberData: any = { group_id: groupId, user_id: user.uid, role: 'member' };
    if (groupData.is_challenge) {
      memberData.current_streak = 0;
      memberData.last_proof_date = null;
      memberData.completed_at = null;
    }
    await setDoc(doc(db, 'group_members', memberId), memberData);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error: any) {
    console.error('Error joining group:', error);
    Alert.alert('Error', error.message || 'Failed to join group');
    return false;
  }
};

export const leaveGroup = async (groupId: string) => {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await deleteDoc(doc(db, 'group_members', `${groupId}_${user.uid}`));
    return true;
  } catch (error) {
    console.error('Error leaving group:', error);
    return false;
  }
};

// ========================================
// CHALLENGE GROUPS (gamified streak: goal + duration, camera proof, per-member streak, complete then leave)
// ========================================

/** Fun challenge categories: value for storage, label for UI. Admin picks one when creating; users filter by these. */
export const CHALLENGE_CATEGORIES = [
  { value: 'fitness', label: '💪 Fitness' },
  { value: 'chaos', label: '🎲 Chaos & silly' },
  { value: 'mindfulness', label: '🧘 Mindfulness' },
  { value: 'habits', label: '✅ Daily habits' },
  { value: 'creative', label: '🎨 Creative' },
  { value: 'social', label: '👋 Social' },
  { value: 'noscreen', label: '📵 No-screen' },
  { value: 'food', label: '🍳 Food & drink' },
  { value: 'other', label: '✨ Other' },
] as const;

/** Create a challenge group: one goal, N days. Each member has own streak; when streak >= duration they can leave. */
export const createChallengeGroup = async (
  name: string,
  goal: string,
  durationDays: number,
  description?: string,
  managedByAdmin?: boolean,
  challengeCategory?: string
): Promise<{ id: string } | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  if (!name.trim() || !goal.trim() || durationDays < 1 || durationDays > 365) return null;
  let setManagedByAdmin = false;
  if (managedByAdmin) {
    const roleSnap = await getDoc(doc(db, 'users', user.uid));
    if (roleSnap.exists() && roleSnap.data()?.is_admin) setManagedByAdmin = true;
  }
  const categoryValue = challengeCategory && CHALLENGE_CATEGORIES.some((c) => c.value === challengeCategory) ? challengeCategory : 'other';
  try {
    const now = new Date().toISOString();
    const groupRef = await addDoc(collection(db, 'groups'), {
      name: name.trim(),
      description: (description || '').trim() || goal.trim(),
      category: 'challenge',
      creator_id: user.uid,
      is_public: true,
      cover_image_url: null,
      created_at: now,
      is_challenge: true,
      challenge_goal: goal.trim(),
      challenge_duration_days: Math.round(durationDays),
      managed_by_admin: setManagedByAdmin,
      challenge_category: categoryValue,
    });
    const groupId = groupRef.id;
    await setDoc(doc(db, 'group_members', `${groupId}_${user.uid}`), {
      group_id: groupId,
      user_id: user.uid,
      role: 'creator',
      current_streak: 0,
      last_proof_date: null,
      completed_at: null,
    });
    return { id: groupId };
  } catch (error) {
    console.error('Error creating challenge group:', error);
    return null;
  }
};

/** Submit proof for today (image URL after client upload). Updates per-member streak; if streak >= duration, marks completed. */
export const submitChallengeProof = async (groupId: string, imageUrl: string): Promise<{ current_streak: number; completed: boolean } | null> => {
  const user = auth.currentUser;
  if (!user || !imageUrl.trim()) return null;
  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists() || !groupSnap.data()?.is_challenge) return null;
    const duration = groupSnap.data()?.challenge_duration_days ?? 7;
    const memberId = `${groupId}_${user.uid}`;
    const memberSnap = await getDoc(doc(db, 'group_members', memberId));
    if (!memberSnap.exists()) return null;
    const today = new Date().toISOString().slice(0, 10);
    const proofRef = collection(db, 'group_streak_proofs');
    const existingProof = await getDocs(
      query(proofRef, where('group_id', '==', groupId), where('user_id', '==', user.uid), where('date', '==', today), limit(1))
    );
    if (!existingProof.empty) return null;
    await addDoc(proofRef, {
      group_id: groupId,
      user_id: user.uid,
      date: today,
      image_url: imageUrl.trim(),
      created_at: new Date().toISOString(),
    });
    const data = memberSnap.data()!;
    const last = data.last_proof_date || null;
    const prevStreak = data.current_streak ?? 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const newStreak = last === yesterdayStr ? prevStreak + 1 : 1;
    const completed = newStreak >= duration;
    await updateDoc(doc(db, 'group_members', memberId), {
      current_streak: newStreak,
      last_proof_date: today,
      ...(completed ? { completed_at: new Date().toISOString() } : {}),
    });
    return { current_streak: newStreak, completed };
  } catch (error) {
    console.error('Error submitting challenge proof:', error);
    return null;
  }
};

/** Get challenge progress: group + members with streak/completed + who posted today. */
export const getChallengeProgress = async (groupId: string): Promise<{
  group: any;
  members: { user_id: string; display_name?: string; anonymous_username?: string; current_streak: number; completed_at: string | null; has_proof_today: boolean }[];
  myMember: { current_streak: number; completed_at: string | null; last_proof_date: string | null } | null;
} | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists()) return null;
    const group = { id: groupSnap.id, ...groupSnap.data() };
    const membersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', groupId)));
    const today = new Date().toISOString().slice(0, 10);
    const proofsSnap = await getDocs(
      query(collection(db, 'group_streak_proofs'), where('group_id', '==', groupId), where('date', '==', today))
    );
    const proofUserIds = new Set(proofsSnap.docs.map((d) => d.data().user_id));
    const members: { user_id: string; display_name?: string; anonymous_username?: string; current_streak: number; completed_at: string | null; has_proof_today: boolean }[] = [];
    for (const d of membersSnap.docs) {
      const m = d.data();
      const profileSnap = await getDoc(doc(db, 'users', m.user_id));
      const p = profileSnap.data() || {};
      members.push({
        user_id: m.user_id,
        display_name: p.display_name ?? undefined,
        anonymous_username: p.anonymous_username ?? undefined,
        current_streak: m.current_streak ?? 0,
        completed_at: m.completed_at ?? null,
        has_proof_today: proofUserIds.has(m.user_id),
      });
    }
    const myDoc = membersSnap.docs.find((d) => d.data().user_id === user.uid);
    const myMember = myDoc
      ? {
          current_streak: myDoc.data().current_streak ?? 0,
          completed_at: myDoc.data().completed_at ?? null,
          last_proof_date: myDoc.data().last_proof_date ?? null,
        }
      : null;
    return { group, members, myMember };
  } catch (error) {
    console.error('Error getting challenge progress:', error);
    return null;
  }
};

/** Leave a challenge: allowed if completed, or if forfeit is true. */
export const leaveChallengeGroup = async (groupId: string, forfeit: boolean = false): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const memberId = `${groupId}_${user.uid}`;
    const memberSnap = await getDoc(doc(db, 'group_members', memberId));
    if (!memberSnap.exists()) return false;
    const data = memberSnap.data()!;
    if (data.completed_at) {
      await deleteDoc(doc(db, 'group_members', memberId));
      return true;
    }
    if (forfeit) {
      await deleteDoc(doc(db, 'group_members', memberId));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error leaving challenge group:', error);
    return false;
  }
};

/** List official (admin-managed) challenge groups. Query without orderBy to avoid index; sort in memory. */
export const getOfficialChallenges = async (category?: string): Promise<any[]> => {
  try {
    const q = query(
      collection(db, 'groups'),
      where('is_challenge', '==', true),
      where('managed_by_admin', '==', true),
      limit(50)
    );
    const snap = await getDocs(q);
    let list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const creatorSnap = await getDoc(doc(db, 'users', data.creator_id));
        const creator = creatorSnap.exists() ? { id: data.creator_id, ...creatorSnap.data() } : null;
        const membersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', d.id)));
        const isMember = auth.currentUser
          ? membersSnap.docs.some((m) => m.data().user_id === auth.currentUser?.uid)
          : false;
        return {
          id: d.id,
          ...data,
          challenge_category: data.challenge_category || 'other',
          creator,
          member_count: membersSnap.size,
          is_member: isMember,
        };
      })
    );
    list.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    if (category && category !== 'All') {
      list = list.filter((c) => (c.challenge_category || 'other') === category);
    }
    return list;
  } catch (error) {
    console.error('Error getting official challenges:', error);
    return [];
  }
};

/** Check if user already posted proof today for this challenge. */
export const hasProofToday = async (groupId: string): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getDocs(
    query(
      collection(db, 'group_streak_proofs'),
      where('group_id', '==', groupId),
      where('user_id', '==', user.uid),
      where('date', '==', today),
      limit(1)
    )
  );
  return !snap.empty;
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
export const checkPremiumStatus = async () => {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return !!snap.data()?.is_premium;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
};

export const activatePremium = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  try {
    await updateDoc(doc(db, 'users', user.uid), { is_premium: true, premium_activated_at: new Date().toISOString() });
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
      "One thing you're grateful for today—one short sentence, like a note to yourself. Specific and ordinary (e.g. coffee, a text back, quiet morning). No 'I am grateful for' if you can say it more naturally.",
      "A single sentence about something small that felt good recently. No inspirational quotes or 'blessed'. Just a real moment.",
      "One line: something or someone that made your week a bit easier. Plain language.",
    ];

    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

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
            content: `Write one short gratitude line (1 sentence, maybe 2). Sound like a real person jotting it down—concrete and specific, not a greeting card. No "I'm grateful for", "blessed", "truly", or "reminder that". No emojis.`,
          },
          {
            role: 'user',
            content: randomPrompt,
          },
        ],
        max_tokens: 80,
        temperature: 0.9,
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

export const cancelPremium = async (): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  try {
    await updateDoc(doc(db, 'users', user.uid), { is_premium: false, premium_expires_at: null });
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
            content: `You write one reflection question (1-2 sentences) based on someone's recent posts and mood. Sound like a curious, grounded person—not a textbook therapist. Ask one specific question that ties to what they actually shared. Never use: "How does that make you feel?", "What might you take away?", "What would it mean to...?", or "Where do you think that comes from?" Be direct and concrete. No "It can be helpful to..." or "Consider...".`,
          },
          {
            role: 'user',
            content: `Their recent activity:\n\n${context || 'No recent activity available.'}\n\nWrite one reflection question that feels tailored to this person.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.85,
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
            content: `Summarize their week in 1-2 plain sentences, then give 2-3 short insights (each one line). Write like a person, not a report: varied phrasing, no "Great job!", "Keep it up!", "You're doing great!", or "Remember to be kind to yourself." Be specific to the numbers and trend. Insights can be direct ("You logged mood most days—see if mornings vs evenings differ") or gentle; avoid generic self-care lists.`,
          },
          {
            role: 'user',
            content: `Their week: ${posts.length} posts, ${moods.length} mood entries, trend: ${moodTrend}, average mood: ${moods.length > 0 ? (moods.reduce((s: number, m: any) => s + m.mood_value, 0) / moods.length).toFixed(1) : 'N/A'}. Write a short summary and 2-3 one-line insights.`,
          },
        ],
        max_tokens: 280,
        temperature: 0.8,
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
// ANONYMOUS MATCHING FUNCTIONS (Firestore)
// ========================================

// Get available users for matching (those who opted in). Excludes users we already sent a request to.
export const getAvailableUsers = async (category?: string): Promise<any[]> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];

    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('available_for_matches', '==', true),
      limit(100)
    );
    const snap = await getDocs(q);
    let list: any[] = [];
    snap.docs.forEach((d) => {
      if (d.id === uid) return;
      const data = d.data();
      list.push({
        id: d.id,
        display_name: data.display_name ?? null,
        anonymous_username: data.anonymous_username ?? null,
        avatar_url: data.avatar_url ?? null,
        match_struggles: data.match_struggles ?? [],
      });
    });

    const sentRequestSnap = await getDocs(
      query(
        collection(db, 'match_requests'),
        where('sender_id', '==', uid),
        limit(100)
      )
    );
    const alreadyRequestedIds = new Set(
      sentRequestSnap.docs
        .filter((d) => d.data().status === 'pending' || d.data().status === 'accepted')
        .map((d) => d.data().receiver_id)
    );
    list = list.filter((u: any) => !alreadyRequestedIds.has(u.id));

    if (category && category !== 'All' && list.length > 0) {
      list = list.filter((u: any) => (u.match_struggles || []).includes(category));
    }
    return list;
  } catch (error) {
    console.error('Error getting available users:', error);
    return [];
  }
};

// Send a match request to a specific user
export const sendMatchRequest = async (targetUserId: string): Promise<string | null> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;

    const requestsRef = collection(db, 'match_requests');
    const existingSnap = await getDocs(
      query(
        requestsRef,
        where('sender_id', '==', uid),
        where('receiver_id', '==', targetUserId),
        limit(1)
      )
    );
    if (!existingSnap.empty) {
      const status = existingSnap.docs[0].data().status;
      if (status === 'pending' || status === 'accepted') return null;
    }

    const ref = await addDoc(requestsRef, {
      sender_id: uid,
      receiver_id: targetUserId,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    return ref.id;
  } catch (error) {
    console.error('Error sending match request:', error);
    return null;
  }
};

// Subscribe to pending match requests in real time (requests sent TO current user). Returns unsubscribe.
export const subscribeToMatchRequests = (onUpdate: (requests: any[]) => void): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const requestsRef = collection(db, 'match_requests');
  const q = query(
    requestsRef,
    where('receiver_id', '==', uid),
    where('status', '==', 'pending'),
    limit(50)
  );
  const unsub = onSnapshot(
    q,
    async (snap) => {
      const requests = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), created_at: (d.data() as any).created_at || '' }))
        .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      const senderIds = [...new Set(requests.map((r: any) => r.sender_id))];
      const profiles: Record<string, any> = {};
      for (const sid of senderIds) {
        const userSnap = await getDoc(doc(db, 'users', sid));
        if (userSnap.exists()) {
          const d = userSnap.data();
          profiles[sid] = {
            id: sid,
            display_name: d?.display_name ?? null,
            anonymous_username: d?.anonymous_username ?? null,
            avatar_url: d?.avatar_url ?? null,
            match_struggles: d?.match_struggles ?? [],
          };
        }
      }
      onUpdate(requests.map((r: any) => ({ ...r, profiles: profiles[r.sender_id] || null })));
    },
    (err) => console.error('subscribeToMatchRequests', err)
  );
  return unsub;
};

// Get pending match requests (requests sent to current user)
export const getPendingMatchRequests = async (): Promise<any[]> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];

    const requestsRef = collection(db, 'match_requests');
    const snap = await getDocs(
      query(
        requestsRef,
        where('receiver_id', '==', uid),
        where('status', '==', 'pending'),
        limit(50)
      )
    );
    if (snap.empty) return [];

    const requests = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), created_at: (d.data() as any).created_at || '' }))
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    const senderIds = [...new Set(requests.map((r: any) => r.sender_id))];
    const profiles: Record<string, any> = {};
    for (const sid of senderIds) {
      const userSnap = await getDoc(doc(db, 'users', sid));
      if (userSnap.exists()) {
        const d = userSnap.data();
        profiles[sid] = {
          id: sid,
          display_name: d?.display_name ?? null,
          anonymous_username: d?.anonymous_username ?? null,
          avatar_url: d?.avatar_url ?? null,
          match_struggles: d?.match_struggles ?? [],
        };
      }
    }
    return requests.map((r: any) => ({
      ...r,
      profiles: profiles[r.sender_id] || null,
    }));
  } catch (error) {
    console.error('Error getting pending match requests:', error);
    return [];
  }
};

// Accept a match request
export const acceptMatchRequest = async (requestId: string): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const requestRef = doc(db, 'match_requests', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) return false;
    const data = requestSnap.data()!;
    if (data.receiver_id !== uid || data.status !== 'pending') return false;

    // No time limit: set far future so match never auto-expires
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 100);

    const matchRef = await addDoc(collection(db, 'anonymous_matches'), {
      user1_id: data.sender_id,
      user2_id: data.receiver_id,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    });
    await updateDoc(requestRef, { status: 'accepted' });
    // Notify the sender (person who sent the request) that they were accepted
    try {
      const notifRef = collection(db, 'notifications');
      await addDoc(notifRef, {
        recipient_id: data.sender_id,
        type: 'match_accepted',
        created_at: new Date().toISOString(),
        read: false,
        match_id: matchRef.id,
        from_user_id: uid,
        request_id: requestId,
      });
      sendPushToUser(
        data.sender_id,
        'Match accepted',
        "Someone accepted your match request. Tap to open the chat!",
        { type: 'match_accepted', match_id: matchRef.id }
      );
    } catch (e) {
      console.warn('Failed to create match_accepted notification', e);
    }
    return true;
  } catch (error) {
    console.error('Error accepting match request:', error);
    return false;
  }
};

// Decline a match request
export const declineMatchRequest = async (requestId: string): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const requestRef = doc(db, 'match_requests', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) return false;
    if (requestSnap.data()!.receiver_id !== uid) return false;
    await updateDoc(requestRef, { status: 'declined' });
    return true;
  } catch (error) {
    console.error('Error declining match request:', error);
    return false;
  }
};

// Get partner's display name for match header (display_name or anonymous_username)
export const getPartnerProfile = async (partnerId: string): Promise<{ display_name?: string; anonymous_username?: string } | null> => {
  try {
    if (!partnerId) return null;
    const userSnap = await getDoc(doc(db, 'users', partnerId));
    if (!userSnap.exists()) return null;
    const d = userSnap.data() as any;
    return {
      display_name: d?.display_name ?? undefined,
      anonymous_username: d?.anonymous_username ?? undefined,
    };
  } catch (error) {
    console.error('Error getting partner profile:', error);
    return null;
  }
};

// Get active match (query by user1_id or user2_id)
export const getActiveMatch = async (): Promise<{
  id: string;
  partnerId: string;
  expiresAt: string;
  timeRemaining: number;
} | null> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;

    const matchesRef = collection(db, 'anonymous_matches');
    const [snap1, snap2] = await Promise.all([
      getDocs(query(matchesRef, where('user1_id', '==', uid), where('status', '==', 'active'), limit(5))),
      getDocs(query(matchesRef, where('user2_id', '==', uid), where('status', '==', 'active'), limit(5))),
    ]);
    const asMatch = (d: any) => ({ id: d.id, ...d.data() });
    const from1 = snap1.docs.map((d) => asMatch(d));
    const from2 = snap2.docs.map((d) => asMatch(d));
    const match = [...from1, ...from2].find((m) => m.status === 'active');
    if (!match) return null;

    const partnerId = match.user1_id === uid ? match.user2_id : match.user1_id;
    // No time limit: matches don't expire
    return {
      id: match.id,
      partnerId,
      expiresAt: match.expires_at || '',
      timeRemaining: 999999,
    };
  } catch (error) {
    console.error('Error getting active match:', error);
    return null;
  }
};

// Real-time subscription: when someone accepts your request, you see the active match immediately
export const subscribeToActiveMatch = (
  onUpdate: (match: { id: string; partnerId: string; expiresAt: string; timeRemaining: number } | null) => void
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const matchesRef = collection(db, 'anonymous_matches');
  const q1 = query(matchesRef, where('user1_id', '==', uid), where('status', '==', 'active'), limit(5));
  const q2 = query(matchesRef, where('user2_id', '==', uid), where('status', '==', 'active'), limit(5));

  const refresh = () => {
    getActiveMatch().then((m) => onUpdate(m));
  };

  const unsub1 = onSnapshot(q1, refresh, (err) => console.error('subscribeToActiveMatch (user1)', err));
  const unsub2 = onSnapshot(q2, refresh, (err) => console.error('subscribeToActiveMatch (user2)', err));

  return () => {
    unsub1();
    unsub2();
  };
};

// Extend match time (add 15 more minutes)
export const extendMatch = async (matchId: string): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const matchRef = doc(db, 'anonymous_matches', matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) return false;
    const d = matchSnap.data()!;
    if (d.user1_id !== uid && d.user2_id !== uid) return false;

    const currentExpiry = new Date(d.expires_at);
    currentExpiry.setMinutes(currentExpiry.getMinutes() + 15);
    await updateDoc(matchRef, { expires_at: currentExpiry.toISOString() });
    return true;
  } catch (error) {
    console.error('Error extending match:', error);
    return false;
  }
};

// End match gracefully (Unfriend)
export const endMatch = async (matchId: string): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const matchRef = doc(db, 'anonymous_matches', matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) return false;
    const d = matchSnap.data()!;
    if (d.user1_id !== uid && d.user2_id !== uid) return false;
    await updateDoc(matchRef, { status: 'ended' });
    return true;
  } catch (error) {
    console.error('Error ending match:', error);
    return false;
  }
};

const GAME_LABELS: Record<string, string> = {
  tictactoe: 'Tic-Tac-Toe',
  chess: 'Chess',
};

async function sendPushToUser(
  recipientId: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  try {
    const sendPush = httpsCallable<
      { recipientId: string; title: string; body: string; data?: Record<string, string> },
      { ok: boolean; error?: string }
    >(functions, 'sendExpoPush');
    await sendPush({ recipientId, title, body, data });
  } catch (e) {
    console.warn('Push send failed', e);
  }
}

// Send a game invite to your match partner (in-app notification + push to tray)
export const sendGameInvite = async (
  partnerId: string,
  matchId: string,
  gameType: string
): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;
    if (!partnerId || partnerId === uid) return false;

    // If we already have a recent pending invite from our partner for this same game,
    // don't send a new invite back (prevents "both users invite each other" spam).
    try {
      const matchRef = doc(db, 'anonymous_matches', matchId);
      const snap = await getDoc(matchRef);
      if (snap.exists()) {
        const inv = (snap.data() as any)?.last_game_invite;
        const createdAt = inv?.created_at ? Date.parse(inv.created_at) : 0;
        const isRecent = createdAt && (Date.now() - createdAt) < 2 * 60 * 1000; // 2 min
        if (
          inv?.status === 'pending' &&
          (inv?.game_type || '') === (gameType || '') &&
          inv?.from_user_id === partnerId &&
          isRecent
        ) {
          return true;
        }
      }
    } catch (_) {
      // ignore and continue sending
    }

    const notifRef = collection(db, 'notifications');
    await addDoc(notifRef, {
      recipient_id: partnerId,
      type: 'game_invite',
      created_at: new Date().toISOString(),
      read: false,
      from_user_id: uid,
      match_id: matchId,
      room_id: matchId,
      game_type: gameType,
    });
    const now = new Date().toISOString();
    const matchRef = doc(db, 'anonymous_matches', matchId);
    await updateDoc(matchRef, {
      last_game_invite: {
        game_type: gameType,
        from_user_id: uid,
        status: 'pending',
        created_at: now,
      },
    });
    const gameLabel = GAME_LABELS[gameType] || gameType;
    sendPushToUser(
      partnerId,
      'Game invite',
      `Your match invited you to play ${gameLabel}.`,
      { type: 'game_invite', match_id: matchId, game_type: gameType }
    );
    return true;
  } catch (error) {
    console.error('Error sending game invite:', error);
    return false;
  }
};

// Called when recipient taps "Later" so the sender can see the invite was declined
export const setGameInviteDeclined = async (matchId: string): Promise<void> => {
  try {
    const matchRef = doc(db, 'anonymous_matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const prev = data?.last_game_invite || {};
    await updateDoc(matchRef, {
      last_game_invite: {
        ...prev,
        status: 'declined',
        game_type: prev.game_type || '',
        from_user_id: prev.from_user_id || '',
        created_at: prev.created_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error setting game invite declined:', error);
  }
};

// Subscribe to match doc so sender can see when their game invite was declined
export const subscribeToMatchGameInviteStatus = (
  matchId: string,
  gameType: string,
  onDeclined: () => void
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !matchId) return () => {};

  const matchRef = doc(db, 'anonymous_matches', matchId);
  const unsub = onSnapshot(
    matchRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const inv = data?.last_game_invite;
      if (
        inv?.from_user_id === uid &&
        (inv?.game_type || '') === (gameType || '') &&
        inv?.status === 'declined'
      ) {
        onDeclined();
      }
    },
    (err) => console.error('subscribeToMatchGameInviteStatus', err)
  );
  return unsub;
};

// Subscribe to game invites (so we can show in-app alert when partner invites you)
export const subscribeToGameInvites = (
  onInvites: (invites: { id: string; game_type: string; match_id: string; from_user_id: string; read: boolean }[]) => void
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const notifRef = collection(db, 'notifications');
  const q = query(
    notifRef,
    where('recipient_id', '==', uid),
    where('type', '==', 'game_invite'),
    limit(30)
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      const invites = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          game_type: data.game_type || 'tictactoe',
          match_id: data.match_id || '',
          from_user_id: data.from_user_id || '',
          read: !!data.read,
          created_at: data.created_at || '',
        };
      });
      invites.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      onInvites(invites);
    },
    (err) => console.error('subscribeToGameInvites', err)
  );
  return unsub;
};

// Subscribe to unread notification count (for tab + app icon badge)
export const subscribeToUnreadNotificationCount = (onCount: (count: number) => void): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const notifRef = collection(db, 'notifications');
  const q = query(
    notifRef,
    where('recipient_id', '==', uid),
    where('read', '==', false),
    limit(500)
  );
  const unsub = onSnapshot(
    q,
    (snap) => onCount(snap.size),
    (err) => console.error('subscribeToUnreadNotificationCount', err)
  );
  return unsub;
};

// Get match conversation (messages between matched users)
// Query without orderBy so it works even while composite index is building; we sort in memory.
export const getMatchMessages = async (matchId: string): Promise<any[]> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];

    const messagesRef = collection(db, 'match_messages');
    const snap = await getDocs(
      query(
        messagesRef,
        where('match_id', '==', matchId),
        limit(200)
      )
    );
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), created_at: (d.data() as any).created_at || '' }));
    list.sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
    return list;
  } catch (error) {
    console.error('Error getting match messages:', error);
    return [];
  }
};

// Real-time subscription for match messages (no orderBy = works while index is building; sort in memory)
export const subscribeToMatchMessages = (
  matchId: string,
  onMessages: (messages: any[]) => void
): (() => void) => {
  if (!matchId) return () => {};

  const messagesRef = collection(db, 'match_messages');
  const q = query(
    messagesRef,
    where('match_id', '==', matchId),
    limit(200)
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), created_at: (d.data() as any).created_at || '' }));
      list.sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
      onMessages(list);
    },
    (err) => console.error('subscribeToMatchMessages', err)
  );
  return unsub;
};

// Send message in match
export const sendMatchMessage = async (matchId: string, content: string): Promise<any | null> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;

    const ref = await addDoc(collection(db, 'match_messages'), {
      match_id: matchId,
      sender_id: uid,
      content,
      created_at: new Date().toISOString(),
    });
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Error sending match message:', error);
    return null;
  }
};

// Unread notification count (for badge)
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return 0;
    const notifRef = collection(db, 'notifications');
    const snap = await getDocs(
      query(
        notifRef,
        where('recipient_id', '==', uid),
        where('read', '==', false),
        limit(200)
      )
    );
    return snap.size;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
};

// In-app notifications
export const getNotifications = async (): Promise<any[]> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];

    const notifRef = collection(db, 'notifications');
    const snap = await getDocs(
      query(
        notifRef,
        where('recipient_id', '==', uid),
        limit(100)
      )
    );
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), created_at: (d.data() as any).created_at || '' }))
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    const fromIds = [...new Set(list.map((n: any) => n.from_user_id).filter(Boolean))];
    const profiles: Record<string, any> = {};
    for (const fid of fromIds) {
      const userSnap = await getDoc(doc(db, 'users', fid));
      if (userSnap.exists()) {
        const d = userSnap.data();
        profiles[fid] = {
          id: fid,
          display_name: d?.display_name ?? null,
          anonymous_username: d?.anonymous_username ?? null,
          avatar_url: d?.avatar_url ?? null,
        };
      }
    }
    return list.map((n: any) => ({
      ...n,
      profiles: n.from_user_id ? (profiles[n.from_user_id] || { id: n.from_user_id }) : { id: '' },
    }));
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
};

export const markNotificationRead = async (notificationId: string): Promise<boolean> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;
    const ref = doc(db, 'notifications', notificationId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data()?.recipient_id !== uid) return false;
    await updateDoc(ref, { read: true });
    return true;
  } catch (error) {
    console.error('Error marking notification read:', error);
    return false;
  }
};

// Default export for React component compatibility
export default function Functions() {
  return null; // This is just a utility file, not a component
}