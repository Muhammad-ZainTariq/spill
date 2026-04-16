import type { MoodEntry } from '@/lib/moodStories';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const NODE_COLORS = ['#f97316', '#6366f1', '#38bdf8', '#a855f7', '#ec4899'] as const;

const THREAD_W = 54;
const CX = 27;
const SPACER_H = 10;
const NODE_H = 44;
const STEM_H = 7;
/** Pixels from row top down to where the SVG path starts (below stem) */
function topBeforeBridgePx(index: number): number {
  return (index === 0 ? SPACER_H + NODE_H : NODE_H) + STEM_H;
}
/** Show “View more” when story is at least this many characters */
const VIEW_MORE_THRESHOLD = 160;

type Props = {
  entries: MoodEntry[];
};

function nodeColorForIndex(index: number): string {
  return NODE_COLORS[index % NODE_COLORS.length];
}

function formatWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  let day: string;
  if (sameDay) day = 'Today';
  else if (isYesterday) day = 'Yesterday';
  else
    day = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return { day, time };
}

function buildBridgePath(h: number, variant: number): string {
  if (h < 12) {
    return `M ${CX} 0 L ${CX} ${h}`;
  }
  const v = variant % 6;
  /** Taller bridges need wider wiggles so it doesn’t read as a straight line */
  const amp = Math.min(1.75, 1 + h / 180);
  const a = (10 + (v % 4) * 2) * amp;
  const b = (8 + (v % 3) * 2) * amp;
  const y1 = h * 0.22;
  const y2 = h * 0.48;
  const y3 = h * 0.72;
  const y4 = h;
  switch (v) {
    case 0:
      return `M ${CX} 0 C ${CX - a} ${y1} ${CX + b} ${y2} ${CX - b * 0.5} ${y3} S ${CX + a} ${h * 0.9} ${CX} ${y4}`;
    case 1:
      return `M ${CX} 0 C ${CX + b} ${y1} ${CX - a} ${y2} ${CX + a * 0.6} ${y3} C ${CX - b} ${h * 0.85} ${CX + b * 0.5} ${h * 0.95} ${CX} ${y4}`;
    case 2:
      return `M ${CX} 0 Q ${CX - a} ${y2 * 0.6} ${CX + b} ${y2} T ${CX - b * 0.8} ${y3} Q ${CX + a} ${h * 0.88} ${CX} ${y4}`;
    case 3:
      return `M ${CX} 0 C ${CX - b} ${y1} ${CX + a} ${y2 * 1.1} ${CX} ${y3} C ${CX + b} ${h * 0.82} ${CX - a * 0.4} ${h * 0.94} ${CX} ${y4}`;
    case 4:
      return `M ${CX} 0 Q ${CX + a} ${y1} ${CX - b} ${y2} Q ${CX + b * 1.2} ${y3} ${CX - a * 0.5} ${h * 0.92} Q ${CX + a * 0.6} ${h * 0.98} ${CX} ${y4}`;
    default:
      return `M ${CX} 0 C ${CX + a} ${y1} ${CX - b} ${y2} ${CX + b * 0.7} ${y3} C ${CX - a} ${h * 0.86} ${CX + b} ${h * 0.96} ${CX} ${y4}`;
  }
}

function BendyBridge({
  height,
  variant,
  tintTop,
  tintBottom,
}: {
  height: number;
  variant: number;
  tintTop: string;
  tintBottom: string;
}) {
  const h = Math.max(Math.round(height), 8);
  const d = buildBridgePath(h, variant);
  return (
    <Svg width={THREAD_W} height={h}>
      <Path
        d={d}
        stroke="rgba(148, 163, 184, 0.45)"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={d}
        stroke={tintTop}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      <Path
        d={d}
        stroke={tintBottom}
        strokeWidth={0.9}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
    </Svg>
  );
}

