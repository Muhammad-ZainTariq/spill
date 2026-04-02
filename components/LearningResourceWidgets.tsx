import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

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
});
