/**
 * Shared chat UI – same interface as match-chat (messages + games).
 * Reused by therapist-session and match-chat for consistent, optimized chat experience.
 */
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import {
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareLayout } from '@/app/KeyboardAwareLayout.native';
import { HuzzPressable } from '@/app/ui/components/HuzzPressable.native';
import { SkeletonBox } from '@/app/ui/components/SkeletonBox.native';
import { tokens } from '@/app/ui/tokens';

export function formatTime(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDayLabel(d: Date | null): string {
  if (!d) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export type ChatDataItem =
  | { _type: 'day'; id: string; day: Date | null }
  | { _type: 'msg'; id: string; fromUid: string; text: string; createdAt: Date | null }
  | { _skeleton: true; id: string };

export interface SharedChatLayoutProps {
  header: React.ReactNode;
  chatData: ChatDataItem[];
  currentUserId: string | null;
  text: string;
  setText: (v: string) => void;
  onSend: () => void | Promise<void>;
  canSend: boolean;
  sending: boolean;
  contentAboveList?: React.ReactNode;
  contentBelowList?: React.ReactNode;
  showEmoji?: boolean;
  placeholder?: string;
  inputEditable?: boolean;
  onScrollToBottom?: () => void;
}

export function SharedChatLayout({
  header,
  chatData,
  currentUserId,
  text,
  setText,
  onSend,
  canSend,
  sending,
  contentAboveList,
  contentBelowList,
  showEmoji = false,
  placeholder = 'Message...',
  inputEditable = true,
  onScrollToBottom,
}: SharedChatLayoutProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<any>>(null);
  const atBottomRef = useRef(true);
  const [inputH, setInputH] = useState(40);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const scrollToBottom = useCallback(
    (animated = true) => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated });
      onScrollToBottom?.();
    },
    [onScrollToBottom]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => scrollToBottom(true));
    });
    return () => sub.remove();
  }, [scrollToBottom]);

  const bottomSafePadding = keyboardVisible ? 0 : Math.max(0, insets.bottom);
  const displayEmoji = showEmoji ? emojiOpen : false;

  return (
    <KeyboardAwareLayout>
      {header}

      {contentAboveList}

      <View style={chatStyles.listWrapper}>
        <FlatList
          ref={listRef}
          style={chatStyles.list}
          contentContainerStyle={chatStyles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={chatData}
          keyExtractor={(item) => String(item.id)}
          inverted
          scrollEventThrottle={100}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onScroll={(e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            atBottomRef.current = y < 40;
            setShowScrollToBottom(y > 120);
          }}
          renderItem={({ item }) => {
            if (item?._type === 'day') {
              return (
                <View style={chatStyles.dayRow}>
                  <View style={chatStyles.dayPill}>
                    <Text style={chatStyles.dayText}>{formatDayLabel(item.day)}</Text>
                  </View>
                </View>
              );
            }
            if (item?._skeleton) {
              const mine = item.id.endsWith('0') || item.id.endsWith('2') || item.id.endsWith('4');
              return (
                <View style={[chatStyles.bubble, mine ? chatStyles.bubbleMine : chatStyles.bubbleTheirs]}>
                  <SkeletonBox style={{ height: 10, width: mine ? 160 : 190 }} />
                </View>
              );
            }
            if (item?._type !== 'msg') return null;
            const mine = item.fromUid === currentUserId;
            return (
              <Animated.View entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic))}>
                <View style={[chatStyles.bubble, mine ? chatStyles.bubbleMine : chatStyles.bubbleTheirs]}>
                  <Text style={[chatStyles.bubbleText, mine ? chatStyles.bubbleTextMine : chatStyles.bubbleTextTheirs]}>
                    {String(item.text || '')}
                    <Text style={[chatStyles.timeInline, !mine && chatStyles.timeInlineTheirs]}>
                      {'  '}
                      {formatTime(item.createdAt)}
                    </Text>
                  </Text>
                </View>
              </Animated.View>
            );
          }}
        />
      </View>

      {displayEmoji ? (
        <View style={chatStyles.emojiPanel}>
          {['😀', '😂', '😍', '🥹', '😮', '😡', '👍', '🙏', '🔥', '💯', '❤️', '✨'].map((e) => (
            <HuzzPressable
              key={e}
              style={chatStyles.emojiBtn}
              onPress={() => setText((t) => `${t || ''}${e}`)}
              haptic="light"
            >
              <Text style={chatStyles.emoji}>{e}</Text>
            </HuzzPressable>
          ))}
        </View>
      ) : null}

      {contentBelowList}

      <View style={[chatStyles.composer, { paddingBottom: 12 + bottomSafePadding }]}>
        {showEmoji && (
          <HuzzPressable style={chatStyles.iconBtn} onPress={() => setEmojiOpen((v) => !v)} haptic="light">
            <Text style={chatStyles.iconBtnText}>{emojiOpen ? '⌨️' : '😊'}</Text>
          </HuzzPressable>
        )}

        <TextInput
          style={[chatStyles.input, { height: Math.max(40, Math.min(120, inputH)) }]}
          placeholder={placeholder}
          placeholderTextColor={tokens.colors.textMuted}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!atBottomRef.current) setShowScrollToBottom(true);
          }}
          multiline
          editable={inputEditable}
          onFocus={() => requestAnimationFrame(() => scrollToBottom(true))}
          onContentSizeChange={(e) => setInputH(e?.nativeEvent?.contentSize?.height || 40)}
        />

        <HuzzPressable
          style={[chatStyles.sendBtn, { opacity: canSend ? 1 : 0.5 }]}
          disabled={!canSend || sending}
          onPress={async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            await onSend();
            requestAnimationFrame(() => scrollToBottom(true));
          }}
          haptic="light"
        >
          <Text style={chatStyles.sendText}>{sending ? '…' : 'Send'}</Text>
        </HuzzPressable>
      </View>

      {showScrollToBottom ? (
        <HuzzPressable
          style={[chatStyles.scrollToBottomBtn, { bottom: 110 + bottomSafePadding }]}
          onPress={() => {
            scrollToBottom(true);
            setShowScrollToBottom(false);
          }}
          haptic="light"
        >
          <Text style={chatStyles.scrollToBottomText}>↓</Text>
        </HuzzPressable>
      ) : null}
    </KeyboardAwareLayout>
  );
}

