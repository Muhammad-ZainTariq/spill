import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import {
  addGratitude,
  checkPremiumStatus,
  deleteGratitude,
  generateAIGratitude,
  getAverageMood,
  getGratitudeCount,
  getGratitudeEntries,
  getMoodEntries,
  getRandomGratitude,
  GratitudeEntry,
  logMood,
  MoodEntry,
} from '../functions';

const screenWidth = Dimensions.get('window').width;

const MOOD_EMOJIS = ['😢', '😔', '😐', '😊', '😄'];
const MOOD_LABELS = ['Very Sad', 'Sad', 'Neutral', 'Good', 'Great'];

// Mood color scheme
const MOOD_COLORS = {
  1: { primary: '#ef4444', light: '#fee2e2', label: 'Very Sad' }, // Red
  2: { primary: '#f97316', light: '#ffedd5', label: 'Sad' }, // Orange
  3: { primary: '#eab308', light: '#fef9c3', label: 'Neutral' }, // Yellow
  4: { primary: '#22c55e', light: '#dcfce7', label: 'Good' }, // Green
  5: { primary: '#10b981', light: '#d1fae5', label: 'Great' }, // Emerald
};

// Get color for a mood value
const getMoodColor = (value: number) => {
  const rounded = Math.round(value);
  return MOOD_COLORS[rounded as keyof typeof MOOD_COLORS] || MOOD_COLORS[3];
};

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
  const [moodNote, setMoodNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    loadData();
    checkPremium();
    const cleanup = setupShakeDetection();

    return () => {
      if (cleanup) cleanup();
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
    if (gratitudeCount === 0) {
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

  const handleMoodSelect = async (moodValue: number) => {
    setSelectedMood(moodValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMoodSubmit = async () => {
    if (!selectedMood) {
      Alert.alert('Select a Mood', 'Please choose how you\'re feeling');
      return;
    }

    setSubmitting(true);
    try {
      const entry = await logMood(selectedMood, moodNote.trim() || undefined);
      if (entry) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowMoodModal(false);
        setSelectedMood(null);
        setMoodNote('');
        loadData();
      } else {
        Alert.alert('Error', 'Failed to log mood. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting mood:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

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

  // Prepare chart data for custom SVG chart
  const getChartData = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const dailyAverages = last7Days.map(date => {
      const dayEntries = moodEntries.filter(entry => {
        const entryDate = entry.created_at.split('T')[0];
        return entryDate === date;
      });

      if (dayEntries.length === 0) return null;
      const sum = dayEntries.reduce((acc, e) => acc + e.mood_value, 0);
      return sum / dayEntries.length;
    });

    return {
      labels: last7Days.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' })),
      values: dailyAverages,
    };
  };

  // Render custom beautiful chart with color-coded moods
  const renderCustomChart = () => {
    const chartData = getChartData();
    const chartWidth = screenWidth - 64;
    const chartHeight = 240;
    const padding = 50;
    const graphWidth = chartWidth - padding * 2;
    const graphHeight = chartHeight - padding * 2;
    
    const maxValue = 5;
    const minValue = 1;
    const valueRange = maxValue - minValue;

    // Convert values to coordinates with colors
    const points = chartData.values.map((value, index) => {
      const x = padding + (index / (chartData.values.length - 1 || 1)) * graphWidth;
      const y = padding + graphHeight - ((value || minValue - 0.5) - minValue) / valueRange * graphHeight;
      const moodColor = value ? getMoodColor(value) : MOOD_COLORS[3];
      return { x, y, value: value || null, color: moodColor };
    });

    // Create smooth path segments with different colors
    const createSmoothPath = (points: { x: number; y: number }[]) => {
      if (points.length < 2) return '';
      
      let path = `M ${points[0].x} ${points[0].y}`;
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        if (next) {
          const cp1x = prev.x + (curr.x - prev.x) / 2;
          const cp1y = prev.y;
          const cp2x = curr.x - (next.x - curr.x) / 2;
          const cp2y = curr.y;
          path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
        } else {
          path += ` L ${curr.x} ${curr.y}`;
        }
      }
      
      return path;
    };

    const validPoints = points.filter(p => p.value !== null);
    
    // Early return only if no data at all
    if (validPoints.length === 0) {
      return (
        <View style={styles.chartContainer}>
          <Text style={styles.noDataText}>No mood data yet</Text>
          <Text style={styles.noDataSubtext}>Log your first mood to see it here</Text>
        </View>
      );
    }
    
    // Create colored line segments with smooth curves (only if 2+ points)
    const lineSegments = [];
    if (validPoints.length >= 2) {
      for (let i = 0; i < validPoints.length - 1; i++) {
        const p1 = validPoints[i];
        const p2 = validPoints[i + 1];
        const p0 = i > 0 ? validPoints[i - 1] : p1;
        const p3 = i < validPoints.length - 2 ? validPoints[i + 2] : p2;
        
        // Calculate control points for smooth bezier curve
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        
        const segmentPath = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        // Use the color of the first point for the segment
        lineSegments.push({ path: segmentPath, color: p1.color.primary });
      }
    }

    // Create area path for gradient (using average color) - only if 2+ points
    const avgColor = validPoints.length > 0 
      ? validPoints.reduce((acc, p) => acc + p.value!, 0) / validPoints.length 
      : 3;
    const areaColor = getMoodColor(avgColor);
    
    let areaPath = '';
    if (validPoints.length >= 2) {
      const pathData = createSmoothPath(validPoints.map(p => ({ x: p.x, y: p.y })));
      
      // Build area path safely - avoid duplicate coordinates
      const lastPoint = validPoints[validPoints.length - 1];
      const firstPoint = validPoints[0];
      const bottomY = padding + graphHeight;
      
      // Build area path: line path -> bottom right -> bottom left -> close
      // Only add commands if coordinates are different
      areaPath = pathData.trim();
      
      // Get the last coordinates from the path to avoid duplicates
      const pathEndsAt = lastPoint;
      const bottomRight = { x: lastPoint.x, y: bottomY };
      const bottomLeft = { x: firstPoint.x, y: bottomY };
      
      // Add bottom right corner if different from path end
      if (Math.abs(pathEndsAt.x - bottomRight.x) > 0.1 || Math.abs(pathEndsAt.y - bottomRight.y) > 0.1) {
        areaPath += ` L ${bottomRight.x} ${bottomRight.y}`;
      }
      
      // Add bottom left corner if different from bottom right
      if (Math.abs(bottomRight.x - bottomLeft.x) > 0.1 || Math.abs(bottomRight.y - bottomLeft.y) > 0.1) {
        areaPath += ` L ${bottomLeft.x} ${bottomLeft.y}`;
      }
      
      // Close the path
      areaPath += ' Z';
    }

    return (
      <View>
        <Svg width={chartWidth} height={chartHeight} style={styles.chartSvg}>
          {/* Background grid */}
          <Defs>
            <LinearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={areaColor.primary} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={areaColor.primary} stopOpacity="0.05" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[1, 2, 3, 4, 5].map((value) => {
            const y = padding + graphHeight - ((value - minValue) / valueRange) * graphHeight;
            const gridColor = getMoodColor(value).light;
            return (
              <Line
                key={value}
                x1={padding}
                y1={y}
                x2={padding + graphWidth}
                y2={y}
                stroke={gridColor}
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            );
          })}

          {/* Colored area fill - only if 2+ points */}
          {areaPath && (
            <Path
              d={areaPath}
              fill="url(#areaGradient)"
            />
          )}

          {/* Colored line segments - only if 2+ points */}
          {lineSegments.map((segment, index) => (
            <Path
              key={index}
              d={segment.path}
              fill="none"
              stroke={segment.color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Data points with mood colors */}
          {validPoints.map((point, index) => (
            <Circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="8"
              fill={point.color.primary}
              stroke="#fff"
              strokeWidth="3"
            />
          ))}

          {/* Y-axis labels with mood colors */}
          {[1, 2, 3, 4, 5].map((value) => {
            const y = padding + graphHeight - ((value - minValue) / valueRange) * graphHeight;
            const moodColor = getMoodColor(value);
            return (
              <SvgText
                key={value}
                x={padding - 15}
                y={y + 5}
                fontSize="13"
                fill={moodColor.primary}
                textAnchor="end"
                fontWeight="700"
              >
                {value}
              </SvgText>
            );
          })}

          {/* X-axis labels */}
          {chartData.labels.map((label, index) => {
            const x = padding + (index / (chartData.labels.length - 1 || 1)) * graphWidth;
            return (
              <SvgText
                key={index}
                x={x}
                y={chartHeight - 15}
                fontSize="12"
                fill="#6b7280"
                textAnchor="middle"
                fontWeight="600"
              >
                {label}
              </SvgText>
            );
          })}
        </Svg>

        {/* Color Legend */}
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Mood Scale</Text>
          <View style={styles.legendRow}>
            {[1, 2, 3, 4, 5].map((value) => {
              const moodColor = MOOD_COLORS[value as keyof typeof MOOD_COLORS];
              return (
                <View key={value} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: moodColor.primary }]} />
                  <Text style={styles.legendLabel}>{moodColor.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mood & Gratitude</Text>
          <Text style={styles.headerSubtitle}>Track your feelings and positive moments</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickActionButton, styles.moodButton]}
            onPress={() => setShowMoodModal(true)}
          >
            <Text style={styles.quickActionEmoji}>😊</Text>
            <Text style={styles.quickActionText}>Check In</Text>
          </Pressable>
          <Pressable
            style={[styles.quickActionButton, styles.gratitudeButton]}
            onPress={() => setShowGratitudeModal(true)}
          >
            <Text style={styles.quickActionEmoji}>✨</Text>
            <Text style={styles.quickActionText}>Add Gratitude</Text>
          </Pressable>
        </View>

        {/* Mood Stats */}
        {averageMood !== null && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>This Week's Mood</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{averageMood.toFixed(1)}</Text>
                <Text style={styles.statLabel}>Average</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{moodEntries.length}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
            </View>
          </View>
        )}

        {/* Mood Chart */}
        {moodEntries.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Mood Trend (Last 7 Days)</Text>
            <View style={styles.chartContainer}>
              {renderCustomChart()}
            </View>
          </View>
        )}

        {/* Gratitude Jar */}
        <View style={styles.jarCard}>
          <View style={styles.jarHeader}>
            <Text style={styles.jarTitle}>✨ Gratitude Jar</Text>
            <View style={styles.jarBadge}>
              <Text style={styles.jarBadgeText}>{gratitudeCount}</Text>
            </View>
          </View>
          <Text style={styles.jarSubtitle}>Shake your phone or tap the button to see a random gratitude!</Text>
          <View style={styles.jarContainer}>
            <View style={styles.jarOuter}>
              <View style={styles.jar}>
                {/* Animated fill with gradient effect */}
                <View
                  style={[
                    styles.jarFill,
                    {
                      height: `${Math.max(jarFillPercentage, 5)}%`,
                    },
                  ]}
                >
                  <View style={styles.jarFillGradient} />
                  {jarFillPercentage > 20 && (
                    <View style={styles.jarSparkles}>
                      <Text style={styles.jarSparkle}>✨</Text>
                      <Text style={[styles.jarSparkle, styles.jarSparkle2]}>✨</Text>
                      <Text style={[styles.jarSparkle, styles.jarSparkle3]}>✨</Text>
                    </View>
                  )}
                </View>
                {/* Jar lid */}
                <View style={styles.jarLid} />
                {/* Count text */}
                <View style={styles.jarCountContainer}>
                  <Text style={styles.jarCount}>{gratitudeCount}</Text>
                  <Text style={styles.jarCountLabel}>gratitudes</Text>
                </View>
              </View>
            </View>
          </View>
          {gratitudeCount > 0 && (
            <Pressable
              style={styles.randomButton}
              onPress={handleShake}
            >
              <Feather name="shuffle" size={18} color="#fff" />
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
            <Text style={styles.emptyText}>No gratitudes yet</Text>
            <Text style={styles.emptySubtext}>Start adding positive moments to fill your jar!</Text>
          </View>
        )}
      </ScrollView>

      {/* Mood Check-In Modal */}
      <Modal
        visible={showMoodModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMoodModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>How are you feeling?</Text>
            <View style={styles.moodOptions}>
              {MOOD_EMOJIS.map((emoji, index) => {
                const moodValue = index + 1;
                return (
                  <Pressable
                    key={moodValue}
                    style={[
                      styles.moodOption,
                      selectedMood === moodValue && styles.moodOptionSelected,
                    ]}
                    onPress={() => handleMoodSelect(moodValue)}
                  >
                    <Text style={styles.moodEmoji}>{emoji}</Text>
                    <Text style={styles.moodLabel}>{MOOD_LABELS[index]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor="#9ca3af"
              value={moodNote}
              onChangeText={setMoodNote}
              multiline
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowMoodModal(false);
                  setSelectedMood(null);
                  setMoodNote('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.submitButton, !selectedMood && styles.disabledButton]}
                onPress={handleMoodSubmit}
                disabled={!selectedMood || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Gratitude Modal */}
      <Modal
        visible={showGratitudeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGratitudeModal(false)}
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
            <Text style={styles.randomGratitudeTitle}>✨ Random Gratitude ✨</Text>
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
    backgroundColor: '#f8f9fa',
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
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  moodButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#ec4899',
  },
  gratitudeButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#fbbf24',
  },
  quickActionEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
  chartCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  chartSvg: {
    borderRadius: 16,
  },
  legendContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  jarCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  jarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  jarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  jarBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  jarBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400e',
  },
  jarSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  randomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    marginTop: 24,
    gap: 10,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  randomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  jarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  jarOuter: {
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  jar: {
    width: 140,
    height: 200,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: '#fbbf24',
    backgroundColor: '#fef9e7',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  jarFill: {
    width: '100%',
    borderBottomLeftRadius: 65,
    borderBottomRightRadius: 65,
    position: 'relative',
    backgroundColor: '#fcd34d',
    minHeight: 10,
  },
  jarFillGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: '#fbbf24',
    opacity: 0.6,
  },
  jarSparkles: {
    position: 'absolute',
    top: '20%',
    left: '50%',
    transform: [{ translateX: -20 }],
  },
  jarSparkle: {
    fontSize: 16,
    position: 'absolute',
  },
  jarSparkle2: {
    left: -30,
    top: 10,
  },
  jarSparkle3: {
    left: 10,
    top: 15,
  },
  jarLid: {
    position: 'absolute',
    top: -8,
    left: -5,
    right: -5,
    height: 20,
    backgroundColor: '#fbbf24',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#f59e0b',
    zIndex: 10,
  },
  jarCountContainer: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -20 }],
    alignItems: 'center',
    zIndex: 5,
  },
  jarCount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#92400e',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  jarCountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
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
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 24,
    textAlign: 'center',
  },
  moodOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  moodOption: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    minWidth: 70,
  },
  moodOptionSelected: {
    backgroundColor: '#fce7f3',
    borderWidth: 2,
    borderColor: '#ec4899',
  },
  moodEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
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
    margin: 20,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  randomGratitudeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
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
});
