import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';
import { countSessionsForTherapist, listOpenSlotsForTherapist, listTherapistProfiles, TherapistProfile } from '@/app/therapist/_marketplace';

type TherapistCard = TherapistProfile & { nextSlotAt?: string | null; openSlots?: number; sessionsCount?: number };

function fmtWhen(iso?: string | null) {
  if (!iso) return 'No slots yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No slots yet';
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TherapistsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TherapistCard[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      const list = await listTherapistProfiles(30);
      const enriched = await Promise.all(
        list.map(async (p) => {
          try {
            const [slots, sessionsCount] = await Promise.all([
              listOpenSlotsForTherapist(p.id, 100),
              countSessionsForTherapist(p.id),
            ]);
            return {
              ...p,
              openSlots: slots.length,
              nextSlotAt: slots[0]?.start_at || null,
              sessionsCount,
            };
          } catch {
            return { ...p, openSlots: 0, nextSlotAt: null, sessionsCount: 0 };
          }
        })
      );
      setItems(enriched);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Therapists</Text>
          <Text style={styles.subtitle}>Verified profiles and availability</Text>
        </View>
        <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
          <Feather name="refresh-cw" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/therapist/${item.id}` as any)}
            >
              <View style={styles.cardTop}>
                <View style={styles.identity}>
                  <View style={styles.avatar}>
                    <Feather name="heart" size={18} color="#92400e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.display_name || 'Therapist'}
                    </Text>
                    <Text style={styles.spec} numberOfLines={1}>
                      {item.specialization || 'Mental health support'}
                    </Text>
                  </View>
                </View>
                <View style={styles.badge}>
                  <Feather name="check-circle" size={14} color={tokens.colors.success} />
                  <Text style={styles.badgeText}>Verified</Text>
                </View>
              </View>

              {item.ai_persona_summary ? (
                <Text style={styles.summary} numberOfLines={2}>
                  {String(item.ai_persona_summary)}
                </Text>
              ) : null}

              {(Number(item.avg_rating || 0) > 0 || Number(item.review_count || 0) > 0) ? (
                <View style={styles.ratingRow}>
                  <Feather name="star" size={14} color={tokens.colors.pink} />
                  <Text style={styles.ratingText}>
                    {Number(item.avg_rating || 0).toFixed(1)} ({Number(item.review_count || 0)} reviews)
                  </Text>
                </View>
              ) : null}

              <View style={styles.metaRow}>
                <View style={styles.availabilityPill}>
                  <Feather name="clock" size={14} color="#92400e" />
                  <Text style={styles.availabilityText}>{fmtWhen(item.nextSlotAt)}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Feather name="calendar" size={14} color="#92400e" />
                  <Text style={styles.metaText}>{item.openSlots || 0} slots</Text>
                </View>
                <View style={styles.metaPill}>
                  <Feather name="users" size={14} color="#92400e" />
                  <Text style={styles.metaText}>{item.sessionsCount || 0} sessions</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No verified therapists yet</Text>
              <Text style={styles.muted}>When an admin approves a therapist, they’ll appear here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  muted: { fontSize: 13, fontWeight: '600', color: tokens.colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  card: {
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
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  name: { flex: 1, fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  badgeText: { fontSize: 12, fontWeight: '900', color: tokens.colors.success },
  spec: { marginTop: 2, fontSize: 12, fontWeight: '800', color: '#92400e' },
  summary: { marginTop: 10, fontSize: 12, fontWeight: '700', color: '#334155', lineHeight: 16 },
  ratingRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontSize: 12, fontWeight: '800', color: tokens.colors.textSecondary },
  metaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  availabilityPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  availabilityText: { fontSize: 12, fontWeight: '900', color: '#0f172a' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  metaText: { fontSize: 12, fontWeight: '800', color: '#92400e' },
});