export const chatStyles = StyleSheet.create<{
  listWrapper: ViewStyle;
  list: ViewStyle;
  listContent: ViewStyle;
  bubble: ViewStyle;
  bubbleMine: ViewStyle;
  bubbleTheirs: ViewStyle;
  bubbleText: TextStyle;
  bubbleTextMine: TextStyle;
  bubbleTextTheirs: TextStyle;
  timeInline: TextStyle;
  timeInlineTheirs: TextStyle;
  dayRow: ViewStyle;
  dayPill: ViewStyle;
  dayText: TextStyle;
  composer: ViewStyle;
  iconBtn: ViewStyle;
  iconBtnText: TextStyle;
  input: TextStyle;
  sendBtn: ViewStyle;
  sendText: TextStyle;
  emojiPanel: ViewStyle;
  emojiBtn: ViewStyle;
  emoji: TextStyle;
  scrollToBottomBtn: ViewStyle;
  scrollToBottomText: TextStyle;
  header: ViewStyle;
  headerBtn: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
}>({
  listWrapper: { flex: 1, minHeight: 0 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: tokens.spacing.screenHorizontal, paddingBottom: 12 },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 6,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: tokens.colors.pink },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(244, 114, 182, 0.10)' },
  bubbleText: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: tokens.colors.text },
  timeInline: { fontSize: 9, fontWeight: '400', opacity: 0.7, letterSpacing: 0.5 },
  timeInlineTheirs: { color: tokens.colors.textMuted, fontSize: 9, fontWeight: '400' },
  dayRow: { alignItems: 'center', marginBottom: 10 },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  dayText: { fontSize: 12, fontWeight: '500', lineHeight: 16, color: tokens.colors.textSecondary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, color: tokens.colors.text },
  input: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: tokens.colors.text,
  },
  sendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.pink,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20, color: tokens.colors.text },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  scrollToBottomText: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 8,
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '600', color: tokens.colors.text },
  subtitle: { fontSize: 12, fontWeight: '500', lineHeight: 16, color: tokens.colors.textMuted, marginTop: 2 },
});
