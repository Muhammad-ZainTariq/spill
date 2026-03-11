import { Feather } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface Therapist {
  id: string;
  display_name?: string | null;
  specialization?: string | null;
  ai_persona_summary?: string | null;
  nextSlotAt?: string | null;
  openSlots?: number;
}

interface TherapistListProps {
  therapists: Therapist[];
  onTherapistPress: (id: string) => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

function fmtWhenSlot(iso?: string | null) {
  if (!iso) return 'No slots yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No slots yet';
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TherapistList({ therapists, onTherapistPress, loading, style, onRefresh, refreshing }: TherapistListProps) {
  const renderTherapist = ({ item }: { item: Therapist }) => (
    <Pressable style={styles.therapistCard} onPress={() => onTherapistPress(item.id)}>
      <View style={styles.therapistTop}>
        <Text style={styles.therapistName} numberOfLines={1}>
          {item.display_name || 'Therapist'}
        </Text>
        <View style={styles.therapistBadge}>
          <Feather name="check-circle" size={14} color="#10b981" />
          <Text style={styles.therapistBadgeText}>Verified</Text>
        </View>
      </View>
      <Text style={styles.therapistSpec} numberOfLines={1}>
        {item.specialization || 'Mental health support'}
      </Text>
      {item.ai_persona_summary ? (
        <Text style={styles.therapistSummary} numberOfLines={2}>
          {String(item.ai_persona_summary)}
        </Text>
      ) : null}
      <View style={styles.therapistMetaRow}>
        <View style={styles.therapistMetaPill}>
          <Feather name="clock" size={14} color="#4b5563" />
          <Text style={styles.therapistMetaText}>{fmtWhenSlot(item.nextSlotAt)}</Text>
        </View>
        <View style={styles.therapistMetaPill}>
          <Feather name="calendar" size={14} color="#4b5563" />
          <Text style={styles.therapistMetaText}>{Number(item.openSlots || 0)} open</Text>
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
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  therapistTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  therapistName: { flex: 1, fontSize: 16, fontWeight: '900', color: '#111827' },
  therapistBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.10)' },
  therapistBadgeText: { fontSize: 12, fontWeight: '900', color: '#10b981' },
  therapistSpec: { marginTop: 6, fontSize: 13, fontWeight: '700', color: '#6b7280' },
  therapistSummary: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#111827', lineHeight: 16 },
  therapistMetaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  therapistMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6' },
  therapistMetaText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  loadingContainer: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, color: '#6b7280' },
  emptyState: { paddingTop: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8 },
});