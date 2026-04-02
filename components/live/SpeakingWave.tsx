import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type Props = {
  active: boolean;
  level?: number;
  color?: string;
  compact?: boolean;
};

export function SpeakingWave({ active, level = 0, color = '#ffffff', compact = false }: Props) {
  const values = useRef([new Animated.Value(0.2), new Animated.Value(0.35), new Animated.Value(0.25)]).current;

  const barHeights = useMemo(
    () => (compact ? [10, 16, 12] : [14, 22, 16]),
    [compact]
  );

  useEffect(() => {
    const normalized = Math.max(0, Math.min(1, level || 0));
    const base = active ? Math.max(0.18, normalized) : 0.14;
    const targetValues = values.map((_, index) => {
      const variance = active ? (0.16 + index * 0.05) : 0.02;
      const jitter = active ? Math.random() * variance : 0;
      return Math.max(0.12, Math.min(1, base + jitter));
    });

    const animation = Animated.parallel(
      values.map((value, index) =>
        Animated.timing(value, {
          toValue: targetValues[index],
          duration: active ? 130 : 220,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        })
      )
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [active, level, values]);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              height: value.interpolate({
                inputRange: [0, 1],
                outputRange: [4, barHeights[index]],
              }),
            },
            compact && styles.barCompact,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 22,
  },
  wrapCompact: {
    height: 16,
    gap: 2,
  },
  bar: {
    width: 4,
    borderRadius: 999,
    opacity: 0.95,
  },
  barCompact: {
    width: 3,
  },
});
