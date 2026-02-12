import {
    acceptMatchRequest,
    checkPremiumStatus,
    declineMatchRequest,
    endMatch,
    extendMatch,
    generateAITherapyPrompt,
    getActiveMatch,
    getAvailableUsers,
    getMatchMessages,
    getPendingMatchRequests,
    getWeeklySummary,
    sendMatchMessage,
    sendMatchRequest,
} from '@/app/functions';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [activeTab, setActiveTab] = useState<'therapy' | 'matching'>('therapy');
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

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
  const [matchMessages, setMatchMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<FlatList>(null);
  
  // Voice Chat state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [partnerInVoice, setPartnerInVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Audio recorder and player
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  useEffect(() => {
    loadPremiumStatus();
    loadActiveMatch();
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'matching') {
      loadAvailableUsers();
      loadPendingRequests();
    }
  }, [activeTab, selectedCategory]);

  useEffect(() => {
    if (activeMatch) {
      loadMatchMessages();
      const interval = setInterval(() => {
        updateMatchTimer();
      }, 60000);

      const messagesChannel = supabase
        .channel(`match-messages-${activeMatch.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'match_messages',
            filter: `match_id=eq.${activeMatch.id}`,
          },
          () => {
            loadMatchMessages();
          }
        )
        .subscribe();

      // Voice chat channel
      const voiceChannel = supabase
        .channel(`match-voice-${activeMatch.id}`)
        .on(
          'broadcast',
          { event: 'voice-status' },
          (payload) => {
            if (payload.payload.userId !== currentUserId) {
              setPartnerInVoice(payload.payload.inVoice || false);
            }
          }
        )
        .on(
          'broadcast',
          { event: 'audio-ready' },
          async (payload) => {
            // Receive and play audio from partner
            if (payload.payload.userId !== currentUserId && !isMuted) {
              try {
                const { audioUrl } = payload.payload;
                if (audioUrl) {
                  // Stop current playback if playing
                  if (player.playing) {
                    player.pause();
                  }

                  // Load and play new audio
                  player.replace(audioUrl);
                  player.play();
                  setIsPlaying(true);

                  // Listen for playback end
                  const subscription = player.addListener('playbackStatusUpdate', (status) => {
                    if (status.isLoaded && status.didJustFinish) {
                      setIsPlaying(false);
                      subscription.remove();
                    }
                  });
                }
              } catch (error) {
                console.error('Error playing audio:', error);
              }
            }
          }
        )
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(messagesChannel);
        supabase.removeChannel(voiceChannel);
        setIsVoiceActive(false);
        setPartnerInVoice(false);
      };
    }
  }, [activeMatch, currentUserId]);

  const loadPremiumStatus = async () => {
    const premium = await checkPremiumStatus();
    setIsPremium(premium);
  };

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
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
    if (match) {
      loadMatchMessages();
    }
  };

  const updateMatchTimer = async () => {
    const match = await getActiveMatch();
    if (match) {
      setActiveMatch(match);
    } else {
      setActiveMatch(null);
      Alert.alert('Match Expired', 'Your anonymous match has expired.');
    }
  };

  const loadMatchMessages = async () => {
    if (!activeMatch) return;
    const messages = await getMatchMessages(activeMatch.id);
    setMatchMessages(messages);
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

  const handleExtendMatch = async () => {
    if (!activeMatch) return;
    const success = await extendMatch(activeMatch.id);
    if (success) {
      await loadActiveMatch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Time Extended', 'Your conversation has been extended by 15 minutes.');
    } else {
      Alert.alert('Error', 'Failed to extend match.');
    }
  };

  const handleEndMatch = async () => {
    if (!activeMatch) return;
    Alert.alert(
      'End Match',
      'Are you sure you want to end this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            const success = await endMatch(activeMatch.id);
            if (success) {
              setActiveMatch(null);
              setMatchMessages([]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', 'Failed to end match.');
            }
          },
        },
      ]
    );
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeMatch || sendingMessage) return;

    const content = messageText.trim();
    setMessageText('');
    setSendingMessage(true);

    try {
      const message = await sendMatchMessage(activeMatch.id, content);
      if (message) {
        setMatchMessages(prev => [...prev, message]);
        setTimeout(() => {
          messagesEndRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageText(content);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStartVoiceChat = async () => {
    if (!activeMatch || !currentUserId) return;
    
    try {
      // Request audio permissions (using expo-av for now as expo-audio doesn't have direct permission methods)
      // Permissions are usually handled automatically when recording starts

      setIsVoiceActive(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Broadcast voice status to partner
      const channel = supabase.channel(`match-voice-${activeMatch.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'voice-status',
        payload: {
          userId: currentUserId,
          inVoice: true,
        },
      });
    } catch (error) {
      console.error('Error starting voice chat:', error);
      Alert.alert('Error', 'Failed to start voice chat. Please try again.');
      setIsVoiceActive(false);
    }
  };

  const startRecording = async () => {
    try {
      // Permissions are handled automatically when prepareToRecordAsync is called

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      console.log('✅ Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecordingAndSend = async () => {
    const status = recorder.getStatus();
    if (!status.isRecording) return;
    
    try {
      recorder.stop();
      const newStatus = recorder.getStatus();
      const uri = newStatus.url;
      setIsRecording(false);
      
      if (uri && !isMuted) {
        try {
          // Read audio file as base64
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          // Convert base64 to blob for upload
          const byteArray = Buffer.from(base64, 'base64');
          
          // Upload to Supabase Storage
          const fileName = `${activeMatch?.id}/${currentUserId}_${Date.now()}.m4a`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('voice-chats')
            .upload(fileName, byteArray, {
              contentType: 'audio/m4a',
              upsert: false,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            // If bucket doesn't exist, create it via message instead
            Alert.alert('Note', 'Voice chat storage not configured. Using text messages for now.');
            return;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('voice-chats')
            .getPublicUrl(fileName);

          // Broadcast audio ready event
          const channel = supabase.channel(`match-voice-${activeMatch?.id}`);
          await channel.send({
            type: 'broadcast',
            event: 'audio-ready',
            payload: {
              userId: currentUserId,
              audioUrl: urlData.publicUrl,
              timestamp: Date.now(),
            },
          });

          console.log('✅ Voice message sent:', urlData.publicUrl);
        } catch (error) {
          console.error('Error processing audio:', error);
          Alert.alert('Error', 'Failed to send voice message. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const handleEndVoiceChat = async () => {
    if (!activeMatch || !currentUserId) return;
    
    try {
      // Stop recording
      if (recorder.isRecording) {
        await recorder.stop();
        setIsRecording(false);
      }

      // Stop playing
      if (player.playing) {
        player.pause();
        setIsPlaying(false);
      }

      setIsVoiceActive(false);
      setIsMuted(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Broadcast voice status to partner
      const channel = supabase.channel(`match-voice-${activeMatch.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'voice-status',
        payload: {
          userId: currentUserId,
          inVoice: false,
        },
      });
    } catch (error) {
      console.error('Error ending voice chat:', error);
    }
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePushToTalk = async () => {
    if (!recorder.isRecording) {
      await startRecording();
    } else {
      await stopRecordingAndSend();
    }
  };

  const formatTimeRemaining = (minutes: number) => {
    if (minutes <= 0) return 'Expired';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Matches & Therapy</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'therapy' && styles.tabActive]}
          onPress={() => {
            setActiveTab('therapy');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'therapy' && styles.tabTextActive]}>
            AI Therapy
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'matching' && styles.tabActive]}
          onPress={() => {
            setActiveTab('matching');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'matching' && styles.tabTextActive]}>
            Find Match
          </Text>
        </Pressable>
      </View>

      {activeTab === 'therapy' ? (
        // AI Therapy Prompts Section
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
      ) : !activeMatch ? (
        // Matching Section - Browse Users
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
              contentContainerStyle={styles.usersList}
              refreshing={loadingUsers}
              onRefresh={loadAvailableUsers}
            />
          )}
        </View>
      ) : (
        // Active Match Chat
        <View style={styles.matchChatContainer}>
          <View style={styles.matchHeader}>
            <View>
              <Text style={styles.matchTitle}>Anonymous Match</Text>
              <Text style={styles.matchTimer}>
                Time remaining: {formatTimeRemaining(activeMatch.timeRemaining)}
              </Text>
            </View>
            <View style={styles.matchActions}>
              <Pressable style={styles.matchActionButton} onPress={handleExtendMatch}>
                <Feather name="clock" size={18} color="#ec4899" />
                <Text style={styles.matchActionText}>+15m</Text>
              </Pressable>
              <Pressable
                style={[styles.matchActionButton, styles.endButton]}
                onPress={handleEndMatch}
              >
                <Feather name="x" size={18} color="#ef4444" />
                <Text style={[styles.matchActionText, styles.endButtonText]}>End</Text>
              </Pressable>
            </View>
          </View>

          {/* Voice Chat Section */}
          {!isVoiceActive ? (
            <Pressable
              style={styles.startVoiceButton}
              onPress={handleStartVoiceChat}
            >
              <Feather name="mic" size={20} color="#fff" />
              <Text style={styles.startVoiceButtonText}>Start Voice Chat</Text>
            </Pressable>
          ) : (
            <View style={styles.voiceChatContainer}>
              <View style={styles.voiceChatHeader}>
                <View style={styles.voiceChatStatus}>
                  <View style={[styles.voiceIndicator, partnerInVoice && styles.voiceIndicatorActive]} />
                  <Text style={styles.voiceChatStatusText}>
                    {partnerInVoice ? 'Connected' : 'Waiting for partner...'}
                  </Text>
                </View>
                <Pressable
                  style={[styles.voiceControlButton, isMuted && styles.voiceControlButtonMuted]}
                  onPress={handleToggleMute}
                >
                  <Feather name={isMuted ? "mic-off" : "mic"} size={18} color="#fff" />
                </Pressable>
              </View>
              
              {/* Push to Talk Button */}
              <Pressable
                style={[
                  styles.pushToTalkButton,
                  isRecording && styles.pushToTalkButtonActive,
                ]}
                onPressIn={handlePushToTalk}
                onPressOut={stopRecordingAndSend}
                disabled={isMuted}
              >
                {isRecording ? (
                  <>
                    <View style={styles.recordingIndicator} />
                    <Text style={styles.pushToTalkButtonText}>Recording... Release to send</Text>
                  </>
                ) : (
                  <>
                    <Feather name="mic" size={24} color="#fff" />
                    <Text style={styles.pushToTalkButtonText}>Hold to Talk</Text>
                  </>
                )}
              </Pressable>

              {isPlaying && (
                <View style={styles.playingIndicator}>
                  <ActivityIndicator size="small" color="#10b981" />
                  <Text style={styles.playingText}>Playing message...</Text>
                </View>
              )}

              <Pressable
                style={styles.endVoiceButton}
                onPress={handleEndVoiceChat}
              >
                <Feather name="phone-off" size={18} color="#fff" />
                <Text style={styles.endVoiceButtonText}>End Voice Chat</Text>
              </Pressable>
            </View>
          )}

          {/* Messages Section - Hide when voice is active */}
          {!isVoiceActive && (
            <>
              <FlatList
                ref={messagesEndRef}
                data={matchMessages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isMe = item.sender_id === currentUserId;
                  return (
                    <View
                      style={[
                        styles.messageBubble,
                        isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isMe ? styles.messageTextMe : styles.messageTextThem,
                        ]}
                      >
                        {item.content}
                      </Text>
                      <Text style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  );
                }}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                onContentSizeChange={() => {
                  messagesEndRef.current?.scrollToEnd({ animated: true });
                }}
              />

              <View style={styles.messageInputContainer}>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Type a message..."
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  maxLength={500}
                />
                <Pressable
                  style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="send" size={20} color="#fff" />
                  )}
                </Pressable>
              </View>
            </>
          )}

          <FlatList
            ref={messagesEndRef}
            data={matchMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isMe = item.sender_id === currentUserId;
              return (
                <View
                  style={[
                    styles.messageBubble,
                    isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isMe ? styles.messageTextMe : styles.messageTextThem,
                    ]}
                  >
                    {item.content}
                  </Text>
                  <Text style={styles.messageTime}>
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => {
              messagesEndRef.current?.scrollToEnd({ animated: true });
            }}
          />

          <View style={styles.messageInputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Type a message..."
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || sendingMessage}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={20} color="#fff" />
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
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 16,
  },
  tabActive: {
    borderBottomColor: '#ec4899',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
  },
  tabTextActive: {
    color: '#ec4899',
  },
  content: {
    flex: 1,
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
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
    backgroundColor: '#f9fafb',
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
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
  messageInputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e1e5e9',
    backgroundColor: '#f9fafb',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
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
