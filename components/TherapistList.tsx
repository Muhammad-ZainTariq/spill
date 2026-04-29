import { Feather } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { FlatList, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface Therapist {
  id: string;
  display_name?: string | null;
  specialization?: string | null;
  ai_persona_summary?: string | null;
  nextSlotAt?: string | null;
  openSlots?: number;
  sessionsCount?: number;
}

interface TherapistListProps {
  therapists: Therapist[];
  onTherapistPress: (id: string) => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Rendered above the “Available therapists” heading (e.g. upcoming private sessions). */
  listHeaderExtra?: ReactNode;
}

function fmtWhenSlot(iso?: string | null) {
  if (!iso) return 'No slots yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No slots yet';
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TherapistList({
  therapists,
  onTherapistPress,
  loading,
  style,
  onRefresh,
  refreshing,
  listHeaderExtra,
}: TherapistListProps) {
  const renderTherapist = ({ item }: { item: Therapist }) => (
    <Pressable style={styles.therapistCard} onPress={() => onTherapistPress(item.id)}>
      <View style={styles.therapistTop}>
        <View style={styles.therapistIdentity}>
          <View style={styles.therapistAvatar}>
            <Feather name="heart" size={18} color="#92400e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.therapistName} numberOfLines={1}>
              {item.display_name || 'Therapist'}
            </Text>
            <Text style={styles.therapistSpec} numberOfLines={1}>
              {item.specialization || 'Mental health support'}
            </Text>
          </View>
        </View>
        <View style={styles.therapistBadge}>
          <Feather name="check-circle" size={14} color="#10b981" />
          <Text style={styles.therapistBadgeText}>Verified</Text>
        </View>
      </View>
      {item.ai_persona_summary ? (
        <Text style={styles.therapistSummary} numberOfLines={2}>
          {String(item.ai_persona_summary)}
        </Text>
      ) : null}
      <View style={styles.therapistMetaRow}>
        <View style={styles.therapistAvailability}>
          <Feather name="clock" size={14} color="#92400e" />
          <Text style={styles.therapistAvailabilityText}>{fmtWhenSlot(item.nextSlotAt)}</Text>
        </View>
        <View style={styles.therapistMetaPill}>
          <Feather name="calendar" size={14} color="#92400e" />
          <Text style={styles.therapistMetaText}>{Number(item.openSlots || 0)} slots</Text>
        </View>
        <View style={styles.therapistMetaPill}>
          <Feather name="users" size={14} color="#92400e" />
          <Text style={styles.therapistMetaText}>{Number(item.sessionsCount || 0)} sessions</Text>
        </View>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, style]}>
        <Text style={styles.loadingText}>Loading therapists...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.container, style]}
      data={therapists}
      keyExtractor={(item) => item.id}
      renderItem={renderTherapist}
      contentContainerStyle={styles.listContent}
      refreshing={refreshing ?? false}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <View style={{ paddingBottom: 16 }}>
          {listHeaderExtra ? <View style={{ marginBottom: 18 }}>{listHeaderExtra}</View> : null}
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 10, textTransform: 'uppercase' }}>
            Available therapists
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No verified therapists yet</Text>
          <Text style={styles.emptySubtitle}>When an admin approves a therapist, they'll appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  therapistCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginBottom: 12,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  therapistTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  therapistIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  therapistAvatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  therapistName: { flex: 1, fontSize: 16, fontWeight: '900', color: '#111827' },
  therapistBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.10)' },
  therapistBadgeText: { fontSize: 12, fontWeight: '900', color: '#10b981' },
  therapistSpec: { marginTop: 2, fontSize: 12, fontWeight: '800', color: '#92400e' },
  therapistSummary: { marginTop: 10, fontSize: 12, fontWeight: '700', color: '#334155', lineHeight: 16 },
  therapistMetaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  therapistAvailability: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.55)' },
  therapistAvailabilityText: { fontSize: 12, fontWeight: '900', color: '#0f172a' },
  therapistMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.45)' },
  therapistMetaText: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  loadingContainer: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, color: '#6b7280' },
  emptyState: { paddingTop: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8 },
});