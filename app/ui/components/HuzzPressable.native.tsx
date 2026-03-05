import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

const DEFAULT_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const DEFAULT_RETENTION = { top: 20, bottom: 20, left: 20, right: 20 };

/**
 * A tuned Pressable wrapper for “snap” responsiveness:
 * - consistent hitSlop + pressRetentionOffset
 * - subtle pressed feedback
 * - optional haptics on press-in
 */
export function HuzzPressable({
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  hitSlop = DEFAULT_HIT_SLOP,
  pressRetentionOffset = DEFAULT_RETENTION,
  haptic = false, // false | 'light' | 'medium'
  androidRippleColor = 'rgba(0,0,0,0.12)',
  accessibilityRole,
  accessibilityLabel,
  testID,
}: any) {
  const ripple = useMemo(() => {
    if (Platform.OS !== 'android') return undefined;
    return { color: androidRippleColor, foreground: true };
  }, [androidRippleColor]);

  const fireHaptic = useCallback(async () => {
    if (!haptic) return;
    try {
      const Haptics = await import('expo-haptics');
      const styleVal =
        haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(styleVal);
    } catch {
      // ignore (web/simulator edge cases)
    }
  }, [haptic]);

  const handlePressIn = useCallback(
    (e: any) => {
      fireHaptic();
      onPressIn && onPressIn(e);
    },
    [fireHaptic, onPressIn]
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      android_ripple={ripple}
      hitSlop={hitSlop}
      pressRetentionOffset={pressRetentionOffset}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        pressed && !disabled ? styles.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // Avoid delaying press feedback; keep it crisp.
  },
  pressed: {
    opacity: 0.88,
  },
});

// Expo Router: file under app/ must have default export (shared component, not a route).
export default function HuzzPressableRoute() {
  return null;
}
