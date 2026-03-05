import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

const DEFAULT_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const DEFAULT_RETENTION = { top: 20, bottom: 20, left: 20, right: 20 };

/**
 * Fallback for web: same API as .native.tsx (Pressable wrapper).
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
  androidRippleColor = 'rgba(0,0,0,0.12)',
  accessibilityRole,
  accessibilityLabel,
  testID,
}: any) {
  const ripple = useMemo(() => {
    if (Platform.OS !== 'android') return undefined;
    return { color: androidRippleColor, foreground: true };
  }, [androidRippleColor]);

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
      onPressIn={onPressIn}
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
  base: {},
  pressed: { opacity: 0.88 },
});

export default function HuzzPressableRoute() {
  return null;
}
