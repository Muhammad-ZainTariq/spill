import { auth, db } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
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
    acceptMessageRequest,
    CHALLENGE_CATEGORIES,
    declineMessageRequest,
    fetchMessages,
    formatTimeAgo,
    getConversations,
    getCurrentUserRole,
    getGroups,
    getOfficialChallenges,
    getOrCreateConversation,
    getPendingRequests,
    Group,
    sendMessage
} from '../functions';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: {
    id: string;
    display_name?: string;
    anonymous_username?: string;
    avatar_url?: string;
  };
}

type TabKey = 'messages' | 'groups' | 'requests';

export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList>(null);
  const messagesChannelRef = useRef<any | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [searchQuery, setSearchQuery] = useState('');

  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [officialChallenges, setOfficialChallenges] = useState<any[]>([]);
  const [loadingOfficial, setLoadingOfficial] = useState(false);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [challengeCategoryFilter, setChallengeCategoryFilter] = useState<string>('All');

  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // User search state
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [messagePreference, setMessagePreference] = useState<'direct' | 'requests' | 'none'>('requests');
  const [autoJoinGroups, setAutoJoinGroups] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Chat view state
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Hide tab bar when in chat
  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedConversation ? { display: 'none' } : undefined,
    });
  }, [selectedConversation, navigation]);

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const convs = await getConversations();
      setConversations(convs);
    } catch (e) {
      console.error('Error loading conversations (connections):', e);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadGroups = async () => {
    try {
      setLoadingGroups(true);
      const allGroups = await getGroups(false, undefined);
      setGroups(allGroups);
    } catch (e) {
      console.error('Error loading groups (connections):', e);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadOfficialChallenges = async () => {
    try {
      const role = await getCurrentUserRole();
      setIsAppAdmin(role.is_admin);
      setLoadingOfficial(true);
      const list = await getOfficialChallenges(); // all users can browse and join; we filter by challengeCategoryFilter in UI
      setOfficialChallenges(list);
    } catch (e) {
      setOfficialChallenges([]);
    } finally {
      setLoadingOfficial(false);
    }
  };

  const loadRequests = async () => {
    try {
      setLoadingRequests(true);
      const reqs = await getPendingRequests();
      setRequests(reqs);
    } catch (e) {
      console.error('Error loading requests (connections):', e);
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleAcceptRequest = async (conversationId: string) => {
    const success = await acceptMessageRequest(conversationId);
    if (success) {
      loadRequests();
      loadConversations();
    }
  };

  const handleDeclineRequest = async (conversationId: string) => {
    const success = await declineMessageRequest(conversationId);
    if (success) {
      loadRequests();
    }
  };

  const loadSettings = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;
      const profile = await getDoc(doc(db, 'users', u.uid));
      const data = profile.data();
      if (data) {
        setMessagePreference(data.message_preference || 'requests');
        setAutoJoinGroups(data.auto_join_groups || false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setLoadingSettings(true);
      const u = auth.currentUser;
      if (!u) return;
      const { updateUserProfile } = await import('../functions');
      await updateUserProfile({ message_preference: messagePreference, auto_join_groups: autoJoinGroups });
      setShowSettings(false);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const searchUsers = async (searchQ: string) => {
    if (!searchQ.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    try {
      setIsSearching(true);
      if (!auth.currentUser) return;
      const { getDocs, collection, query, where, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'users'),
        where('anonymous_username', '>=', searchQ.trim()),
        where('anonymous_username', '<=', searchQ.trim() + '\uf8ff'),
        limit(20)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .filter((d) => d.id !== auth.currentUser?.uid)
        .map((d) => ({ id: d.id, ...d.data() }));
      setSearchResults(list);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const startConversation = async (userId: string) => {
    try {
      const conv = await getOrCreateConversation(userId);
      const profileSnap = await getDoc(doc(db, 'users', userId));
      const profile = profileSnap.exists() ? { id: userId, ...profileSnap.data() } : null;
      setSelectedConversation({
        ...conv,
        otherUser: profile,
      });
      setSearchQuery('');
      setSearchResults([]);
      
      setTimeout(() => {
        loadConversations();
      }, 500);
    } catch (error: any) {
      console.error('Error starting conversation:', error);
      if (error.message === 'This user is not accepting messages') {
        Alert.alert('Cannot Message', 'This user is not accepting messages at this time.');
      } else {
        Alert.alert('Error', 'Failed to start conversation');
      }
    }
  };

  useEffect(() => {
    setCurrentUserId(auth.currentUser?.uid || null);
    loadConversations();
    loadGroups();
    loadOfficialChallenges();
    loadRequests();
    loadSettings();
    const interval = setInterval(() => {
      loadConversations();
      loadRequests();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedConversation) return;
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedConversation]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (activeTab === 'messages') {
        searchUsers(searchQuery);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, activeTab]);

  const loadMessages = async () => {
    if (!selectedConversation?.id) return;
    try {
      const msgs = await fetchMessages(selectedConversation.id);
      setMessages(msgs);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim() || !selectedConversation?.id || sending) return;
    const content = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const sentMessage = await sendMessage(selectedConversation.id, content);

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id);

      if (sentMessage && currentUserId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sentMessage.id)) return prev;
          return [...prev, { ...sentMessage, sender: { id: currentUserId } }];
        });
      }

      loadMessages();
      loadConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageText(content);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name =
      c.otherUser?.display_name ||
      c.otherUser?.anonymous_username ||
      'Anonymous';
    return name.toLowerCase().includes(q);
  });

  const filteredGroups = groups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.description?.toLowerCase().includes(q)
    );
  });

  const filteredRequests = requests.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name =
      r.otherUser?.display_name ||
      r.otherUser?.anonymous_username ||
      'Anonymous';
    return name.toLowerCase().includes(q);
  });

  const renderConversationItem = ({ item }: { item: any }) => {
    const lastMsg =
      item.last_message && Array.isArray(item.last_message) && item.last_message.length > 0
        ? item.last_message[0]
        : null;
    const displayName =
      item.otherUser?.display_name ||
      item.otherUser?.anonymous_username ||
      'Anonymous';

    return (
      <Pressable
        style={styles.conversationItem}
        onPress={() => setSelectedConversation(item)}
      >
        {item.otherUser?.avatar_url ? (
          <Image
            source={{ uri: item.otherUser.avatar_url }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>
              {displayName[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {displayName}
          </Text>
          {lastMsg ? (
            <Text style={styles.conversationPreview} numberOfLines={1}>
              {lastMsg.content}
            </Text>
          ) : (
            <Text style={styles.conversationPreview} numberOfLines={1}>
              Start a conversation
            </Text>
          )}
        </View>
        <Text style={styles.conversationTime}>
          {lastMsg
            ? formatTimeAgo(lastMsg.created_at)
            : item.updated_at
            ? formatTimeAgo(item.updated_at)
            : ''}
        </Text>
      </Pressable>
    );
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const creatorName =
      item.creator?.display_name ||
      item.creator?.anonymous_username ||
      'Anonymous';
    const isChallenge = (item as any).is_challenge === true;

    return (
      <Pressable
        style={styles.groupItem}
        onPress={() => router.push(`/group?groupId=${item.id}` as any)}
      >
        <View style={styles.groupInfo}>
          <View style={styles.groupNameRow}>
            <Text style={styles.groupName} numberOfLines={1}>
              {item.name}
            </Text>
            {isChallenge && (
              <View style={styles.challengeBadge}>
                <Text style={styles.challengeBadgeText}>Challenge</Text>
              </View>
            )}
          </View>
          <Text style={styles.groupCreator} numberOfLines={1}>
            by {creatorName}
          </Text>
          {isChallenge && (item as any).challenge_goal ? (
            <Text style={styles.groupDescription} numberOfLines={1}>
              {(item as any).challenge_goal} • {(item as any).challenge_duration_days} days
            </Text>
          ) : item.description ? (
            <Text style={styles.groupDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
        {item.category && !isChallenge && (
          <View style={styles.groupCategoryBadge}>
            <Text style={styles.groupCategoryText}>
              {item.category.replace('_', ' ')}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const renderRequestItem = ({ item }: { item: any }) => {
    const displayName =
      item.otherUser?.display_name ||
      item.otherUser?.anonymous_username ||
      'Anonymous';

    return (
      <View style={styles.requestItem}>
        <View style={styles.requestHeader}>
          {item.otherUser?.avatar_url ? (
            <Image
              source={{ uri: item.otherUser.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>
                {displayName[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>{displayName}</Text>
            {item.firstMessage && (
              <Text style={styles.requestMessage} numberOfLines={2}>
                {item.firstMessage.content}
              </Text>
            )}
            <Text style={styles.requestTime}>
              {item.updated_at ? formatTimeAgo(item.updated_at) : ''}
            </Text>
          </View>
        </View>
        <View style={styles.requestActions}>
          <Pressable
            style={styles.declineButton}
            onPress={() => handleDeclineRequest(item.id)}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
          <Pressable
            style={styles.acceptButton}
            onPress={() => handleAcceptRequest(item.id)}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: any }) => {
    const displayName = item.display_name || item.anonymous_username || 'Anonymous';

    return (
      <Pressable
        style={styles.searchResultItem}
        onPress={() => startConversation(item.id)}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
          </View>
        )}
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationName}>{displayName}</Text>
          <Text style={styles.searchResultSubtext}>Tap to start conversation</Text>
        </View>
        <Feather name="message-circle" size={20} color="#ec4899" />
      </Pressable>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    
    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        <View style={[
          styles.messageBubble,
          isMe ? styles.messageBubbleMe : styles.messageBubbleOther
        ]}>
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.content}</Text>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
            {formatTimeAgo(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const showMessages = activeTab === 'messages';
  const showGroups = activeTab === 'groups';
  const showRequests = activeTab === 'requests';

  // If a conversation is selected, show the chat view
  if (selectedConversation) {
    const displayName = selectedConversation.otherUser?.display_name || selectedConversation.otherUser?.anonymous_username || 'Anonymous';

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
          {/* Chat Header - Clean white design */}
          <View style={[styles.chatHeader, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setSelectedConversation(null)}>
              <Feather name="arrow-left" size={24} color="#333" />
            </Pressable>
            <View style={styles.chatHeaderUserInfo}>
              {selectedConversation.otherUser?.avatar_url ? (
                <Image source={{ uri: selectedConversation.otherUser.avatar_url }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.avatarFallback, styles.headerAvatar]}>
                  <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
                </View>
              )}
              <Text style={styles.chatHeaderTitle}>{displayName}</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>

          {/* Messages List */}
          <View style={styles.messagesListContainer}>
            <FlatList
              ref={flatListRef}
              inverted
              data={[...messages].slice().reverse()}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.messagesList,
                { paddingBottom: 12 }
              ]}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            />
          </View>

          {/* Message Input Bar */}
          <View
            style={[
              styles.inputBarWrapper,
              {
                paddingBottom: insets.bottom + 8,
              }
            ]}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={messageText}
                onChangeText={setMessageText}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                multiline
                maxLength={1000}
              />
              <Pressable
                style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!messageText.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={20} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top search + actions */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 12 },
        ]}
      >
        <View style={styles.searchBar}>
          <Feather name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              showMessages 
                ? 'Search people...' 
                : showGroups 
                ? 'Search groups...' 
                : 'Search requests...'
            }
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
          >
            <Feather name="settings" size={18} color="#666" />
          </Pressable>
          <Pressable
            style={styles.streaksButton}
            onPress={() => router.push('/streaks' as any)}
          >
            <Feather name="zap" size={18} color="#ec4899" />
          </Pressable>
          <Pressable
            style={styles.createButton}
            onPress={() =>
              showMessages
                ? router.push('/(tabs)/messages' as any)
                : router.push('/group' as any)
            }
          >
            <Feather name="plus" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Segmented control: Messages / Groups / Requests */}
      <View style={styles.segmentRow}>
        {(['messages', 'groups', 'requests'] as TabKey[]).map((key) => (
          <Pressable
            key={key}
            style={[
              styles.segmentChip,
              activeTab === key && styles.segmentChipActive,
            ]}
            onPress={() => setActiveTab(key)}
          >
            <Text
              style={[
                styles.segmentText,
                activeTab === key && styles.segmentTextActive,
              ]}
            >
              {key === 'messages' ? 'Messages' : key === 'groups' ? 'Groups' : 'Requests'}
            </Text>
            {key === 'requests' && requests.length > 0 && (
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>{requests.length}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {showMessages ? (
        searchQuery.trim().length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              isSearching ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="small" color="#ec4899" />
                  <Text style={styles.emptyTitle}>Searching...</Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No users found</Text>
                  <Text style={styles.emptySubtitle}>Try a different search term</Text>
                </View>
              )
            }
          />
        ) : loadingConversations ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredConversations}
            keyExtractor={(item) => item.id}
            renderItem={renderConversationItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySubtitle}>
                  Search for someone to start chatting
                </Text>
              </View>
            }
            refreshing={loadingConversations}
            onRefresh={loadConversations}
          />
        )
      ) : showGroups ? (
        loadingGroups ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading groups...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredGroups}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.groupsListHeader}>
                <Pressable
                  style={styles.createChallengeButton}
                  onPress={() => router.push('/create-challenge' as any)}
                >
                  <Feather name="zap" size={20} color="#fff" />
                  <Text style={styles.createChallengeButtonText}>Create challenge</Text>
                </Pressable>
                {(loadingOfficial ? (
                  <ActivityIndicator size="small" color="#ec4899" style={{ marginVertical: 12 }} />
                ) : officialChallenges.length > 0 ? (
                  <View style={styles.officialSection}>
                    <Text style={styles.officialSectionTitle}>Official challenges (admin)</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.challengeCategoryScroll}
                      contentContainerStyle={styles.challengeCategoryContent}
                    >
                      <Pressable
                        style={[styles.challengeCategoryChip, challengeCategoryFilter === 'All' && styles.challengeCategoryChipActive]}
                        onPress={() => setChallengeCategoryFilter('All')}
                      >
                        <Text style={[styles.challengeCategoryChipText, challengeCategoryFilter === 'All' && styles.challengeCategoryChipTextActive]}>All</Text>
                      </Pressable>
                      {CHALLENGE_CATEGORIES.map((c) => (
                        <Pressable
                          key={c.value}
                          style={[styles.challengeCategoryChip, challengeCategoryFilter === c.value && styles.challengeCategoryChipActive]}
                          onPress={() => setChallengeCategoryFilter(c.value)}
                        >
                          <Text style={[styles.challengeCategoryChipText, challengeCategoryFilter === c.value && styles.challengeCategoryChipTextActive]}>{c.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {(challengeCategoryFilter === 'All'
                      ? officialChallenges
                      : officialChallenges.filter((c) => (c.challenge_category || 'other') === challengeCategoryFilter)
                    ).map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.officialChallengeItem}
                        onPress={() => router.push(`/group?groupId=${item.id}` as any)}
                      >
                        <View style={styles.groupInfo}>
                          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.officialCategoryTag}>
                            {CHALLENGE_CATEGORIES.find((x) => x.value === (item.challenge_category || 'other'))?.label ?? '✨ Other'}
                          </Text>
                          <Text style={styles.officialManagedBy}>Managed by administration</Text>
                          {item.challenge_goal ? (
                            <Text style={styles.groupDescription} numberOfLines={1}>
                              {item.challenge_goal} • {item.challenge_duration_days} days
                            </Text>
                          ) : null}
                        </View>
                        <Feather name="chevron-right" size={20} color="#9ca3af" />
                      </Pressable>
                    ))}
                  </View>
                ) : null)}
                <Text style={styles.allGroupsTitle}>All groups</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptySubtitle}>
                  Create a group or start a challenge.
                </Text>
              </View>
            }
            refreshing={loadingGroups}
            onRefresh={() => { loadGroups(); loadOfficialChallenges(); }}
          />
        )
      ) : showRequests ? (
        loadingRequests ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading requests...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRequests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequestItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No message requests</Text>
                <Text style={styles.emptySubtitle}>
                  You're all caught up!
                </Text>
              </View>
            }
            refreshing={loadingRequests}
            onRefresh={loadRequests}
          />
        )
      ) : null}

      {/* Settings Modal */}
      {showSettings && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connection Settings</Text>
              <Pressable onPress={() => setShowSettings(false)}>
                <Feather name="x" size={24} color="#333" />
              </Pressable>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Message Requests</Text>
              <Text style={styles.settingsDescription}>
                Choose how you want to receive messages from new people
              </Text>

              <Pressable
                style={styles.settingOption}
                onPress={() => setMessagePreference('direct')}
              >
                <View style={styles.settingOptionContent}>
                  <Text style={styles.settingOptionTitle}>Accept Directly</Text>
                  <Text style={styles.settingOptionDescription}>
                    Anyone can message you without approval
                  </Text>
                </View>
                <View style={[
                  styles.radioButton,
                  messagePreference === 'direct' && styles.radioButtonActive
                ]}>
                  {messagePreference === 'direct' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
              </Pressable>

              <Pressable
                style={styles.settingOption}
                onPress={() => setMessagePreference('requests')}
              >
                <View style={styles.settingOptionContent}>
                  <Text style={styles.settingOptionTitle}>Requests First</Text>
                  <Text style={styles.settingOptionDescription}>
                    New messages require your approval
                  </Text>
                </View>
                <View style={[
                  styles.radioButton,
                  messagePreference === 'requests' && styles.radioButtonActive
                ]}>
                  {messagePreference === 'requests' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
              </Pressable>

              <Pressable
                style={styles.settingOption}
                onPress={() => setMessagePreference('none')}
              >
                <View style={styles.settingOptionContent}>
                  <Text style={styles.settingOptionTitle}>No Messages</Text>
                  <Text style={styles.settingOptionDescription}>
                    Don't receive any messages
                  </Text>
                </View>
                <View style={[
                  styles.radioButton,
                  messagePreference === 'none' && styles.radioButtonActive
                ]}>
                  {messagePreference === 'none' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
              </Pressable>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Group Invites</Text>
              <Pressable
                style={styles.settingToggle}
                onPress={() => setAutoJoinGroups(!autoJoinGroups)}
              >
                <View style={styles.settingToggleContent}>
                  <Text style={styles.settingOptionTitle}>Auto-Join Groups</Text>
                  <Text style={styles.settingOptionDescription}>
                    Automatically join when invited to groups
                  </Text>
                </View>
                <View style={[styles.toggle, autoJoinGroups && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, autoJoinGroups && styles.toggleThumbActive]} />
                </View>
              </Pressable>
            </View>

            <Pressable
              style={[styles.saveButton, loadingSettings && styles.saveButtonDisabled]}
              onPress={saveSettings}
              disabled={loadingSettings}
            >
              {loadingSettings ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Settings</Text>
              )}
            </Pressable>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streaksButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff5fb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f9a8d4',
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  segmentChipActive: {
    backgroundColor: '#ec4899',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  segmentTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  conversationPreview: {
    fontSize: 13,
    color: '#6b7280',
  },
  conversationTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 8,
  },
  groupItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  groupInfo: {
    flex: 1,
    marginRight: 12,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  groupName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  challengeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
  },
  challengeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  groupCreator: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 13,
    color: '#4b5563',
  },
  groupCategoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  groupCategoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  groupsListHeader: {
    paddingBottom: 16,
  },
  createChallengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ec4899',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  createChallengeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  officialSection: {
    marginBottom: 16,
  },
  officialSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  challengeCategoryScroll: { marginBottom: 10 },
  challengeCategoryContent: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  challengeCategoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  challengeCategoryChipActive: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  challengeCategoryChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  challengeCategoryChipTextActive: { color: '#fff' },
  officialCategoryTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  officialChallengeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  officialManagedBy: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
    marginTop: 2,
  },
  allGroupsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  requestBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  requestBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  requestItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  requestMessage: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 4,
  },
  requestTime: {
    fontSize: 11,
    color: '#9ca3af',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ec4899',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '90%',
    maxHeight: '80%',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  settingsSection: {
    marginBottom: 24,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  settingsDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  settingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 8,
  },
  settingOptionContent: {
    flex: 1,
    marginRight: 12,
  },
  settingOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingOptionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonActive: {
    borderColor: '#ec4899',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ec4899',
  },
  settingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  settingToggleContent: {
    flex: 1,
    marginRight: 12,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
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
  saveButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  chatHeaderUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  messagesListContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageRow: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  messageRowMe: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  messageBubbleMe: {
    backgroundColor: '#ec4899',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTextMe: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  messageTimeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  inputBarWrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  searchResultSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});


