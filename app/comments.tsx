import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    addComment,
    addReply,
    deleteComment,
    fetchComments,
    fetchPosts,
    formatTimeAgo,
    Post
} from './functions';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  parent_comment_id?: string;
  user_id: string;
  profiles: {
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  } | null;
  replies: Comment[];
}

// TwitterVideo component for comments
const TwitterVideo = ({ videoUrl, postId }: { videoUrl: string; postId: string }) => {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    player.muted = true;
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const onProfilePress = (userId: string) => {
    router.push(`/profile?userId=${userId}` as any);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  useEffect(() => {
    if (postId) {
      loadData();
    }
  }, [postId]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load both post and comments
      const [postsData, commentsData] = await Promise.all([
        fetchPosts(),
        fetchComments(postId)
      ]);
      
      // Find the specific post
      const currentPost = postsData.find(p => p.id === postId);
      console.log('Found post:', currentPost);
      console.log('Post content:', currentPost?.content);
      console.log('Post media_url:', currentPost?.media_url);
      setPost(currentPost || null);
      setComments(commentsData);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load post and comments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !postId) return;

    try {
      const comment = await addComment(postId, newComment.trim());
      setComments(prev => [comment, ...prev]);
      setNewComment('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', 'Failed to add comment');
    }
  };

  const handleAddReply = async (parentCommentId: string) => {
    if (!replyText.trim() || !postId) return;

    try {
      const reply = await addReply(postId, parentCommentId, replyText.trim());
      setComments(prev => 
        prev.map(comment => 
          comment.id === parentCommentId 
            ? { ...comment, replies: [...(comment.replies || []), reply] }
            : comment
        )
      );
      setReplyText('');
      setReplyingTo(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error adding reply:', error);
      Alert.alert('Error', 'Failed to add reply');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteComment(commentId);
              if (success) {
                setComments(prev => 
                  prev.filter(comment => comment.id !== commentId)
                );
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (error) {
              console.error('Error deleting comment:', error);
              Alert.alert('Error', 'Failed to delete comment');
            }
          }
        }
      ]
    );
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const displayName = comment.profiles?.display_name || comment.profiles?.anonymous_username || 'Anonymous';
    
    return (
      <View key={comment.id} style={[styles.commentContainer, isReply && styles.replyContainer]}>
        <View style={styles.commentHeader}>
          <Pressable 
            style={styles.commentAvatar}
            onPress={() => onProfilePress(comment.user_id)}
          >
            {comment.profiles?.avatar_url ? (
              <Image source={{ uri: comment.profiles.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.defaultAvatar}>
                <Text style={styles.defaultAvatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          
          <View style={styles.commentContent}>
            <View style={styles.commentHeaderInfo}>
              <Text style={styles.commentAuthor}>{displayName}</Text>
              <Text style={styles.commentTime}>{formatTimeAgo(comment.created_at)}</Text>
            </View>
            
            <Text style={styles.commentText}>{comment.content}</Text>
            
            <View style={styles.commentActions}>
              <Pressable 
                style={styles.commentAction}
                onPress={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              >
                <Text style={styles.commentActionText}>Reply</Text>
              </Pressable>
              
              <Pressable 
                style={styles.commentAction}
                onPress={() => handleDeleteComment(comment.id)}
              >
                <Text style={[styles.commentActionText, styles.deleteAction]}>Delete</Text>
              </Pressable>
            </View>
            
            {/* Reply Input */}
            {replyingTo === comment.id && (
              <View style={styles.replyInputContainer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Write a reply..."
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  maxLength={500}
                />
                <View style={styles.replyActions}>
                  <Pressable 
                    style={styles.replyCancelButton}
                    onPress={() => {
                      setReplyingTo(null);
                      setReplyText('');
                    }}
                  >
                    <Text style={styles.replyCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.replySubmitButton, !replyText.trim() && styles.disabledButton]}
                    onPress={() => handleAddReply(comment.id)}
                    disabled={!replyText.trim()}
                  >
                    <Text style={styles.replySubmitText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            )}
            
            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
              <View style={styles.repliesContainer}>
                {comment.replies.map(reply => renderComment(reply, true))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading comments...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.commentsList}
          contentContainerStyle={styles.commentsContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Post Context */}
          {post && (
            <View style={styles.postContext}>
              <View style={styles.postHeader}>
                <Pressable 
                  style={styles.postAvatar}
                  onPress={() => onProfilePress(post.user_id)}
                >
                  {post.profiles?.avatar_url ? (
                    <Image source={{ uri: post.profiles.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.defaultAvatar}>
                      <Text style={styles.defaultAvatarText}>
                        {(post.profiles?.display_name || post.profiles?.anonymous_username || 'A').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <View style={styles.postUserInfo}>
                  <Text style={styles.postUsername}>
                    {post.profiles?.display_name || post.profiles?.anonymous_username || 'Anonymous'}
                  </Text>
                  <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.postContent}>{post.content}</Text>
              {post.media_url && (
                <View style={styles.postMediaContainer}>
                  {post.media_url.includes('video-data') ? (
                    <TwitterVideo videoUrl={post.media_url} postId={post.id} />
                  ) : (
                    <Image source={{ uri: post.media_url }} style={styles.postMedia} />
                  )}
                </View>
              )}
            </View>
          )}

          {/* Comments */}
          {comments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No comments yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to comment!</Text>
            </View>
          ) : (
            comments.map(comment => renderComment(comment))
          )}
        </ScrollView>
        
        {/* Comment Input */}
        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 16 }]}>
          <TextInput
            style={styles.commentInput}
            placeholder="Write a comment..."
            value={newComment}
            onChangeText={setNewComment}
            multiline
            maxLength={500}
          />
          <Pressable 
            style={[styles.submitButton, !newComment.trim() && styles.disabledButton]}
            onPress={handleAddComment}
            disabled={!newComment.trim()}
          >
            <Text style={styles.submitButtonText}>Post</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  commentsList: {
    flex: 1,
  },
  commentsContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  },
  postContext: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postAvatar: {
    marginRight: 12,
  },
  postUserInfo: {
    flex: 1,
  },
  postUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  postTime: {
    fontSize: 12,
    color: '#666',
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
  },
  postMedia: {
    width: '100%',
    height: 200,
    borderRadius: 8,
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
  commentContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  replyContainer: {
    marginLeft: 20,
    marginTop: 8,
    backgroundColor: '#f8f9fa',
  },
  commentHeader: {
    flexDirection: 'row',
  },
  commentAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  defaultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  commentHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
    color: '#666',
  },
  commentText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  commentActions: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  commentAction: {
    marginRight: 16,
  },
  commentActionText: {
    fontSize: 14,
    color: '#ec4899',
    fontWeight: '500',
  },
  deleteAction: {
    color: '#ff4444',
  },
  replyInputContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  replyInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    maxHeight: 100,
    marginBottom: 8,
  },
  replyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  replyCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  replyCancelText: {
    color: '#666',
    fontSize: 14,
  },
  replySubmitButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  replySubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  repliesContainer: {
    marginTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e5e9',
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
  },
  submitButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});
