import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkInToStreak, getAllUserStreaks } from './functions';

export default function StreaksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [streaks, setStreaks] = useState<any[]>([]);

  const loadStreaks = async () => {
    try {
      setLoading(true);
      const data = await getAllUserStreaks();
      setStreaks(data);
    } catch (e) {
      console.error('Error loading streaks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStreaks();
  }, []);

  const handleCheckIn = async (streak: any) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await checkInToStreak(streak.group_id, streak.activity_type);
      loadStreaks();
    } catch (e) {
      console.error('Error checking into streak:', e);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const groupName = item.group?.name || 'Unknown group';
    const activityName = item.activity?.name || item.activity_type;

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/group?groupId=${item.group_id}&tab=streaks`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitle}>
            <Text style={styles.activityName} numberOfLines={1}>
              {activityName}
            </Text>
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText} numberOfLines={1}>
                {groupName}
              </Text>
            </View>
          </View>
          <View style={styles.streakNumbers}>
            <View style={styles.streakNumberPill}>
              <Feather name="zap" size={14} color="#f97316" />
              <Text style={styles.streakNumberText}>
                {item.current_streak} day{item.current_streak === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={styles.longestStreakText}>
              Best: {item.longest_streak}
            </Text>
          </View>
        </View>

        {item.activity?.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.activity.description}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Pressable
            style={styles.checkInButton}
            onPress={() => handleCheckIn(item)}
          >
            <Text style={styles.checkInButtonText}>Check in</Text>
          </Pressable>
          <Pressable
            style={styles.viewGroupButton}
            onPress={() => router.push(`/group?groupId=${item.group_id}`)}
          >
            <Text style={styles.viewGroupButtonText}>View group</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  if (loading && streaks.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading streaks...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>Your streaks</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={streaks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          streaks.length === 0 ? styles.emptyList : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="zap" size={32} color="#ec4899" />
            <Text style={styles.emptyTitle}>No streaks yet</Text>
            <Text style={styles.emptySubtitle}>
              Join a group and start a streak to see it here.
            </Text>
          </View>
        }
        onRefresh={loadStreaks}
        refreshing={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    marginRight: 12,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  groupBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  streakNumbers: {
    alignItems: 'flex-end',
  },
  streakNumberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff7ed',
  },
  streakNumberText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#ea580c',
  },
  longestStreakText: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b7280',
  },
  description: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkInButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ec4899',
  },
  checkInButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewGroupButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewGroupButtonText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});