function ThreadNode({ color }: { color: string }) {
  return (
    <View style={[styles.nodeOuter, { shadowColor: color }]}>
      <View style={[styles.nodeRing, { borderColor: `${color}55` }]}>
        <View style={[styles.nodeCore, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

type ReadModalPayload = {
  story: string;
  when: string;
  accent: string;
};

export function StoryTreeTimeline({ entries }: Props) {
  const insets = useSafeAreaInsets();
  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [entries]
  );

  const [readModal, setReadModal] = useState<ReadModalPayload | null>(null);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const onRowLayout = useCallback((entryId: string) => (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    setRowHeights((prev) => (prev[entryId] === h ? prev : { ...prev, [entryId]: h }));
  }, []);

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Feather name="edit-3" size={32} color="#cbd5e1" strokeWidth={2} />
        </View>
        <Text style={styles.emptyTitle}>Your thread is open</Text>
        <Text style={styles.emptySub}>
          Tap “Today’s story” and jot what happened — entries tangle in below, newest first.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {sorted.map((entry, index) => {
        const { day, time } = formatWhen(entry.created_at);
        const moodLevel = Math.min(Math.max(Math.round(entry.mood_value), 1), 5);
        const story = (entry.note || '').trim() || 'A quiet check-in.';
        const color = nodeColorForIndex(index);
        const doodleVariant = (index * 7 + moodLevel * 3) % 6;
        const nextColor =
          index < sorted.length - 1 ? nodeColorForIndex(index + 1) : color;
        const showBridge = index < sorted.length - 1;
        const whenLabel = `${day} · ${time}`;
        const showViewMore = story.length >= VIEW_MORE_THRESHOLD;
        const rowH = rowHeights[entry.id];
        const topPx = topBeforeBridgePx(index);
        const bridgeH =
          showBridge && rowH != null ? Math.max(12, rowH - topPx) : 0;

        return (
          <View key={entry.id} style={styles.row} onLayout={onRowLayout(entry.id)}>
            <View style={[styles.threadCol, showBridge && styles.threadColStretch]}>
              {index === 0 ? <View style={styles.firstSpacer} /> : null}
              <ThreadNode color={color} />
              {showBridge ? (
                <View style={styles.bridgeWrap}>
                  <View style={[styles.nodeStem, { backgroundColor: color }]} />
                  {bridgeH > 0 ? (
                    <View style={[styles.bridgeSvgWrap, { height: bridgeH }]}>
                      <BendyBridge
                        height={bridgeH}
                        variant={doodleVariant}
                        tintTop={color}
                        tintBottom={nextColor}
                      />
                    </View>
                  ) : (
                    <View style={styles.bridgePlaceholder} />
                  )}
                </View>
              ) : null}
            </View>

            <View style={[styles.card, { borderLeftColor: color }]}>
              <View style={styles.cardHeader}>
                <View style={styles.datePill}>
                  <Feather name="calendar" size={13} color="#64748b" />
                  <Text style={styles.dateText}>{whenLabel}</Text>
                </View>
                <View style={[styles.moodDot, { backgroundColor: color }]} />
              </View>

              <Text
                style={styles.storyText}
                numberOfLines={showViewMore ? 4 : undefined}
                ellipsizeMode="tail"
              >
                {story}
              </Text>

              {showViewMore ? (
                <Pressable
                  onPress={() =>
                    setReadModal({ story, when: whenLabel, accent: color })
                  }
                  style={({ pressed }) => [styles.viewMoreBtn, pressed && { opacity: 0.75 }]}
                  hitSlop={8}
                >
                  <Text style={[styles.viewMoreText, { color }]}>View more</Text>
                  <Feather name="chevron-right" size={16} color={color} />
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Modal
        visible={readModal != null}
        animationType="fade"
        transparent
        onRequestClose={() => setReadModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setReadModal(null)}>
          <Pressable
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTop}>
              <View style={[styles.modalAccent, readModal && { backgroundColor: readModal.accent }]} />
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalKicker}>Story</Text>
                <Text style={styles.modalWhen}>{readModal?.when}</Text>
              </View>
              <Pressable
                onPress={() => setReadModal(null)}
                style={styles.modalClose}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Feather name="x" size={22} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalBody}>{readModal?.story}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingLeft: 2,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 6,
  },
  threadCol: {
    width: THREAD_W,
    alignItems: 'center',
  },
  threadColStretch: {
    alignSelf: 'stretch',
  },
  firstSpacer: {
    height: SPACER_H,
  },
  bridgeWrap: {
    width: THREAD_W,
    alignItems: 'center',
  },
  bridgeSvgWrap: {
    width: THREAD_W,
    alignItems: 'center',
    overflow: 'hidden',
  },
  bridgePlaceholder: {
    width: THREAD_W,
    minHeight: 32,
  },
  nodeStem: {
    width: 4,
    height: 7,
    borderRadius: 2,
    marginBottom: -1,
  },
  nodeOuter: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  nodeRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCore: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  card: {
    flex: 1,
    marginLeft: 12,
    marginBottom: 0,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
    borderLeftWidth: 4,
    maxWidth: '100%',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexShrink: 1,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.15,
    flexShrink: 1,
  },
  moodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  storyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0f172a',
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    maxHeight: '78%',
    paddingTop: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  modalAccent: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 48,
  },
  modalHeaderText: {
    flex: 1,
    paddingTop: 2,
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalWhen: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    padding: 4,
    marginTop: -4,
    marginRight: -4,
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalBody: {
    fontSize: 17,
    lineHeight: 26,
    color: '#1e293b',
    fontWeight: '400',
    paddingBottom: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
  },
});
