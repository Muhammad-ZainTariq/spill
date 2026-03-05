import React from 'react';
import { View } from 'react-native';

/**
 * Fallback for web / non-native: same API as .native.tsx but no keyboard insets.
 */
export function KeyboardAwareLayout({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ flex: 1 }, style]} pointerEvents="box-none">
      <View style={{ flex: 1, minHeight: 0 }}>
        {children}
      </View>
    </View>
  );
}

export default function KeyboardAwareLayoutRoute() {
  return null;
}
