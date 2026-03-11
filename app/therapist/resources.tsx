import {
  listTherapistResources,
  RESOURCE_CATEGORIES,
  TherapistResource,
  youtubeThumbnailUrl,
} from '@/app/therapist/marketplace';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';

const TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  book: 'Book',
  article: 'Article',
};

const TYPE_ICONS: Record<string, string> = {
  video: 'play-circle',
  book: 'book',
  article: 'file-text',
};

const CAT_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  'self-care': 'Self-care',
  research: 'Research',
  legal: 'Legal / Ethics',
};

export default function TherapistResourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [resources, setResources] = useState<TherapistResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listTherapistResources(200);
      setResources(list);
    } catch (e) {
      console.error(e);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filter ? resources.filter((r) => r.category === filter) : resources;

  const handleOpen = (item: TherapistResource) => {
    if (item.type === 'video' && item.url) {
      Linking.openURL(item.url);
    } else if (item.file_url) {
      Linking.openURL(item.file_url);
    } else if (item.url) {
      Linking.openURL(item.url);
    }
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Learning resources</Text>
          <Text style={styles.subtitle}>Videos, books & articles to deepen your practice</Text>
        </View>
        <Pressable onPress={load} style={styles.headerBtn} hitSlop={10}>
          <Feather name="refresh-cw" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable
          onPress={() => setFilter(null)}
          style={[styles.filterChip, !filter && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, !filter && styles.filterTextActive]}>All</Text>
        </Pressable>
        {RESOURCE_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setFilter(filter === c ? null : c)}
            style={[styles.filterChip, filter === c && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === c && styles.filterTextActive]}>{CAT_LABELS[c]}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const hasLink = !!(item.url || item.file_url);
            return (
              <Pressable
                style={styles.card}
                onPress={() => hasLink && handleOpen(item)}
                disabled={!hasLink}
              >
                {item.type === 'video' && item.youtube_id ? (
                  <View style={styles.thumbWrap}>
                    <Image
                      source={{ uri: youtubeThumbnailUrl(item.youtube_id, false) }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                    <View style={styles.playOverlay}>
                      <Feather name="play-circle" size={56} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>
                ) : (
                  <View style={styles.cardIcon}>
                    <Feather
                      name={(TYPE_ICONS[item.type] || 'book') as any}
                      size={28}
                      color={tokens.colors.pink}
                    />
                  </View>
                )}
                <View style={styles.cardContent}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.badges}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{TYPE_LABELS[item.type] || item.type}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeCat]}>
                        <Text style={styles.badgeText}>{CAT_LABELS[item.category] || item.category}</Text>
                      </View>
                    </View>
                  </View>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.author ? (
                    <Text style={styles.author}>— {item.author}</Text>
                  ) : null}
                  {hasLink ? (
                    <View style={styles.linkRow}>
                      <Feather
                        name={item.type === 'video' ? 'play-circle' : 'file-text'}
                        size={14}
                        color={tokens.colors.pink}
                      />
                      <Text style={styles.linkText}>
                        {item.type === 'video' ? 'Tap to watch' : 'Tap to view'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noLink}>No content available</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book-open" size={48} color={tokens.colors.textMuted} />
              <Text style={styles.emptyTitle}>No resources yet</Text>
              <Text style={styles.muted}>
                {filter ? 'No resources in this category.' : 'Your admin will add videos, books and articles here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 12,
  },
  headerBtn: { padding: 6 },
  title: { fontSize: 17, fontWeight: '600', color: tokens.colors.text },
  subtitle: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  muted: { fontSize: 13, color: tokens.colors.textMuted },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  filterChipActive: { borderColor: tokens.colors.pink, backgroundColor: 'rgba(244,114,182,0.12)' },
  filterText: { fontSize: 13, fontWeight: '600', color: tokens.colors.textSecondary },
  filterTextActive: { color: tokens.colors.pink },
  list: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  thumbWrap: { position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  thumb: { width: '100%', height: 140, borderRadius: 12 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(244,114,182,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardTop: { marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text },
  badges: { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.15)',
  },
  badgeCat: { backgroundColor: 'rgba(16,185,129,0.12)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: tokens.colors.textSecondary },
  cardDesc: { fontSize: 13, color: tokens.colors.textSecondary, lineHeight: 18, marginTop: 4 },
  author: { fontSize: 12, fontStyle: 'italic', color: tokens.colors.textMuted, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  linkText: { fontSize: 13, fontWeight: '600', color: tokens.colors.pink },
  noLink: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text },
});
