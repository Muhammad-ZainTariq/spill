import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { tokens } from '@/app/ui/tokens';

/**
 * Fallback for web: same skeleton placeholder as .native.tsx.
 */
export function SkeletonBox({ style }: { style?: any }) {
  const a = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.75, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.35, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: a }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
});

export default function SkeletonBoxRoute() {
  return null;
}
