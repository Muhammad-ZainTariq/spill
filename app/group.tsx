    import { Feather } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db, getDownloadURL, ref, storage, uploadBytes } from '../lib/firebase';
import {
    acceptStreak,
    checkInToStreak,
    createStreak,
    formatTimeAgo,
    getAvailableStreaks,
    getCurrentUserRole,
    getGroup,
    getGroupMembers,
    getGroupMessages,
    getUserStreaks,
    GroupMessage,
    isGroupAdmin,
    issueWarningToMember,
    removeMemberFromGroup,
    sendGroupMessage,
    updateGroupCoverImage,
    updateGroupSettings
} from './functions';

    export default function GroupScreen() {
    const { groupId, tab } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    
    const [group, setGroup] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isAdmin, setIsAdminState] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [isMember, setIsMember] = useState(false);
    const [messagesKey, setMessagesKey] = useState(0);
    const [typingUsers, setTypingUsers] = useState<{ [userId: string]: { name: string; timestamp: number } }>({});
    
    // Settings state
    const [allowPosting, setAllowPosting] = useState(true);
    const [allowMessaging, setAllowMessaging] = useState(true);
    const [requiresApproval, setRequiresApproval] = useState(false);
    
    // Streaks state
    const [activeTab, setActiveTab] = useState<'chat' | 'streaks'>((tab === 'streaks' ? 'streaks' : 'chat') as 'chat' | 'streaks');
    const [availableStreaks, setAvailableStreaks] = useState<any[]>([]);
    const [userStreaks, setUserStreaks] = useState<any[]>([]);
    const [loadingStreaks, setLoadingStreaks] = useState(false);
    // Animated bottom position for floating input bar
    // IDLE: 8px above bottom safe area
    // ACTIVE: keyboardHeight + safeArea + 8px above keyboard
    const IDLE_BOTTOM = 8;
    const animBottom = useRef(new Animated.Value(IDLE_BOTTOM)).current;
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [showCreateStreakModal, setShowCreateStreakModal] = useState(false);
    const [newStreakName, setNewStreakName] = useState('');
    const [newStreakDescription, setNewStreakDescription] = useState('');
    const [creatingStreak, setCreatingStreak] = useState(false);
    // Challenge (gamified streak) state
    const [challengeProgress, setChallengeProgress] = useState<{ group: any; members: any[]; myMember: any } | null>(null);
    const [loadingChallenge, setLoadingChallenge] = useState(false);
    const [showChallengeModal, setShowChallengeModal] = useState(false);
    const [isAppAdmin, setIsAppAdmin] = useState(false);

    // Keyboard listeners for smooth input bar animation
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const keyboardWillShow = Keyboard.addListener(showEvent, (e) => {
            setIsKeyboardVisible(true);
            const keyboardHeightValue = e.endCoordinates.height;
            setKeyboardHeight(keyboardHeightValue);
            
            // Calculate bottom position: keyboard height + safe area + 8px gap
            const targetBottom = keyboardHeightValue + insets.bottom + 8;
            
            // Animate input bar to sit 8px above keyboard
            Animated.timing(animBottom, {
                toValue: targetBottom,
                duration: Platform.OS === 'ios' ? (e.duration || 250) : 250,
                easing: Easing.out(Easing.ease),
                useNativeDriver: false, // Required for bottom positioning
            }).start();
            
            // Scroll to latest message (offset 0 for inverted list)
            setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 100);
        });

        const keyboardWillHide = Keyboard.addListener(hideEvent, (e) => {
            setIsKeyboardVisible(false);
            setKeyboardHeight(0);
            
            // Animate input bar back to idle position (8px above bottom)
            Animated.timing(animBottom, {
                toValue: IDLE_BOTTOM,
                duration: Platform.OS === 'ios' ? (e.duration || 250) : 250,
                easing: Easing.out(Easing.ease),
                useNativeDriver: false,
            }).start();
        });

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
        };
    }, [insets.bottom]);

    useEffect(() => {
        if (!groupId || typeof groupId !== 'string') return;

        setCurrentUserId(auth.currentUser?.uid ?? null);
        loadGroup();
        checkAdminStatus();
        setTimeout(() => loadMessages(), 100);

        const messagesPoll = setInterval(loadMessages, 5000);
        return () => {
            clearInterval(messagesPoll);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [groupId]);

    useEffect(() => {
        if (group) {
        setAllowPosting(group.allow_member_posting !== false);
        setAllowMessaging(group.allow_member_messaging !== false);
        setRequiresApproval(group.requires_approval === true);
        }
    }, [group]);

    // Reload messages when screen comes into focus
    useFocusEffect(
        useCallback(() => {
        if (groupId && typeof groupId === 'string' && isMember) {
            loadMessages();
            loadStreaks();
        }
        }, [groupId, isMember])
    );

    useFocusEffect(
        useCallback(() => {
            if (group?.is_challenge && groupId && typeof groupId === 'string') loadChallengeProgress();
        }, [group?.is_challenge, groupId, loadChallengeProgress])
    );

    useEffect(() => {
        getCurrentUserRole().then((r) => setIsAppAdmin(r.is_admin));
    }, []);

    // Load streaks
    const loadStreaks = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        try {
        setLoadingStreaks(true);
        const streaks = await getAvailableStreaks(groupId);
        setAvailableStreaks(streaks);
        
        // Get user's streaks with counts
        const myStreaks = await getUserStreaks(groupId);
        setUserStreaks(myStreaks);
        } catch (error) {
        console.error('Error loading streaks:', error);
        } finally {
        setLoadingStreaks(false);
        }
    };

    const loadChallengeProgress = useCallback(async () => {
        if (!groupId || typeof groupId !== 'string') return;
        setLoadingChallenge(true);
        const progress = await getChallengeProgress(groupId);
        setChallengeProgress(progress);
        setLoadingChallenge(false);
    }, [groupId]);

    // Polling fallback for messages (in case Realtime isn't working)
    useEffect(() => {
        if (!groupId || typeof groupId !== 'string' || !isMember) return;
        
        const pollInterval = setInterval(() => {
        loadMessages();
        }, 2000); // Check every 2 seconds
        
        return () => clearInterval(pollInterval);
    }, [groupId, isMember]);

    const loadGroup = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        try {
        setLoading(true);
        const groupData = await getGroup(groupId);
        setGroup(groupData);
        if (groupData) {
            const uid = auth.currentUser?.uid;
            const isCreator = uid === groupData.creator_id;
            const isMemberCheck = groupData.is_member || isCreator;
            setIsMember(isMemberCheck);
            
            // If creator, automatically check admin status
            if (isCreator) {
            setIsAdminState(true);
            }
            
            // Reload messages after confirming membership to ensure they're visible
            if (isMemberCheck) {
            await loadMessages();
            } else {
            // Clear messages if not a member
            setMessages([]);
            }
        }
        } catch (error) {
        console.error('Error loading group:', error);
        } finally {
        setLoading(false);
        }
    };

    const loadMessages = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        try {
        const msgs = await getGroupMessages(groupId);
        if (msgs && msgs.length > 0) {
            // Sort messages by created_at
            const sorted = msgs.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            // Only update if messages actually changed (avoid unnecessary re-renders)
            setMessages(prev => {
            const prevIds = new Set(prev.map(m => m.id));
            const newIds = new Set(sorted.map(m => m.id));
            
            // Check if there are new messages
            const hasNewMessages = sorted.some(m => !prevIds.has(m.id));
            const hasRemovedMessages = prev.some(m => !newIds.has(m.id));
            
            // Only update if there are actual changes
            if (hasNewMessages || hasRemovedMessages || prev.length !== sorted.length) {
                setMessagesKey(prev => prev + 1);
                return sorted;
            }
            
            return prev;
            });
            
            // Scroll to bottom if there are new messages
            setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
            }, 200);
        } else {
            setMessages([]);
        }
        } catch (error) {
        console.error('Error loading messages:', error);
        // Don't clear messages on error, might be RLS issue
        }
    };

    const checkAdminStatus = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        const admin = await isGroupAdmin(groupId);
        setIsAdminState(admin);
        if (admin) {
        loadMembers();
        }
    };

    const loadMembers = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        try {
        setLoadingMembers(true);
        const membersList = await getGroupMembers(groupId);
        setMembers(membersList);
        } catch (error) {
        console.error('Error loading members:', error);
        } finally {
        setLoadingMembers(false);
        }
    };

    const handleUpdateSettings = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        const success = await updateGroupSettings(groupId, {
        allow_member_posting: allowPosting,
        allow_member_messaging: allowMessaging,
        requires_approval: requiresApproval,
        });
        if (success) {
        Alert.alert('Success', 'Settings updated');
        setShowSettings(false);
        await loadGroup();
        }
    };

    const handleDeleteGroup = async () => {
        if (!groupId || typeof groupId !== 'string') return;
        Alert.alert(
        'Delete Group',
        'Are you sure you want to delete this group? This action cannot be undone.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
                const { deleteGroup } = await import('./functions');
                const success = await deleteGroup(groupId);
                if (success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
                }
            }
            }
        ]
        );
    };

    const handleRemoveMember = async (userId: string, username: string) => {
        if (!groupId || typeof groupId !== 'string') return;
        Alert.alert(
        'Remove Member',
        `Remove ${username} from this group?`,
        [
            { text: 'Cancel', style: 'cancel' },
            {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
                const success = await removeMemberFromGroup(groupId, userId);
                if (success) {
                await loadMembers();
                await loadGroup();
                }
            }
            }
        ]
        );
    };

    const handleIssueWarning = async (userId: string, username: string) => {
        if (!groupId || typeof groupId !== 'string') return;
        Alert.alert(
        'Issue Warning',
        `Issue a warning to ${username}?`,
        [
            { text: 'Cancel', style: 'cancel' },
            {
            text: 'Issue Warning',
            onPress: async () => {
                await issueWarningToMember(groupId, userId);
                await loadMembers();
            }
            }
        ]
        );
    };

    // Typing indicator handler with debouncing
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleTyping = useCallback(async (isTyping: boolean) => {
        if (!groupId || typeof groupId !== 'string') return;
        const user = auth.currentUser;
        if (!user) return;
        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        const profile = profileSnap.data();
        const userName = profile?.display_name || profile?.anonymous_username || 'Someone';
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (isTyping) typingTimeoutRef.current = setTimeout(() => {}, 2000);
    }, [groupId]);

    const handleCreateStreak = async () => {
        if (!newStreakName.trim() || !groupId || typeof groupId !== 'string') return;
        
        setCreatingStreak(true);
        try {
        const streak = await createStreak(groupId, newStreakName.trim(), newStreakDescription.trim() || undefined);
        if (streak) {
            setNewStreakName('');
            setNewStreakDescription('');
            setShowCreateStreakModal(false);
            await loadStreaks();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        } catch (error) {
        console.error('Error creating streak:', error);
        Alert.alert('Error', 'Failed to create streak');
        } finally {
        setCreatingStreak(false);
        }
    };

    const handleAcceptStreak = async (activityType: string) => {
        if (!groupId || typeof groupId !== 'string') return;
        
        try {
        const success = await acceptStreak(groupId, activityType);
        if (success) {
            await loadStreaks();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        } catch (error) {
        console.error('Error accepting streak:', error);
        Alert.alert('Error', 'Failed to accept streak');
        }
    };

    const handleCheckIn = async (activityType: string) => {
        if (!groupId || typeof groupId !== 'string') return;
        
        try {
        const update = await checkInToStreak(groupId, activityType);
        if (update) {
            await loadStreaks();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Checked in! 🔥');
        }
        } catch (error) {
        console.error('Error checking in:', error);
        Alert.alert('Error', 'Failed to check in');
        }
    };

    const handleSendMessage = async () => {
        if (!messageText.trim() || sending || !groupId || typeof groupId !== 'string') return;

        const content = messageText.trim();
        setMessageText('');
        setSending(true);
        
        // Stop typing indicator
        await handleTyping(false);
        
        try {
        const newMessage = await sendGroupMessage(groupId, content);
        if (newMessage) {
            // Immediately reload messages to ensure both sender and receiver see it
            await loadMessages();
            
            // Scroll to latest message (offset 0 for inverted list)
            setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 100);
            
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
            // Restore message text if send failed
            setMessageText(content);
        }
        } catch (error) {
        console.error('Error sending message:', error);
        setMessageText(content); // Restore message text
        } finally {
        setSending(false);
        }
    };

    const pickGroupImage = async () => {
        if (!isAdmin) {
        Alert.alert('Error', 'Only admins can change group image');
        return;
        }

        try {
        const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!req.granted) {
            Alert.alert('Permission required', 'Please allow photo library access.');
            return;
            }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
        });

        if (result.canceled || !groupId || typeof groupId !== 'string') return;

        setUploadingImage(true);
        const asset = result.assets[0];
        if (!auth.currentUser) return;

        const base64Data = await FileSystem.readAsStringAsync(asset.uri, { 
            encoding: FileSystem.EncodingType.Base64 
        });
        const byteArray = Buffer.from(base64Data, 'base64');

        const path = `groups/${groupId}/cover-${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, byteArray, { contentType: 'image/jpeg' });
        const publicUrl = await getDownloadURL(storageRef);
        const success = await updateGroupCoverImage(groupId, publicUrl);
        
        if (success) {
            await loadGroup();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        } catch (error) {
        console.error('Image picker error:', error);
        Alert.alert('Error', 'Could not pick image.');
        } finally {
        setUploadingImage(false);
        }
    };

    const renderMessage = ({ item }: { item: GroupMessage }) => {
        const isMe = item.user_id === currentUserId;
        const username = item.user?.display_name || item.user?.anonymous_username || 'Anonymous';
        
        return (
        <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
            {!isMe && (
            <View style={styles.messageAvatar}>
                {item.user?.avatar_url ? (
                <Image source={{ uri: item.user.avatar_url }} style={styles.avatarImage} />
                ) : (
                <View style={styles.defaultAvatar}>
                    <Text style={styles.defaultAvatarText}>{username[0]?.toUpperCase() || '?'}</Text>
                </View>
                )}
            </View>
            )}
            <View style={[styles.messageBubble, isMe && styles.messageBubbleMe]}>
            {!isMe && (
                <View style={styles.messageSenderContainer}>
                    <Text style={styles.messageSender}>{username}</Text>
                </View>
            )}
            <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.content}</Text>
            <View style={styles.messageTimeContainer}>
                <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
                    {formatTimeAgo(item.created_at)}
                </Text>
            </View>
            </View>
        </View>
        );
    };

    if (loading) {
        return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading group...</Text>
        </View>
        );
    }

    if (!group) {
        return (
        <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Group not found</Text>
        </View>
        );
    }

    return (
        <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable 
            style={styles.backButtonHeader}
            onPress={() => router.back()}
            >
            <Feather name="arrow-left" size={24} color="#333" />
            </Pressable>
            <Pressable 
            style={styles.headerInfo}
            onPress={isAdmin ? () => setShowSettings(!showSettings) : undefined}
            disabled={!isAdmin}
            >
            <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
            {group.description && (
                <Text style={styles.headerDescription} numberOfLines={1}>{group.description}</Text>
            )}
            </Pressable>
            <View style={{ width: 24 }} />
        </View>

        {/* Group Cover Image */}
        {group.cover_image_url && (
            <Image source={{ uri: group.cover_image_url }} style={styles.coverImage} />
        )}

        {/* Challenge summary (when this is a challenge group) */}
        {group.is_challenge && (
            <View style={styles.challengeCard}>
                {group.managed_by_admin && isAppAdmin && (
                    <Text style={styles.challengeManagedBy}>Managed by administration</Text>
                )}
                <Text style={styles.challengeGoal}>Goal: {group.challenge_goal}</Text>
                <Text style={styles.challengeDuration}>{group.challenge_duration_days} days in a row to complete</Text>
                {loadingChallenge ? (
                    <ActivityIndicator size="small" color="#ec4899" style={{ marginVertical: 8 }} />
                ) : challengeProgress?.myMember ? (
                    <View style={styles.challengeMyProgress}>
                        <Text style={styles.challengeMyStreak}>
                            Your streak: {challengeProgress.myMember.current_streak} / {group.challenge_duration_days}
                        </Text>
                        {challengeProgress.myMember.completed_at ? (
                            <Text style={styles.challengeCompleted}>Completed! You can leave.</Text>
                        ) : null}
                    </View>
                ) : null}
                {(isMember || group.creator_id === currentUserId) ? (
                    <View style={styles.challengeActions}>
                        <Pressable
                            style={styles.challengePostProofBtn}
                            onPress={() => {
                                if (!groupId || typeof groupId !== 'string') return;
                                router.push(`/challenge-proof?groupId=${groupId}` as any);
                            }}
                        >
                            <Feather name="camera" size={18} color="#fff" />
                            <Text style={styles.challengePostProofText}>Post proof</Text>
                        </Pressable>
                        <Pressable
                            style={styles.challengeViewAllBtn}
                            onPress={() => setShowChallengeModal(true)}
                        >
                            <Text style={styles.challengeViewAllText}>Challenge details</Text>
                            <Feather name="chevron-right" size={18} color="#ec4899" />
                        </Pressable>
                    </View>
                ) : null}
            </View>
        )}

        {!isMember && group.creator_id !== currentUserId ? (
            <View style={styles.joinPrompt}>
            <Text style={styles.joinPromptText}>Join this group to see messages and participate</Text>
            <Pressable
                style={styles.joinPromptButton}
                onPress={async () => {
                if (!groupId || typeof groupId !== 'string') return;
                const { joinGroup } = await import('./functions');
                const success = await joinGroup(groupId);
                if (success) {
                    // Reload everything
                    await loadGroup();
                    await loadMessages();
                    checkAdminStatus();
                }
                }}
            >
                <Text style={styles.joinPromptButtonText}>Join Group</Text>
            </Pressable>
            </View>
        ) : (
            <>
                {/* Messages List - Inverted for proper scrolling */}
                <View style={styles.messagesListContainer}>
                    <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    inverted={true}
                    contentContainerStyle={[
                        styles.messagesList,
                        { 
                            paddingTop: 90 + insets.bottom + 24, // INPUT_BAR_HEIGHT (56) + safe area + extra padding
                            paddingBottom: 20
                        }
                    ]}
                    extraData={messagesKey}
                    onContentSizeChange={() => {
                        // Auto-scroll to latest (offset 0 for inverted list)
                        if (messages.length > 0) {
                            setTimeout(() => {
                                flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                            }, 50);
                        }
                    }}
                    onLayout={() => {
                        // Initial scroll to latest message
                        if (messages.length > 0) {
                            setTimeout(() => {
                                flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                            }, 100);
                        }
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No messages yet</Text>
                        <Text style={styles.emptySubtext}>Start the conversation!</Text>
                        </View>
                    }
                    removeClippedSubviews={false}
                    windowSize={21}
                    initialNumToRender={20}
                    maxToRenderPerBatch={10}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    />
                </View>

                {/* Typing Indicator - Positioned above input bar */}
                {Object.keys(typingUsers).length > 0 && (
                    <Animated.View 
                        style={[
                            styles.typingIndicator,
                            {
                                bottom: Animated.add(
                                    animBottom,
                                    new Animated.Value(56) // INPUT_BAR_HEIGHT
                                )
                            }
                        ]}
                    >
                    <Text style={styles.typingText}>
                        {Object.values(typingUsers).map(u => u.name).join(', ')}
                        {Object.keys(typingUsers).length === 1 ? ' is' : ' are'} typing...
                    </Text>
                    </Animated.View>
                )}

                {/* Floating Message Input Bar - Absolutely positioned */}
                {(isMember || group.creator_id === currentUserId) && (
                    <Animated.View
                        style={[
                            styles.inputBarWrapper,
                            {
                                bottom: animBottom,
                                paddingBottom: insets.bottom,
                            }
                        ]}
                    >
                        {/* Solid background overlay to prevent messages showing through */}
                        <View style={styles.inputBarBackground} />
                        <View style={styles.inputContainer}>
                            <TextInput
                            style={styles.input}
                            value={messageText}
                            onChangeText={(text) => {
                            setMessageText(text);
                            // Send typing indicator
                            if (text.trim().length > 0) {
                                handleTyping(true);
                            } else {
                                handleTyping(false);
                            }
                            }}
                            placeholder="Type a message..."
                            placeholderTextColor="#999"
                            multiline
                            maxLength={1000}
                            onFocus={() => {
                            // Scroll to latest message when input is focused
                            setTimeout(() => {
                                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                            }, 150);
                            }}
                            />
                            <Pressable
                            style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
                            onPress={handleSendMessage}
                            disabled={!messageText.trim() || sending}
                            >
                            {sending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Feather name="send" size={20} color="#fff" />
                            )}
                            </Pressable>
                        </View>
                    </Animated.View>
                )}
            </>
        )}


        {/* Admin Settings Modal */}
        {showSettings && isAdmin && (
            <View style={styles.modalOverlay}>
            <ScrollView style={styles.settingsModal} contentContainerStyle={styles.settingsContent}>
                <View style={styles.settingsHeader}>
                <Text style={styles.settingsTitle}>Group Settings</Text>
                <Pressable onPress={() => setShowSettings(false)}>
                    <Feather name="x" size={24} color="#333" />
                </Pressable>
                </View>

                {/* Cover Image */}
                <Text style={styles.settingsSectionTitle}>Cover Image</Text>
                <Pressable style={styles.coverImageContainer} onPress={pickGroupImage} disabled={uploadingImage}>
                {group.cover_image_url ? (
                    <Image source={{ uri: group.cover_image_url }} style={styles.coverImagePreview} />
                ) : (
                    <View style={styles.coverImagePlaceholder}>
                    {uploadingImage ? (
                        <ActivityIndicator size="small" color="#ec4899" />
                    ) : (
                        <>
                        <Feather name="camera" size={32} color="#ec4899" />
                        <Text style={styles.coverImagePlaceholderText}>Add cover image</Text>
                        </>
                    )}
                    </View>
                )}
                </Pressable>
                {group.cover_image_url && (
                <Pressable 
                    onPress={async () => {
                    if (!groupId || typeof groupId !== 'string') return;
                    const success = await updateGroupCoverImage(groupId, null);
                    if (success) {
                        await loadGroup();
                    }
                    }} 
                    style={styles.removeImageButton}
                >
                    <Text style={styles.removeImageText}>Remove cover image</Text>
                </Pressable>
                )}

                <Text style={[styles.settingsSectionTitle, { marginTop: 24 }]}>Permissions</Text>
                
                <Pressable 
                    style={styles.settingRow} 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAllowPosting(!allowPosting);
                    }}
                >
                <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                        <Feather name="edit-3" size={16} color="#666" style={{ marginRight: 8 }} />
                        <Text style={styles.settingLabel}>Allow Member Posting</Text>
                    </View>
                    <Text style={styles.settingDescription}>Members can post daily updates</Text>
                </View>
                <View style={[styles.toggle, allowPosting && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, allowPosting && styles.toggleThumbActive]} />
                </View>
                </Pressable>

                <Pressable 
                    style={styles.settingRow} 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAllowMessaging(!allowMessaging);
                    }}
                >
                <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                        <Feather name="message-square" size={16} color="#666" style={{ marginRight: 8 }} />
                        <Text style={styles.settingLabel}>Allow Member Messaging</Text>
                    </View>
                    <Text style={styles.settingDescription}>Members can send messages in group chat</Text>
                </View>
                <View style={[styles.toggle, allowMessaging && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, allowMessaging && styles.toggleThumbActive]} />
                </View>
                </Pressable>

                <Pressable 
                    style={styles.settingRow} 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setRequiresApproval(!requiresApproval);
                    }}
                >
                <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                        <Feather name="shield" size={16} color="#666" style={{ marginRight: 8 }} />
                        <Text style={styles.settingLabel}>Require Approval</Text>
                    </View>
                    <Text style={styles.settingDescription}>New members need admin approval</Text>
                </View>
                <View style={[styles.toggle, requiresApproval && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, requiresApproval && styles.toggleThumbActive]} />
                </View>
                </Pressable>

                <Text style={[styles.settingsSectionTitle, { marginTop: 24 }]}>Members ({members.length})</Text>
                
                {loadingMembers ? (
                <ActivityIndicator size="small" color="#ec4899" style={{ marginVertical: 20 }} />
                ) : (
                members.map((member) => {
                    const username = member.user?.display_name || member.user?.anonymous_username || 'Anonymous';
                    const isCreator = member.role === 'creator';
                    const isCurrentUser = member.user_id === currentUserId;
                    
                    return (
                    <View key={member.id} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                        {member.user?.avatar_url ? (
                            <Image source={{ uri: member.user.avatar_url }} style={styles.memberAvatar} />
                        ) : (
                            <View style={[styles.defaultAvatar, styles.memberAvatar]}>
                            <Text style={styles.defaultAvatarText}>{username[0]?.toUpperCase() || '?'}</Text>
                            </View>
                        )}
                        <View>
                            <Text style={styles.memberName}>{username}</Text>
                            <Text style={styles.memberRole}>
                            {isCreator ? 'Creator' : member.role === 'admin' ? 'Admin' : 'Member'}
                            {member.warnings > 0 && ` • ${member.warnings} warning${member.warnings > 1 ? 's' : ''}`}
                            </Text>
                        </View>
                        </View>
                        {!isCurrentUser && !isCreator && (
                        <View style={styles.memberActions}>
                            {member.warnings < 3 && (
                            <Pressable
                                style={styles.warningButton}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    handleIssueWarning(member.user_id, username);
                                }}
                            >
                                <Feather name="alert-triangle" size={18} color="#f59e0b" />
                            </Pressable>
                            )}
                            <Pressable
                            style={styles.removeButton}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                handleRemoveMember(member.user_id, username);
                            }}
                            >
                            <Feather name="user-x" size={18} color="#ef4444" />
                            </Pressable>
                        </View>
                        )}
                    </View>
                    );
                })
                )}

                <Pressable 
                    style={styles.saveButton} 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        handleUpdateSettings();
                    }}
                >
                <Feather name="check" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Save Settings</Text>
                </Pressable>

                <Pressable 
                    style={styles.deleteButton} 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        handleDeleteGroup();
                    }}
                >
                <Feather name="trash-2" size={18} color="#ef4444" />
                <Text style={styles.deleteButtonText}>Delete Group</Text>
                </Pressable>
            </ScrollView>
            </View>
        )}

        {/* Challenge modal (goal, members, leave) */}
        {showChallengeModal && group.is_challenge && (
            <View style={styles.modalOverlay}>
                <View style={styles.challengeModal}>
                    <View style={styles.challengeModalHeader}>
                        <Text style={styles.challengeModalTitle}>Challenge</Text>
                        <Pressable onPress={() => setShowChallengeModal(false)}>
                            <Feather name="x" size={24} color="#333" />
                        </Pressable>
                    </View>
                    <ScrollView style={styles.challengeModalScroll} contentContainerStyle={styles.challengeModalContent}>
                        <Text style={styles.challengeModalGoal}>{group.challenge_goal}</Text>
                        <Text style={styles.challengeModalDuration}>{group.challenge_duration_days} days in a row • Post camera proof each day</Text>
                        {loadingChallenge ? (
                            <ActivityIndicator size="small" color="#ec4899" style={{ marginVertical: 16 }} />
                        ) : (
                            <>
                                <Text style={styles.challengeMembersTitle}>Members</Text>
                                {challengeProgress?.members.map((m) => (
                                    <View key={m.user_id} style={styles.challengeMemberRow}>
                                        <Text style={styles.challengeMemberName}>
                                            {m.display_name || m.anonymous_username || 'Anonymous'}
                                        </Text>
                                        <View style={styles.challengeMemberMeta}>
                                            {m.completed_at ? (
                                                <Text style={styles.challengeMemberDone}>Done</Text>
                                            ) : (
                                                <Text style={styles.challengeMemberStreak}>{m.current_streak} / {group.challenge_duration_days}</Text>
                                            )}
                                            {m.has_proof_today && <Text style={styles.challengeMemberToday}>Today ✓</Text>}
                                        </View>
                                    </View>
                                ))}
                                <Pressable
                                    style={styles.challengePostProofBtnModal}
                                    onPress={() => {
                                        setShowChallengeModal(false);
                                        if (groupId && typeof groupId === 'string') router.push(`/challenge-proof?groupId=${groupId}` as any);
                                    }}
                                >
                                    <Feather name="camera" size={18} color="#fff" />
                                    <Text style={styles.challengePostProofText}>Post proof</Text>
                                </Pressable>
                                {challengeProgress?.myMember && (
                                    <Pressable
                                        style={challengeProgress.myMember.completed_at ? styles.challengeLeaveBtn : styles.challengeLeaveBtnForfeit}
                                        onPress={async () => {
                                            if (!groupId || typeof groupId !== 'string') return;
                                            if (challengeProgress.myMember?.completed_at) {
                                                const ok = await leaveChallengeGroup(groupId, false);
                                                if (ok) {
                                                    setShowChallengeModal(false);
                                                    router.back();
                                                }
                                            } else {
                                                Alert.alert(
                                                    'Leave challenge?',
                                                    'You haven\'t completed the challenge. Leave anyway? (Your progress will be lost.)',
                                                    [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        {
                                                            text: 'Leave',
                                                            style: 'destructive',
                                                            onPress: async () => {
                                                                const ok = await leaveChallengeGroup(groupId, true);
                                                                if (ok) {
                                                                    setShowChallengeModal(false);
                                                                    router.back();
                                                                }
                                                            },
                                                        },
                                                    ]
                                                );
                                            }
                                        }}
                                    >
                                        <Text style={challengeProgress.myMember.completed_at ? styles.challengeLeaveText : styles.challengeLeaveTextForfeit}>
                                            {challengeProgress.myMember.completed_at ? 'Leave challenge' : 'Leave anyway (forfeit)'}
                                        </Text>
                                    </Pressable>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        )}

        {/* Streaks Modal */}
        {activeTab === 'streaks' && (
            <View style={styles.modalOverlay}>
            <View style={styles.streaksModal}>
                <View style={styles.streaksModalHeader}>
                <Text style={styles.streaksModalTitle}>Streaks 🔥</Text>
                <Pressable onPress={() => setActiveTab('chat')}>
                    <Feather name="x" size={24} color="#fff" />
                </Pressable>
                </View>
                <ScrollView 
                style={styles.streaksModalContent} 
                contentContainerStyle={styles.streaksContent}
                showsVerticalScrollIndicator={false}
                >
            {/* Create Streak Button - Floating Style */}
            <Pressable
                style={styles.createStreakButton}
                onPress={() => setShowCreateStreakModal(true)}
            >
                <View style={styles.createStreakIcon}>
                <Feather name="plus" size={24} color="#fff" />
                </View>
                <Text style={styles.createStreakButtonText}>Start New Streak</Text>
            </Pressable>

            {/* My Active Streaks - Snapchat Style */}
            {userStreaks.length > 0 && (
                <View style={styles.streaksSection}>
                <Text style={styles.sectionTitle}>My Streaks 🔥</Text>
                <View style={styles.streaksGrid}>
                    {userStreaks.map((streak) => {
                    const activity = availableStreaks.find(a => a.activity_type === streak.activity_type);
                    if (!activity) return null;
                    
                    return (
                        <Pressable
                        key={streak.id}
                        style={styles.streakCardSnap}
                        onPress={() => handleCheckIn(streak.activity_type)}
                        >
                        <View style={styles.streakFlameContainer}>
                            <Text style={styles.streakFlame}>🔥</Text>
                            <View style={styles.streakCountBadge}>
                            <Text style={styles.streakCountNumber}>{streak.current_streak}</Text>
                            </View>
                        </View>
                        <Text style={styles.streakNameSnap} numberOfLines={1}>{activity.name}</Text>
                        <Text style={styles.streakDaysText}>{streak.current_streak} day{streak.current_streak !== 1 ? 's' : ''}</Text>
                        </Pressable>
                    );
                    })}
                </View>
                </View>
            )}

            {/* Available Streaks - Clean Cards */}
            <View style={styles.streaksSection}>
                <Text style={styles.sectionTitle}>Join Streaks</Text>
                {loadingStreaks ? (
                <ActivityIndicator size="small" color="#ec4899" style={styles.loader} />
                ) : availableStreaks.length === 0 ? (
                <View style={styles.emptyStreaksContainer}>
                    <Text style={styles.emptyStreaksEmoji}>🔥</Text>
                    <Text style={styles.emptyStreaksText}>No streaks yet</Text>
                    <Text style={styles.emptyStreaksSubtext}>Start one to get the fire going!</Text>
                </View>
                ) : (
                availableStreaks
                    .filter(s => !s.is_accepted)
                    .map((streak) => (
                    <Pressable
                        key={streak.id}
                        style={styles.availableStreakCard}
                        onPress={() => handleAcceptStreak(streak.activity_type)}
                    >
                        <View style={styles.availableStreakContent}>
                        <View style={styles.availableStreakIcon}>
                            <Text style={styles.availableStreakEmoji}>🔥</Text>
                        </View>
                        <View style={styles.availableStreakInfo}>
                            <Text style={styles.availableStreakName}>{streak.name}</Text>
                            {streak.description && (
                            <Text style={styles.availableStreakDesc} numberOfLines={1}>{streak.description}</Text>
                            )}
                            <Text style={styles.availableStreakParticipants}>
                            {streak.participant_count} {streak.participant_count === 1 ? 'person' : 'people'} in this streak
                            </Text>
                        </View>
                        <View style={styles.acceptButtonCircle}>
                            <Feather name="plus" size={20} color="#fff" />
                        </View>
                        </View>
                    </Pressable>
                    ))
                )}
            </View>
                </ScrollView>
            </View>
            </View>
        )}

        {/* Create Streak Modal */}
        {showCreateStreakModal && (
            <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create New Streak</Text>
                <Pressable onPress={() => setShowCreateStreakModal(false)}>
                    <Feather name="x" size={24} color="#333" />
                </Pressable>
                </View>
                
                <TextInput
                style={styles.modalInput}
                placeholder="Streak name (e.g., Morning Run)"
                value={newStreakName}
                onChangeText={setNewStreakName}
                placeholderTextColor="#999"
                />
                
                <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                placeholder="Description (optional)"
                value={newStreakDescription}
                onChangeText={setNewStreakDescription}
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                />
                
                <View style={styles.modalActions}>
                <Pressable
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setShowCreateStreakModal(false)}
                >
                    <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                    style={[styles.modalButton, styles.modalButtonPrimary, (!newStreakName.trim() || creatingStreak) && styles.modalButtonDisabled]}
                    onPress={handleCreateStreak}
                    disabled={!newStreakName.trim() || creatingStreak}
                >
                    {creatingStreak ? (
                    <ActivityIndicator size="small" color="#fff" />
                    ) : (
                    <Text style={styles.modalButtonTextPrimary}>Create</Text>
                    )}
                </Pressable>
                </View>
            </View>
            </View>
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        paddingTop: 8,
        backgroundColor: '#fff',
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    backButtonHeader: {
        padding: 8,
        marginRight: 4,
        borderRadius: 20,
    },
    headerInfo: {
        flex: 1,
        marginLeft: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1a1a1a',
        letterSpacing: -0.3,
    },
    headerDescription: {
        fontSize: 13,
        color: '#999',
        marginTop: 2,
        fontWeight: '500',
    },
    coverImage: {
        width: '100%',
        height: 200,
        backgroundColor: '#f3f4f6',
    },
    imageOverlay: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 20,
    },
    coverPlaceholder: {
        width: '100%',
        height: 150,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#e1e5e9',
    },
    coverPlaceholderText: {
        marginTop: 8,
        fontSize: 14,
        color: '#ec4899',
        fontWeight: '600',
    },
    groupInfo: {
        backgroundColor: '#fff',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e1e5e9',
    },
    groupDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    messagesListContainer: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        overflow: 'hidden',
    },
    messagesList: {
        padding: 16,
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-end',
        paddingHorizontal: 4,
    },
    messageRowMe: {
        flexDirection: 'row-reverse',
    },
    messageAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 10,
        marginTop: 2,
    },
    avatarImage: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: '#fff',
    },
    defaultAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#ec4899',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    defaultAvatarText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    messageBubble: {
        maxWidth: '75%',
        backgroundColor: '#fff',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopLeftRadius: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    messageBubbleMe: {
        backgroundColor: '#ec4899',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 4,
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
    },
    messageSenderContainer: {
        marginBottom: 4,
    },
    messageSender: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ec4899',
        letterSpacing: 0.2,
    },
    messageText: {
        fontSize: 15,
        color: '#1a1a1a',
        lineHeight: 22,
        fontWeight: '400',
    },
    messageTextMe: {
        color: '#fff',
    },
    messageTimeContainer: {
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    messageTime: {
        fontSize: 10,
        color: '#999',
        fontWeight: '500',
    },
    messageTimeMe: {
        color: 'rgba(255,255,255,0.85)',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#666',
    },
    inputBarWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        width: '100%',
        borderTopWidth: 1,
        borderTopColor: '#e1e5e9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 10,
        zIndex: 999,
        overflow: 'hidden',
    },
    inputBarBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#ffffff',
    },
    inputContainer: {
        position: 'relative',
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        minHeight: 56,
    },
    input: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingVertical: 12,
        fontSize: 15,
        color: '#1a1a1a',
        maxHeight: 100,
        marginRight: 10,
        fontWeight: '400',
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ec4899',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    typingIndicator: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: '#f3f4f6',
        borderTopWidth: 1,
        borderTopColor: '#e1e5e9',
        zIndex: 998,
    },
    typingText: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    settingsModal: {
        backgroundColor: '#fff',
        borderRadius: 24,
        width: '90%',
        maxHeight: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 10,
    },
    settingsContent: {
        padding: 24,
    },
    settingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 28,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    settingsTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#1a1a1a',
        letterSpacing: -0.5,
    },
    settingsSectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1a1a1a',
        marginBottom: 16,
        marginTop: 8,
        letterSpacing: -0.3,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    settingInfo: {
        flex: 1,
        marginRight: 16,
    },
    settingLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    settingDescription: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
        fontWeight: '400',
    },
    toggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#e1e5e9',
        padding: 2,
    },
    toggleActive: {
        backgroundColor: '#ec4899',
    },
    toggleThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        transform: [{ translateX: 0 }],
    },
    toggleThumbActive: {
        transform: [{ translateX: 22 }],
    },
    memberRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    memberInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    memberAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#f0f0f0',
    },
    memberName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
        marginBottom: 2,
    },
    memberRole: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
        fontWeight: '500',
    },
    memberActions: {
        flexDirection: 'row',
        gap: 8,
    },
    warningButton: {
        padding: 10,
        borderRadius: 20,
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fef3c7',
    },
    removeButton: {
        padding: 10,
        borderRadius: 20,
        backgroundColor: '#fef2f2',
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    saveButton: {
        backgroundColor: '#ec4899',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 28,
        flexDirection: 'row',
        justifyContent: 'center',
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    coverImageContainer: {
        width: '100%',
        height: 150,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 8,
        backgroundColor: '#f3f4f6',
    },
    coverImagePreview: {
        width: '100%',
        height: '100%',
    },
    coverImagePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#ec4899',
        borderStyle: 'dashed',
        borderRadius: 12,
    },
    coverImagePlaceholderText: {
        marginTop: 8,
        fontSize: 14,
        color: '#ec4899',
        fontWeight: '600',
    },
    removeImageButton: {
        alignSelf: 'flex-end',
        marginBottom: 16,
    },
    removeImageText: {
        color: '#ef4444',
        fontSize: 14,
        fontWeight: '600',
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#ef4444',
        marginTop: 16,
        gap: 10,
        backgroundColor: '#fef2f2',
    },
    deleteButtonText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    joinPrompt: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    joinPromptText: {
        fontSize: 17,
        color: '#666',
        textAlign: 'center',
        marginBottom: 28,
        fontWeight: '500',
        lineHeight: 24,
    },
    joinPromptButton: {
        backgroundColor: '#ec4899',
        paddingHorizontal: 36,
        paddingVertical: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    joinPromptButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    challengeCard: {
        backgroundColor: '#fef3c7',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#fcd34d',
    },
    challengeManagedBy: { fontSize: 11, fontWeight: '700', color: '#b45309', marginBottom: 6 },
    challengeGoal: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
    challengeDuration: { fontSize: 13, color: '#64748b', marginTop: 4 },
    challengeMyProgress: { marginTop: 10 },
    challengeMyStreak: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    challengeCompleted: { fontSize: 13, color: '#10b981', marginTop: 4, fontWeight: '600' },
    challengeActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    challengePostProofBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#ec4899',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    challengePostProofText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    challengeViewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    challengeViewAllText: { fontSize: 14, fontWeight: '600', color: '#ec4899' },
    challengeModal: { backgroundColor: '#fff', borderRadius: 24, maxHeight: '85%', marginHorizontal: 20 },
    challengeModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    challengeModalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
    challengeModalScroll: { maxHeight: 400 },
    challengeModalContent: { padding: 20, paddingBottom: 32 },
    challengeModalGoal: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
    challengeModalDuration: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 16 },
    challengeMembersTitle: { fontSize: 14, fontWeight: '700', color: '#64748b', marginBottom: 10 },
    challengeMemberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    challengeMemberName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
    challengeMemberMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    challengeMemberDone: { fontSize: 13, color: '#10b981', fontWeight: '600' },
    challengeMemberStreak: { fontSize: 13, color: '#64748b', fontWeight: '600' },
    challengeMemberToday: { fontSize: 12, color: '#10b981' },
    challengePostProofBtnModal: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#ec4899',
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 20,
    },
    challengeLeaveBtn: {
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
    },
    challengeLeaveBtnForfeit: {
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#fef2f2',
        alignItems: 'center',
    },
    challengeLeaveText: { fontSize: 16, fontWeight: '700', color: '#64748b' },
    challengeLeaveTextForfeit: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
    streaksHeaderEmoji: {
        fontSize: 16,
        marginRight: 4,
    },
    streaksHeaderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    streaksModal: {
        flex: 1,
        backgroundColor: '#000',
        marginTop: 100,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    streaksModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    streaksModalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#fff',
    },
    streaksModalContent: {
        flex: 1,
    },
    streaksContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    streaksContent: {
        padding: 16,
        paddingBottom: 100,
    },
    createStreakButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ec4899',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 16,
        marginBottom: 24,
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    createStreakIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    createStreakButtonText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
    streaksSection: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    streaksGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
    },
    streakCardSnap: {
        width: '48%',
        aspectRatio: 1,
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#ec4899',
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    streakFlameContainer: {
        position: 'relative',
        marginBottom: 12,
    },
    streakFlame: {
        fontSize: 48,
    },
    streakCountBadge: {
        position: 'absolute',
        bottom: -4,
        right: -8,
        backgroundColor: '#ec4899',
        borderRadius: 12,
        minWidth: 32,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        borderWidth: 2,
        borderColor: '#000',
    },
    streakCountNumber: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff',
    },
    streakNameSnap: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 4,
    },
    streakDaysText: {
        fontSize: 12,
        color: '#999',
        fontWeight: '500',
    },
    availableStreakCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2a2a2a',
        overflow: 'hidden',
    },
    availableStreakContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    availableStreakIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    availableStreakEmoji: {
        fontSize: 28,
    },
    availableStreakInfo: {
        flex: 1,
    },
    availableStreakName: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    availableStreakDesc: {
        fontSize: 14,
        color: '#999',
        marginBottom: 4,
    },
    availableStreakParticipants: {
        fontSize: 12,
        color: '#666',
    },
    acceptButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#ec4899',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStreaksContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyStreaksEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyStreaksText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    emptyStreaksSubtext: {
        fontSize: 14,
        color: '#999',
    },
    loader: {
        marginVertical: 40,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        width: '90%',
        maxWidth: 400,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
    },
    modalInput: {
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#333',
        marginBottom: 12,
    },
    modalTextArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: '#f3f4f6',
    },
    modalButtonPrimary: {
        backgroundColor: '#ec4899',
    },
    modalButtonDisabled: {
        opacity: 0.5,
    },
    modalButtonTextCancel: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    modalButtonTextPrimary: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    });
