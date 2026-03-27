import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { googlePdfViewerUrl } from '@/app/therapist/marketplace';
import { tokens } from '@/app/ui/tokens';

type BookCoverImageProps = {
  coverUrl?: string | null;
  style?: object;
  /** Fixed height for list thumbnails (admin lists). Omit for full 2:3 learning-resource hero cards. */
  compactHeight?: number;
};

/** Book/article hero: `cover_url` from Storage (PDF first page) or gradient + icon. */
export function BookCoverImage({ coverUrl, style, compactHeight }: BookCoverImageProps) {
  const uri = coverUrl?.trim();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const sizeStyle = compactHeight != null ? { width: '100%' as const, height: compactHeight } : null;
  const baseImageStyle = compactHeight != null ? [styles.coverImageCompact, sizeStyle] : styles.coverImage;
  const baseFallbackStyle = compactHeight != null ? [styles.coverFallbackCompact, sizeStyle] : styles.coverFallback;

  if (!uri || failed) {
    return (
      <LinearGradient
        colors={['#fce7f3', '#e2e8f0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[baseFallbackStyle, style]}
      >
        <Feather name="book" size={compactHeight != null ? 36 : 48} color={tokens.colors.pink} />
      </LinearGradient>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[baseImageStyle, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

type ResourcePdfModalProps = {
  visible: boolean;
  url: string;
  title: string;
  onClose: () => void;
};

/**
 * In-app PDF via Google Viewer (embed). Storage URL is not exposed as a raw browser tab by default.
 */
export function ResourcePdfModal({ visible, url, title, onClose }: ResourcePdfModalProps) {
  const insets = useSafeAreaInsets();
  const viewerUri = googlePdfViewerUrl(url);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (visible) setKey((k) => k + 1);
  }, [visible, url]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.pdfModalRoot, { paddingTop: insets.top }]}>
        <View style={styles.pdfHeader}>
          <Text style={styles.pdfTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} style={styles.pdfCloseBtn} hitSlop={12}>
            <Feather name="x" size={24} color={tokens.colors.text} />
          </Pressable>
        </View>
        <WebView
          key={key}
          source={{ uri: viewerUri }}
          style={styles.pdfWebView}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.pdfLoading}>
              <ActivityIndicator size="large" color={tokens.colors.pink} />
              <Text style={styles.pdfLoadingText}>Loading document…</Text>
            </View>
          )}
          allowsInlineMediaPlayback
          {...(Platform.OS === 'android' ? { nestedScrollEnabled: true } : {})}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  coverImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: '#f1f5f9',
  },
  coverImageCompact: {
    width: '100%',
    backgroundColor: '#f1f5f9',
  },
  coverFallback: {
    width: '100%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackCompact: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfModalRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  pdfTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: tokens.colors.text,
    marginRight: 8,
  },
  pdfCloseBtn: {
    padding: 4,
  },
  pdfWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 1,
  },
  pdfLoadingText: {
    marginTop: 12,
    fontSize: 15,
    color: tokens.colors.textMuted,
  },
});
