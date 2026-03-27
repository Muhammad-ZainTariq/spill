import {
  extractYoutubeId,
  listTherapistResources,
  getResourceCategoryLabel,
  normalizeResourceCategoryId,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  TherapistResource,
  youtubeThumbnailUrl,
} from '@/app/therapist/marketplace';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { tokens } from '@/app/ui/tokens';
import { BookCoverImage, ResourcePdfModal } from '@/app/components/LearningResourceWidgets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round(SCREEN_WIDTH * (9 / 16));

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

type ResourceSection = 'video' | 'book' | 'article';

export default function TherapistResourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [resources, setResources] = useState<TherapistResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<ResourceSection>('video');
  const [filter, setFilter] = useState<string | null>(null);
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<{ youtubeId: string; title: string } | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string } | null>(null);

  const topicPickerRows = useMemo(
    () => [
      { key: '__all__' as const, id: null as string | null },
      ...RESOURCE_CATEGORIES.map((c) => ({ key: c, id: c as string | null })),
    ],
    []
  );

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

  const filtered = resources.filter(
    (r) =>
      r.type === section && (filter == null || normalizeResourceCategoryId(r.category) === filter)
  );
  const hasTopicFilter = filter != null;

  const handleOpen = (item: TherapistResource) => {
    if (item.type === 'video' && item.youtube_id) {
      setPlayingVideo({ youtubeId: item.youtube_id, title: item.title });
    } else if (item.type === 'video' && item.url) {
      const yid = extractYoutubeId(item.url);
      if (yid) setPlayingVideo({ youtubeId: yid, title: item.title });
      else Linking.openURL(item.url);
    } else if (item.file_url && (item.type === 'book' || item.type === 'article')) {
      setPdfViewer({ url: item.file_url, title: item.title });
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

      <View style={styles.filtersBlock}>
        <View style={styles.sectionTabs}>
          <Pressable
            style={[styles.sectionTabBtn, section === 'video' && styles.sectionTabBtnActive]}
            onPress={() => setSection('video')}
          >
            <View style={styles.sectionTabInner}>
              <Feather
                name="play-circle"
                size={16}
                color={section === 'video' ? '#ffffff' : tokens.colors.textSecondary}
              />
              <Text style={[styles.sectionTabText, section === 'video' && styles.sectionTabTextActive]}>
                Videos
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.sectionTabBtn, section === 'book' && styles.sectionTabBtnActive]}
            onPress={() => setSection('book')}
          >
            <View style={styles.sectionTabInner}>
              <Feather
                name="book"
                size={16}
                color={section === 'book' ? '#ffffff' : tokens.colors.textSecondary}
              />
              <Text style={[styles.sectionTabText, section === 'book' && styles.sectionTabTextActive]}>
                Books
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.sectionTabBtn, section === 'article' && styles.sectionTabBtnActive]}
            onPress={() => setSection('article')}
          >
            <View style={styles.sectionTabInner}>
              <Feather
                name="file-text"
                size={16}
                color={section === 'article' ? '#ffffff' : tokens.colors.textSecondary}
              />
              <Text style={[styles.sectionTabText, section === 'article' && styles.sectionTabTextActive]}>
                Articles
              </Text>
            </View>
          </Pressable>
        </View>
        <Text style={styles.topicLabel}>Topic</Text>
        <Pressable
          style={styles.topicDropdown}
          onPress={() => setTopicPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose topic filter"
        >
          <Feather name="filter" size={18} color={tokens.colors.pink} style={styles.topicDropdownIcon} />
          <Text style={styles.topicDropdownText} numberOfLines={1}>
            {filter ? getResourceCategoryLabel(filter) : 'All topics'}
          </Text>
          <Feather name="chevron-down" size={20} color={tokens.colors.textSecondary} />
        </Pressable>
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
            const isVideoHero = item.type === 'video' && !!item.youtube_id;
            const isPdfHero =
              (item.type === 'book' || item.type === 'article') && !!item.file_url;
            const isHero = isVideoHero || isPdfHero;
            const body = (
              <>
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, isHero && styles.cardTitleVideo]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.badges}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{TYPE_LABELS[item.type] || item.type}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeCat]}>
                      <Text style={styles.badgeText}>{getResourceCategoryLabel(item.category)}</Text>
                    </View>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={isHero ? 3 : 2}>
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
              </>
            );
            return (
              <Pressable
                style={[styles.card, isHero && styles.cardVideo]}
                onPress={() => hasLink && handleOpen(item)}
                disabled={!hasLink}
              >
                {isVideoHero ? (
                  <>
                    <View style={styles.thumbWrapFull}>
                      <Image
                        source={{ uri: youtubeThumbnailUrl(item.youtube_id!, false) }}
                        style={styles.thumbHero}
                        resizeMode="cover"
                      />
                      <View style={styles.playOverlay}>
                        <Feather name="play-circle" size={64} color="rgba(255,255,255,0.95)" />
                      </View>
                    </View>
                    <View style={styles.cardBody}>{body}</View>
                  </>
                ) : isPdfHero ? (
                  <>
                    <View style={[styles.thumbWrapFull, styles.thumbWrapFullLight]}>
                      <BookCoverImage coverUrl={item.cover_url} />
                    </View>
                    <View style={styles.cardBody}>{body}</View>
                  </>
                ) : (
                  <>
                    <View style={styles.cardIcon}>
                      <Feather
                        name={(TYPE_ICONS[item.type] || 'book') as any}
                        size={28}
                        color={tokens.colors.pink}
                      />
                    </View>
                    <View style={styles.cardContent}>{body}</View>
                  </>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book-open" size={48} color={tokens.colors.textMuted} />
              <Text style={styles.emptyTitle}>No resources yet</Text>
              <Text style={styles.muted}>
                {hasTopicFilter
                  ? 'No items match this topic in this section.'
                  : section === 'video'
                    ? 'Your admin will add videos here.'
                    : section === 'book'
                      ? 'Your admin will add books here.'
                      : 'Your admin will add articles here.'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={topicPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setTopicPickerOpen(false)}
      >
        <View style={styles.topicModalWrap}>
          <Pressable style={styles.topicModalBackdrop} onPress={() => setTopicPickerOpen(false)} />
          <View style={styles.topicModalSheet}>
            <View style={styles.topicModalHeader}>
              <Text style={styles.topicModalTitle}>Filter by topic</Text>
              <Pressable onPress={() => setTopicPickerOpen(false)} hitSlop={12}>
                <Feather name="x" size={22} color={tokens.colors.text} />
              </Pressable>
            </View>
            <FlatList
              data={topicPickerRows}
              keyExtractor={(row) => row.key}
              keyboardShouldPersistTaps="handled"
              style={styles.topicModalList}
              renderItem={({ item: row }) => {
                const selected = filter === row.id;
                const label =
                  row.id == null ? 'All topics' : RESOURCE_CATEGORY_LABELS[row.id] ?? getResourceCategoryLabel(row.id);
                return (
                  <Pressable
                    style={[styles.topicModalRow, selected && styles.topicModalRowActive]}
                    onPress={() => {
                      setFilter(row.id);
                      setTopicPickerOpen(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[styles.topicModalRowText, selected && styles.topicModalRowTextActive]}>{label}</Text>
                    {selected ? <Feather name="check" size={18} color={tokens.colors.pink} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!playingVideo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPlayingVideo(null)}
      >
        <View style={styles.videoModal}>
          <View style={[styles.videoModalHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setPlayingVideo(null)} style={styles.videoCloseBtn}>
              <Feather name="x" size={24} color={tokens.colors.text} />
            </Pressable>
            <Text style={styles.videoModalTitle} numberOfLines={1}>
              {playingVideo?.title || 'Video'}
            </Text>
            <View style={{ width: 44 }} />
          </View>
          {playingVideo && (
            <WebView
              source={{
                uri: `https://www.youtube.com/embed/${playingVideo.youtubeId}?autoplay=1`,
              }}
              style={styles.videoWebView}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
          )}
        </View>
      </Modal>

      {pdfViewer ? (
        <ResourcePdfModal
          visible
          url={pdfViewer.url}
          title={pdfViewer.title}
          onClose={() => setPdfViewer(null)}
        />
      ) : null}
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
  filtersBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  sectionTabs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  sectionTabBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  sectionTabBtnActive: {
    backgroundColor: tokens.colors.pink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  sectionTabTextActive: { color: '#ffffff' },
  topicLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    marginTop: 6,
    marginBottom: 6,
  },
  topicDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  topicDropdownIcon: { marginRight: 2 },
  topicDropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  topicModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  topicModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topicModalSheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 28,
    zIndex: 1,
  },
  topicModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  topicModalTitle: { fontSize: 17, fontWeight: '800', color: tokens.colors.text },
  topicModalList: { maxHeight: 400 },
  topicModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  topicModalRowActive: { backgroundColor: 'rgba(244,114,182,0.06)' },
  topicModalRowText: { flex: 1, fontSize: 16, color: tokens.colors.text, fontWeight: '500' },
  topicModalRowTextActive: { color: tokens.colors.pink, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  cardVideo: {
    padding: 0,
    borderRadius: 18,
  },
  thumbWrapFull: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  thumbWrapFullLight: {
    backgroundColor: '#f1f5f9',
  },
  thumbHero: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  thumbWrap: { position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  thumb: { width: '100%', height: 140, borderRadius: 12 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
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
  cardTitleVideo: { fontSize: 17, lineHeight: 22 },
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

  videoModal: { flex: 1, backgroundColor: '#000' },
  videoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  videoCloseBtn: { padding: 10, marginLeft: -10 },
  videoModalTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: tokens.colors.text, marginLeft: 8 },
  videoWebView: {
    flex: 1,
    backgroundColor: '#000',
    minHeight: VIDEO_HEIGHT,
  },
});
