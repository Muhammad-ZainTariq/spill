import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@/app/ui/tokens';
import { listOpenSlotsForTherapist, listTherapistProfiles, TherapistProfile } from '@/app/therapist/marketplace';

type TherapistCard = TherapistProfile & { nextSlotAt?: string | null; openSlots?: number };

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
            const slots = await listOpenSlotsForTherapist(p.id, 100);
            return {
              ...p,
              openSlots: slots.length,
              nextSlotAt: slots[0]?.start_at || null,
            };
          } catch {
            return { ...p, openSlots: 0, nextSlotAt: null };
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
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name || 'Therapist'}
                </Text>
                <View style={styles.badge}>
                  <Feather name="check-circle" size={14} color={tokens.colors.success} />
                  <Text style={styles.badgeText}>Verified</Text>
                </View>
              </View>

              <Text style={styles.spec} numberOfLines={1}>
                {item.specialization || 'Mental health support'}
              </Text>

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
                <View style={styles.metaPill}>
                  <Feather name="clock" size={14} color={tokens.colors.textSecondary} />
                  <Text style={styles.metaText}>{fmtWhen(item.nextSlotAt)}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Feather name="calendar" size={14} color={tokens.colors.textSecondary} />
                  <Text style={styles.metaText}>{item.openSlots || 0} open</Text>
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
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
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
  spec: { marginTop: 6, fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  summary: { marginTop: 8, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },
  ratingRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontSize: 12, fontWeight: '800', color: tokens.colors.textSecondary },
  metaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  metaText: { fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
});

