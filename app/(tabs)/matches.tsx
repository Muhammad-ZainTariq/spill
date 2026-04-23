import {
    acceptMatchRequest,
    checkPremiumStatus,
    declineMatchRequest,
    generateAITherapyPrompt,
    getActiveMatch,
    getAvailableUsers,
    getPartnerProfile,
    getPendingMatchRequests,
    getWeeklySummary,
    sendMatchRequest,
    subscribeToActiveMatch,
    subscribeToMatchRequests,
} from '@/app/functions';
import { auth } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { onAuthStateChanged } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: screenWidth } = Dimensions.get('window');

const STRUGGLE_CATEGORIES = [
  'All',
  'Anxiety',
  'Depression',
  'Stress',
  'Loneliness',
  'Self-esteem',
  'Relationships',
  'Work/School',
  'Family',
  'Grief',
  'Trauma',
  'Addiction',
  'Other',
];

export default function MatchesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarBottomPad = 24 + Math.max(insets.bottom, 8) + 56;
  const [activeTab, setActiveTab] = useState<'therapy' | 'your_match' | 'find_match'>('therapy');
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  /** Avoid sending users to Premium before the first `checkPremiumStatus` finishes. */
  const [premiumChecked, setPremiumChecked] = useState(false);

  // AI Therapy Prompts state
  const [therapyPrompt, setTherapyPrompt] = useState<string | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<{
    summary: string;
    insights: string[];
    moodTrend: 'improving' | 'stable' | 'declining';
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Anonymous Matching state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [activeMatch, setActiveMatch] = useState<{
    id: string;
    partnerId: string;
    expiresAt: string;
    timeRemaining: number;
  } | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<{ display_name?: string; anonymous_username?: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    loadPremiumStatus();
    const unsub = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      setCurrentUserId(uid);
      if (uid) {
        loadActiveMatch();
        loadPremiumStatus();
      } else {
        setActiveMatch(null);
        setPartnerProfile(null);
        setPendingRequests([]);
        setIsPremium(false);
        setPremiumChecked(true);
      }
    });
    return () => unsub();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPremiumStatus();
    }, [])
  );

  useEffect(() => {
    if (activeTab === 'your_match' || activeTab === 'find_match') {
      loadPendingRequests();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'find_match' && isPremium) {
      loadAvailableUsers();
    }
  }, [activeTab, selectedCategory, isPremium]);

  /** If premium lapses while on Find match, leave the tab and open upgrade. */
  useEffect(() => {
    if (!premiumChecked) return;
    if (activeTab === 'find_match' && !isPremium) {
      setActiveTab('therapy');
      router.push('/premium' as any);
    }
  }, [premiumChecked, isPremium, activeTab, router]);

  useEffect(() => {
    if (!currentUserId) {
      setPendingRequests([]);
      return;
    }
    const unsub = subscribeToMatchRequests((requests) => {
      setPendingRequests(requests);
    });
    return () => unsub();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setActiveMatch(null);
      return;
    }
    const unsub = subscribeToActiveMatch((match) => {
      setActiveMatch(match);
      setPartnerProfile(null);
    });
    return () => unsub();
  }, [currentUserId]);

  useEffect(() => {
    if (!activeMatch?.partnerId) {
      setPartnerProfile(null);
      return;
    }
    let cancelled = false;
    getPartnerProfile(activeMatch.partnerId).then((profile) => {
      if (!cancelled) setPartnerProfile(profile);
    });
    return () => { cancelled = true; };
  }, [activeMatch?.partnerId]);


  const loadPremiumStatus = async () => {
    try {
      const premium = await checkPremiumStatus();
      setIsPremium(premium);
    } finally {
      setPremiumChecked(true);
    }
  };

  const goToFindMatchOrPremium = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let premium = isPremium;
    if (!premiumChecked) {
      premium = await checkPremiumStatus();
      setIsPremium(premium);
      setPremiumChecked(true);
    }
    if (!premium) {
      router.push('/premium' as any);
      return;
    }
    setActiveTab('find_match');
  };

  const loadAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      console.log('Loading available users, category:', selectedCategory);
      const users = await getAvailableUsers(selectedCategory === 'All' ? undefined : selectedCategory);
      console.log('Loaded users:', users.length);
      setAvailableUsers(users);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load available users. Please try again.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadPendingRequests = async () => {
    setLoadingRequests(true);
    try {
      const requests = await getPendingMatchRequests();
      setPendingRequests(requests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadActiveMatch = async () => {
    const match = await getActiveMatch();
    setActiveMatch(match);
  };

  // AI Therapy Prompts handlers
  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      const prompt = await generateAITherapyPrompt();
      if (prompt) {
        setTherapyPrompt(prompt);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', 'Failed to generate prompt. Please try again.');
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleLoadWeeklySummary = async () => {
    setLoadingSummary(true);
    try {
      const summary = await getWeeklySummary();
      if (summary) {
        setWeeklySummary(summary);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', 'Failed to load weekly summary.');
      }
    } catch (error) {
      console.error('Error loading summary:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoadingSummary(false);
    }
  };

  // Matching handlers
  const handleSendRequest = async (userId: string) => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Sending match requests is available for premium members. Upgrade to connect with others!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go Premium', onPress: () => router.push('/premium' as any) },
        ]
      );
      return;
    }

    setLoading(true);
    try {
      const requestId = await sendMatchRequest(userId);
      if (requestId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Request Sent', 'Your match request has been sent!');
        loadAvailableUsers(); // Refresh list
      } else {
        Alert.alert('Error', 'Request already sent or failed.');
      }
    } catch (error) {
      console.error('Error sending request:', error);
      Alert.alert('Error', 'Failed to send request.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const success = await acceptMatchRequest(requestId);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Match Accepted!', 'You\'ve been matched. Your conversation expires in 30 minutes.');
        await loadActiveMatch();
        await loadPendingRequests();
      } else {
        Alert.alert('Error', 'Failed to accept request.');
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const success = await declineMatchRequest(requestId);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadPendingRequests();
      } else {
        Alert.alert('Error', 'Failed to decline request.');
      }
    } catch (error) {
      console.error('Error declining request:', error);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const renderUserCard = ({ item }: { item: any }) => {
    const struggles = item.match_struggles || [];
    const displayName = item.display_name || item.anonymous_username || 'Anonymous';

    return (
      <View style={styles.userCard}>
        <View style={styles.userCardHeader}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
          ) : (
            <View style={styles.userAvatarPlaceholder}>
              <Text style={styles.userAvatarText}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            {struggles.length > 0 && (
              <View style={styles.strugglesRow}>
                {struggles.slice(0, 3).map((struggle: string, idx: number) => (
                  <View key={idx} style={styles.struggleTag}>
                    <Text style={styles.struggleTagText}>{struggle}</Text>
                  </View>
                ))}
                {struggles.length > 3 && (
                  <Text style={styles.moreStruggles}>+{struggles.length - 3}</Text>
                )}
              </View>
            )}
          </View>
        </View>
        <Pressable
          style={[styles.sendRequestButton, !isPremium && styles.sendRequestButtonLocked]}
          onPress={() => handleSendRequest(item.id)}
          disabled={loading}
        >
          {!isPremium ? (
            <>
              <Feather name="lock" size={16} color="#9ca3af" />
              <Text style={styles.sendRequestButtonTextLocked}>Premium Required</Text>
            </>
          ) : (
            <>
              <Feather name="send" size={16} color="#fff" />
              <Text style={styles.sendRequestButtonText}>Send Request</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.topChrome}>
            <View style={styles.header}>
              <Text style={styles.headerKicker}>Reflection · Matching</Text>
              <Text style={styles.headerTitle}>
                Matches <Text style={styles.headerTitleAccent}>&</Text> Therapy
              </Text>
            </View>
            <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'therapy' && styles.tabActive]}
            onPress={() => {
              setActiveTab('therapy');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.tabText, activeTab === 'therapy' && styles.tabTextActive]} numberOfLines={1}>
              AI Therapy
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'your_match' && styles.tabActive]}
            onPress={() => {
              setActiveTab('your_match');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.tabText, activeTab === 'your_match' && styles.tabTextActive]} numberOfLines={1}>
              Your match
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'find_match' && styles.tabActive]}
            onPress={() => {
              void goToFindMatchOrPremium();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'find_match' && styles.tabTextActive]} numberOfLines={1}>
              Find match
            </Text>
          </Pressable>
            </View>
          </View>

        <View style={styles.body}>
      {activeTab === 'therapy' ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.therapyScrollContent, { paddingBottom: tabBarBottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          key="therapy"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Therapy Prompts</Text>
            <Text style={styles.sectionSubtitle}>
              Get personalized reflection questions based on your posts and mood
            </Text>

            <Pressable
              style={[styles.primaryButton, generatingPrompt && styles.buttonDisabled]}
              onPress={handleGeneratePrompt}
              disabled={generatingPrompt}
            >
              {generatingPrompt ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="zap" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Generate Reflection Question</Text>
                </>
              )}
            </Pressable>

            {therapyPrompt && (
              <View style={styles.promptCard}>
                <Text style={styles.promptLabel}>Your Reflection Question:</Text>
                <Text style={styles.promptText}>{therapyPrompt}</Text>
              </View>
            )}

            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Weekly Summary</Text>
              <Text style={styles.sectionSubtitle}>
                Get insights about your week based on your activity
              </Text>

              <Pressable
                style={[styles.secondaryButton, loadingSummary && styles.buttonDisabled]}
                onPress={handleLoadWeeklySummary}
                disabled={loadingSummary}
              >
                {loadingSummary ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <>
                    <Feather name="bar-chart-2" size={20} color="#ec4899" />
                    <Text style={styles.secondaryButtonText}>Load Weekly Summary</Text>
                  </>
                )}
              </Pressable>

              {weeklySummary && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Your Week</Text>
                    <View style={[
                      styles.trendBadge,
                      weeklySummary.moodTrend === 'improving' && styles.trendBadgeGood,
                      weeklySummary.moodTrend === 'declining' && styles.trendBadgeBad,
                    ]}>
                      <Text style={styles.trendBadgeText}>
                        {weeklySummary.moodTrend === 'improving' ? '📈 Improving' :
                         weeklySummary.moodTrend === 'declining' ? '📉 Declining' : '➡️ Stable'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.summaryText}>{weeklySummary.summary}</Text>
                  {weeklySummary.insights.length > 0 && (
                    <View style={styles.insightsContainer}>
                      <Text style={styles.insightsTitle}>Insights:</Text>
                      {weeklySummary.insights.map((insight, index) => (
                        <View key={index} style={styles.insightItem}>
                          <Text style={styles.insightBullet}>•</Text>
                          <Text style={styles.insightText}>{insight}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      ) : activeTab === 'find_match' ? (
        <View style={styles.matchingContainer}>
          {/* Pending Requests Section */}
          {pendingRequests.length > 0 && (
            <View style={styles.requestsSection}>
              <Text style={styles.requestsTitle}>Pending Requests ({pendingRequests.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.requestsScroll}>
                {pendingRequests.map((request) => {
                  const sender = request.profiles;
                  const senderName = sender?.display_name || sender?.anonymous_username || 'Someone';
                  return (
                    <View key={request.id} style={styles.requestCard}>
                      {sender?.avatar_url ? (
                        <Image source={{ uri: sender.avatar_url }} style={styles.requestAvatar} />
                      ) : (
                        <View style={styles.requestAvatarPlaceholder}>
                          <Text style={styles.requestAvatarText}>
                            {senderName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.requestName}>{senderName}</Text>
                      <View style={styles.requestActions}>
                        <Pressable
                          style={[styles.requestButton, styles.acceptButton]}
                          onPress={() => handleAcceptRequest(request.id)}
                        >
                          <Feather name="check" size={16} color="#fff" />
                          <Text style={styles.requestButtonText}>Accept</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.requestButton, styles.declineButton]}
                          onPress={() => handleDeclineRequest(request.id)}
                        >
                          <Feather name="x" size={16} color="#fff" />
                          <Text style={styles.requestButtonText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Category Filter */}
          <View style={styles.categoryContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {STRUGGLE_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryChip,
                    selectedCategory === category && styles.categoryChipActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(category);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === category && styles.categoryChipTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Users List */}
          {loadingUsers ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ec4899" />
            </View>
          ) : availableUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No users available</Text>
              <Text style={styles.emptySubtext}>
                {selectedCategory !== 'All'
                  ? `No users found in "${selectedCategory}" category`
                  : 'No users have opted in for matches yet. Make sure users have enabled "Be Available for Matches" in Settings.'}
              </Text>
              <Pressable
                style={styles.refreshButton}
                onPress={loadAvailableUsers}
              >
                <Feather name="refresh-cw" size={16} color="#ec4899" />
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={availableUsers}
              renderItem={renderUserCard}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.usersList, { paddingBottom: tabBarBottomPad }]}
              refreshing={loadingUsers}
              onRefresh={loadAvailableUsers}
            />
          )}
        </View>
      ) : (
        // Your match tab: list of matches → tap to open chat (with message box, Play, Unfriend)
        !activeMatch ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: tabBarBottomPad, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {pendingRequests.length > 0 && (
              <View style={styles.requestsSection}>
                <Text style={styles.requestsTitle}>Pending requests ({pendingRequests.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.requestsScroll}>
                  {pendingRequests.map((request) => {
                    const sender = request.profiles;
                    const senderName = sender?.display_name || sender?.anonymous_username || 'Someone';
                    return (
                      <View key={request.id} style={styles.requestCard}>
                        {sender?.avatar_url ? (
                          <Image source={{ uri: sender.avatar_url }} style={styles.requestAvatar} />
                        ) : (
                          <View style={styles.requestAvatarPlaceholder}>
                            <Text style={styles.requestAvatarText}>
                              {senderName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.requestName}>{senderName}</Text>
                        <View style={styles.requestActions}>
                          <Pressable
                            style={[styles.requestButton, styles.acceptButton]}
                            onPress={() => handleAcceptRequest(request.id)}
                          >
                            <Feather name="check" size={16} color="#fff" />
                            <Text style={styles.requestButtonText}>Accept</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.requestButton, styles.declineButton]}
                            onPress={() => handleDeclineRequest(request.id)}
                          >
                            <Feather name="x" size={16} color="#fff" />
                            <Text style={styles.requestButtonText}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            <View style={[styles.emptyContainer, { flex: 1, justifyContent: 'center', minHeight: 280 }]}>
              <Feather name="heart" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No matches yet</Text>
              <Text style={styles.emptySubtext}>
                {isPremium
                  ? 'Go to Find Match to get matched with someone.'
                  : 'Upgrade to Premium to browse people and send match requests.'}
              </Text>
              <Pressable style={styles.refreshButton} onPress={() => void goToFindMatchOrPremium()}>
                <Feather name="users" size={16} color="#ec4899" />
                <Text style={styles.refreshButtonText}>{isPremium ? 'Find Match' : 'Go Premium'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          // List of people you're matched with — tap to open chat (full screen, no tab bar)
          <View style={styles.matchListContainer}>
            <Text style={styles.matchListTitle}>Your matches</Text>
            <Text style={styles.matchListSubtitle}>Tap to chat or play games</Text>
            <Pressable
              style={styles.matchListCard}
              onPress={() => router.push({ pathname: '/match-chat', params: { matchId: activeMatch.id, partnerId: activeMatch.partnerId } } as any)}
            >
              <View style={styles.matchListCardAvatar}>
                <Text style={styles.matchListCardAvatarText}>
                  {(partnerProfile?.display_name || partnerProfile?.anonymous_username || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.matchListCardBody}>
                <Text style={styles.matchListCardName} numberOfLines={1}>
                  {partnerProfile
                    ? (partnerProfile.display_name || partnerProfile.anonymous_username || 'Anonymous')
                    : 'Loading...'}
                </Text>
                <Text style={styles.matchListCardMeta}>Chat · Play games</Text>
              </View>
              <Feather name="chevron-right" size={22} color="#9ca3af" />
            </Pressable>
          </View>
        )
      )}
        </View>
      </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  /** Same as header so the Dynamic Island / status bar area isn’t a different grey. */
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  /** One continuous white block: status bar (via safeArea) + header + tabs */
  topChrome: {
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ec4899',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  headerTitleAccent: {
    color: '#ec4899',
    fontWeight: '800',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#ec4899',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#ec4899',
  },
  body: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  therapyScrollContent: {
    flexGrow: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ec4899',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#ec4899',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  promptCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  summarySection: {
    marginTop: 32,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#e1e5e9',
  },
  summaryCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  trendBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  trendBadgeGood: {
    backgroundColor: '#d1fae5',
  },
  trendBadgeBad: {
    backgroundColor: '#fee2e2',
  },
  trendBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  summaryText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 16,
  },
  insightsContainer: {
    marginTop: 12,
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  insightItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  insightBullet: {
    fontSize: 16,
    color: '#ec4899',
    marginRight: 8,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  matchingContainer: {
    flex: 1,
  },
  requestsSection: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  requestsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  requestsScroll: {
    paddingHorizontal: 20,
  },
  requestCard: {
    width: 140,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  requestAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  requestAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  requestName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  requestActions: {
    width: '100%',
    gap: 8,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  declineButton: {
    backgroundColor: '#ef4444',
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginLeft: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#ec4899',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  usersList: {
    padding: 20,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  userCardHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  strugglesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  struggleTag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  struggleTagText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  moreStruggles: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  sendRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  sendRequestButtonLocked: {
    backgroundColor: '#f3f4f6',
  },
  sendRequestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sendRequestButtonTextLocked: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
  matchChatContainer: {
    flex: 1,
    backgroundColor: '#fff',
    minHeight: 0,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  matchHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  matchBackButton: {
    padding: 8,
    marginRight: 4,
  },
  matchTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  matchListContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  matchListTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  matchListSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  matchListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 14,
  },
  matchListCardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchListCardAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  matchListCardBody: {
    flex: 1,
    minWidth: 0,
  },
  matchListCardName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  matchListCardMeta: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  matchTimer: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  matchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  matchActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ec4899',
    gap: 4,
  },
  matchActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ec4899',
  },
  endButton: {
    borderColor: '#ef4444',
  },
  endButtonText: {
    color: '#ef4444',
  },
  messagesList: {
    flex: 1,
    minHeight: 0,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#ec4899',
    borderBottomRightRadius: 4,
  },
  messageBubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextMe: {
    color: '#fff',
  },
  messageTextThem: {
    color: '#111827',
  },
  messageTime: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
  },
  messageBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  messageBarFixed: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingBottom: 12,
  },
  messageBarInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#f3f4f6',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    paddingTop: 12,
    fontSize: 16,
    color: '#111827',
  },
  messageBarSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  messageBarSendDisabled: {
    backgroundColor: '#d1d5db',
    shadowOpacity: 0,
  },
  startVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    margin: 16,
    borderRadius: 12,
    gap: 8,
  },
  startVoiceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceChatContainer: {
    backgroundColor: '#f9fafb',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  voiceChatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceChatStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d1d5db',
  },
  voiceIndicatorActive: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  voiceChatStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  voiceControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceControlButtonMuted: {
    backgroundColor: '#ef4444',
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    marginBottom: 16,
  },
  waveBar: {
    width: 4,
    backgroundColor: '#10b981',
    borderRadius: 2,
    minHeight: 8,
  },
  pushToTalkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginBottom: 16,
    gap: 12,
    minHeight: 80,
  },
  pushToTalkButtonActive: {
    backgroundColor: '#ef4444',
  },
  pushToTalkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
  },
  playingText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  endVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  endVoiceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ec4899',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 6,
  },
  refreshButtonText: {
    color: '#ec4899',
    fontSize: 14,
    fontWeight: '600',
  },
});
