import { StoryCheckinModal } from '@/components/StoryCheckinModal';
import { StoryTreeTimeline } from '@/components/StoryTreeTimeline';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addGratitude, checkPremiumStatus, deleteGratitude, generateAIGratitude, getAverageMood, getGratitudeCount, getGratitudeEntries, getMoodEntries, getRandomGratitude, GratitudeEntry, MoodEntry, } from '../functions';

export default function MoodGratitudeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [gratitudeEntries, setGratitudeEntries] = useState<GratitudeEntry[]>([]);
  const [gratitudeCount, setGratitudeCount] = useState(0);
  const [averageMood, setAverageMood] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showGratitudeModal, setShowGratitudeModal] = useState(false);
  const [showRandomGratitude, setShowRandomGratitude] = useState(false);
  const [randomGratitude, setRandomGratitude] = useState<GratitudeEntry | null>(null);
  const [gratitudeText, setGratitudeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  // Future You – lightweight, local goal state (can later be persisted)
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [futureTitle, setFutureTitle] = useState('');
  const [futureDate, setFutureDate] = useState('');
  const [futureNotes, setFutureNotes] = useState<string[]>([]);
  const [futureDraftNote, setFutureDraftNote] = useState('');
  const gratitudeCountRef = useRef(0);

  useEffect(() => {
    gratitudeCountRef.current = Math.max(gratitudeCount, gratitudeEntries.length);
  }, [gratitudeCount, gratitudeEntries.length]);

  useEffect(() => {
    loadData();
    checkPremium();

    return () => {
      if (Platform.OS !== 'web') {
        Accelerometer.removeAllListeners();
      }
    };
  }, []);

  const checkPremium = async () => {
    const premium = await checkPremiumStatus();
    setIsPremium(premium);
  };

  const loadData = async () => {
    try {
      const [moods, gratitudes, count, avg] = await Promise.all([
        getMoodEntries(30).catch(err => {
          console.error('Error loading mood entries:', err);
          return [];
        }),
        getGratitudeEntries(50).catch(err => {
          console.error('Error loading gratitude entries:', err);
          return [];
        }),
        getGratitudeCount().catch(err => {
          console.error('Error loading gratitude count:', err);
          return 0;
        }),
        getAverageMood(7).catch(err => {
          console.error('Error loading average mood:', err);
          return null;
        }),
      ]);
      setMoodEntries(moods || []);
      setGratitudeEntries(gratitudes || []);
      setGratitudeCount(count || 0);
      setAverageMood(avg);
    } catch (error) {
      console.error('Error loading data:', error);
      // Show user-friendly error if tables don't exist
      if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
        Alert.alert(
          'Setup Required',
          'Please run the database migration first. Check mood-gratitude-migration.sql',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const setupShakeDetection = () => {
    // Accelerometer only works on native platforms
    if (Platform.OS === 'web') {
      return () => {};
    }

    let subscription: any = null;

    (async () => {
      try {
        // Check if accelerometer is available
        const isAvailable = await Accelerometer.isAvailableAsync();
        if (!isAvailable) {
          console.log('Accelerometer not available');
          return;
        }

        let lastShake = 0;
        const SHAKE_THRESHOLD = 2.0; // Increased threshold for better detection
        const SHAKE_TIMEOUT = 2000;

        Accelerometer.setUpdateInterval(50); // More frequent updates

        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const acceleration = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();

          if (acceleration > SHAKE_THRESHOLD && now - lastShake > SHAKE_TIMEOUT) {
            lastShake = now;
            handleShake();
          }
        });
      } catch (error) {
        console.error('Error setting up shake detection:', error);
      }
    })();

    // Return cleanup function
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  };

  const handleShake = async () => {
    if (gratitudeCountRef.current === 0) {
      Alert.alert('No Gratitudes Yet', 'Add some gratitudes first to see random ones!');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const random = await getRandomGratitude();
    if (random) {
      setRandomGratitude(random);
      setShowRandomGratitude(true);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const cleanup = setupShakeDetection();
      return () => {
        if (cleanup) cleanup();
      };
    }, [])
  );

  const handleGratitudeSubmit = async () => {
    if (!gratitudeText.trim()) {
      Alert.alert('Write Something', 'Please write what you\'re grateful for');
      return;
    }

    setSubmitting(true);
    try {
      const entry = await addGratitude(gratitudeText.trim());
      if (entry) {
        setShowGratitudeModal(false);
        setGratitudeText('');
        loadData();
      } else {
        Alert.alert('Error', 'Failed to add gratitude. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting gratitude:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAIGratitude = async () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'AI-generated gratitude suggestions are available for premium members. Upgrade to unlock!',
        [
          { 
            text: 'Cancel', 
            style: 'cancel' 
          },
          { 
            text: 'Go Premium', 
            onPress: () => {
              // Close the gratitude modal first
              setShowGratitudeModal(false);
              setGratitudeText('');
              // Then navigate to premium
              router.push('/premium' as any);
            }
          }
        ]
      );
      return;
    }

    setGeneratingAI(true);
    try {
      const aiGratitude = await generateAIGratitude();
      if (aiGratitude) {
        setGratitudeText(aiGratitude);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', 'Failed to generate AI gratitude. Please try again.');
      }
    } catch (error) {
      console.error('Error generating AI gratitude:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleDeleteGratitude = async (id: string) => {
    Alert.alert(
      'Delete Gratitude',
      'Are you sure you want to delete this gratitude?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteGratitude(id);
            if (success) {
              loadData();
            }
          },
        },
      ]
    );
  };

  // Calculate jar fill percentage (max 100 entries = 100%)
  const jarFillPercentage = Math.min((gratitudeCount / 100) * 100, 100);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — pink kicker + accent & (same language as Matches tab) */}
        <View style={styles.header}>
          <Text style={styles.headerKicker}>Stories · Gratitude</Text>
          <Text style={styles.headerTitle}>
            Stories <Text style={styles.headerTitleAccent}>&</Text> gratitude
          </Text>
          <Text style={styles.headerSubtitle}>Write the day’s story anytime. It stacks in your thread below.</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.quickActionButton, styles.moodButton, pressed && styles.quickActionPressed]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMoodModal(true); }}
          >
            <View style={styles.quickActionIconWrap}>
              <Feather name="book-open" size={28} color="#ec4899" strokeWidth={2} />
            </View>
            <Text style={styles.quickActionText}>Today’s story</Text>
            <Text style={styles.quickActionHint}>Share what happened</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickActionButton, styles.gratitudeButton, pressed && styles.quickActionPressed]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowGratitudeModal(true); }}
          >
            <View style={styles.quickActionIconWrap}>
              <Feather name="plus-circle" size={28} color="#ec4899" strokeWidth={2} />
            </View>
            <Text style={styles.quickActionText}>Add Gratitude</Text>
            <Text style={styles.quickActionHint}>Capture a positive moment</Text>
          </Pressable>
        </View>

        {/* Mood Stats */}
        {(averageMood !== null || moodEntries.length > 0) && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>This week</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {averageMood !== null ? averageMood.toFixed(1) : '—'}
                </Text>
                <Text style={styles.statLabel}>Avg mood</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{moodEntries.length}</Text>
                <Text style={styles.statLabel}>Stories</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.storyTreeCard}>
          <View style={styles.storyTreeHeader}>
            <Text style={styles.storyTreeTitle}>Your story thread</Text>
            <Text style={styles.storyTreeSubtitle}>
              Newest first. Each scribble node is a moment — tap “Today’s story” to add another.
            </Text>
          </View>
          <StoryTreeTimeline entries={moodEntries} />
        </View>

        {/* Future You – simple goal + date + steps */}
        <View style={styles.futureCard}>
          <View style={styles.futureHeader}>
            <View style={styles.futureTitleRow}>
              <Feather name="target" size={22} color="#0f172a" strokeWidth={2} />
              <Text style={styles.futureTitle}>Future You</Text>
            </View>
            {futureDate ? (
              <View style={styles.futureBadge}>
                <Text style={styles.futureBadgeText}>By {futureDate}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.futureSubtitle}>
            Set a goal with a clear date and drop in small updates as you move towards it.
          </Text>
          {futureTitle ? (
            <View style={styles.futureCurrent}>
              <Text style={styles.futureCurrentLabel}>Current goal</Text>
              <Text style={styles.futureCurrentTitle}>{futureTitle}</Text>
              {futureNotes.length > 0 && (
                <Text style={styles.futureCurrentNote}>
                  Last step: {futureNotes[futureNotes.length - 1]}
                </Text>
              )}
            </View>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.futureButton,
              pressed && styles.quickActionPressed,
            ]}
            onPress={() => setShowFutureModal(true)}
          >
            <Text style={styles.futureButtonText}>
              {futureTitle ? 'Add a step' : 'Create a Future You goal'}
            </Text>
          </Pressable>
        </View>

        {/* Gratitude Jar – simplified, calmer visual */}
        <View style={styles.jarCard}>
          <View style={styles.jarHeader}>
            <View style={styles.jarTitleRow}>
              <Feather name="gift" size={22} color="#0f172a" strokeWidth={2} />
              <Text style={styles.jarTitle}>Gratitude Jar</Text>
            </View>
            <View style={styles.jarBadge}>
              <Text style={styles.jarBadgeText}>{gratitudeCount}</Text>
            </View>
          </View>
          <Text style={styles.jarSubtitle}>A softer place to store the good moments.</Text>
          <View style={styles.jarContainer}>
            <View style={styles.jarBarBackground}>
              <View
                style={[
                  styles.jarBarFill,
                  { width: `${Math.max(jarFillPercentage, 5)}%` },
                ]}
              />
            </View>
            <View style={styles.jarCountRow}>
              <Text style={styles.jarCount}>{gratitudeCount}</Text>
              <Text style={styles.jarCountLabel}>gratitudes saved</Text>
            </View>
          </View>
          {gratitudeCount > 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.randomButton,
                pressed && styles.quickActionPressed,
              ]}
              onPress={handleShake}
            >
              <Feather name="shuffle" size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.randomButtonText}>Random Gratitude</Text>
            </Pressable>
          )}
        </View>

        {/* Recent Gratitudes */}
        {gratitudeEntries.length > 0 && (
          <View style={styles.gratitudesCard}>
            <Text style={styles.gratitudesTitle}>Recent Gratitudes</Text>
            {gratitudeEntries.slice(0, 10).map((entry) => (
              <View key={entry.id} style={styles.gratitudeItem}>
                <Text style={styles.gratitudeText}>{entry.content}</Text>
                <Text style={styles.gratitudeDate}>
                  {new Date(entry.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => handleDeleteGratitude(entry.id)}
                >
                  <Feather name="trash-2" size={16} color="#ef4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {gratitudeEntries.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Feather name="gift" size={40} color="#e2e8f0" strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyText}>No gratitudes yet</Text>
            <Text style={styles.emptySubtext}>Tap “Add Gratitude” above to capture positive moments and fill your jar.</Text>
          </View>
        )}
      </ScrollView>

      {/* Future You Modal */}
      <Modal
        visible={showFutureModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFutureModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Future You</Text>
            <Text style={styles.modalDescription}>
              Where do you want to see yourself by a specific date? Set a clear goal and add small steps as you go.
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Your goal (e.g. Launch my first side project)"
              placeholderTextColor="#9ca3af"
              value={futureTitle}
              onChangeText={setFutureTitle}
            />
            <TextInput
              style={[styles.noteInput, { marginTop: 8 }]}
              placeholder="Target date (YYYY-MM-DD)"
              placeholderTextColor="#9ca3af"
              value={futureDate}
              onChangeText={setFutureDate}
            />
            <TextInput
              style={[styles.noteInput, { marginTop: 8 }]}
              placeholder="Today's step or note (optional)"
              placeholderTextColor="#9ca3af"
              multiline
              value={futureDraftNote}
              onChangeText={setFutureDraftNote}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowFutureModal(false)}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.submitButton,
                  !futureTitle && styles.disabledButton,
                ]}
                onPress={() => {
                  if (futureDraftNote.trim()) {
                    setFutureNotes((prev) => [...prev, futureDraftNote.trim()]);
                    setFutureDraftNote('');
                  }
                  setShowFutureModal(false);
                }}
                disabled={!futureTitle}
              >
                <Text style={styles.submitButtonText}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <StoryCheckinModal
        visible={showMoodModal}
        onClose={() => setShowMoodModal(false)}
        onSaved={loadData}
      />

      {/* Add Gratitude Modal */}
      <Modal
        visible={showGratitudeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGratitudeModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>What are you grateful for?</Text>
            
            {/* AI Suggestion Button */}
            <Pressable
              style={[styles.aiSuggestionButton, !isPremium && styles.aiSuggestionButtonLocked]}
              onPress={handleAIGratitude}
              disabled={generatingAI}
            >
              {generatingAI ? (
                <>
                  <ActivityIndicator size="small" color={isPremium ? "#fff" : "#9ca3af"} />
                  <Text style={[styles.aiSuggestionText, !isPremium && styles.aiSuggestionTextLocked]}>
                    Generating...
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="zap" size={18} color={isPremium ? "#fff" : "#9ca3af"} />
                  <Text style={[styles.aiSuggestionText, !isPremium && styles.aiSuggestionTextLocked]}>
                    {isPremium ? 'AI Suggestion' : 'AI Suggestion 🔒'}
                  </Text>
                </>
              )}
            </Pressable>

            <TextInput
              style={styles.gratitudeInput}
              placeholder="Write something positive..."
              placeholderTextColor="#9ca3af"
              value={gratitudeText}
              onChangeText={setGratitudeText}
              multiline
              numberOfLines={6}
              maxLength={300}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowGratitudeModal(false);
                  setGratitudeText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.submitButton, submitting && styles.disabledButton]}
                onPress={handleGratitudeSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Random Gratitude Modal */}
      <Modal
        visible={showRandomGratitude}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowRandomGratitude(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.randomGratitudeContent}>
            <Text style={styles.randomGratitudeTitle}>Random Gratitude</Text>
            {randomGratitude && (
              <>
                <Text style={styles.randomGratitudeText}>{randomGratitude.content}</Text>
                <Text style={styles.randomGratitudeDate}>
                  {new Date(randomGratitude.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </>
            )}
            <Pressable
              style={[styles.modalButton, styles.submitButton]}
              onPress={() => setShowRandomGratitude(false)}
            >
              <Text style={styles.submitButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
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
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  headerTitleAccent: {
    color: '#ec4899',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748b',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 14,
    marginBottom: 24,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  quickActionPressed: {
    opacity: 0.85,
  },
  moodButton: {},
  gratitudeButton: {},
  quickActionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fdf2f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  quickActionHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ec4899',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  storyTreeCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  storyTreeHeader: {
    marginBottom: 14,
  },
  storyTreeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    letterSpacing: -0.35,
  },
  storyTreeSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
  },
  jarCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  jarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  jarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  jarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  jarBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  jarBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  jarSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
  },
  randomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 28,
    gap: 10,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  randomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  jarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  jarBarBackground: {
    width: '100%',
    maxWidth: 260,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  jarBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#60a5fa',
  },
  jarCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  jarCount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
  },
  jarCountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  aiSuggestionButtonLocked: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  aiSuggestionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  aiSuggestionTextLocked: {
    color: '#9ca3af',
  },
  gratitudesCard: {
    backgroundColor: '#fff',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  gratitudesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  gratitudeItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gratitudeText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  gratitudeDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalKeyboardRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  noteInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    minHeight: 80,
    marginBottom: 24,
    textAlignVertical: 'top',
  },
  gratitudeInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    minHeight: 120,
    marginBottom: 24,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: '#ec4899',
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  randomGratitudeContent: {
    backgroundColor: '#fff',
    margin: 24,
    borderRadius: 28,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  randomGratitudeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 24,
  },
  randomGratitudeText: {
    fontSize: 18,
    color: '#111827',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 16,
  },
  randomGratitudeDate: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  // Future You styles
  futureCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  futureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  futureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  futureTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  futureBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  futureBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  futureSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 14,
  },
  futureCurrent: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  futureCurrentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  futureCurrentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  futureCurrentNote: {
    fontSize: 13,
    color: '#6b7280',
  },
  futureButton: {
    marginTop: 4,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
