import React, { useEffect, useState } from 'react';
import { View, Keyboard, Platform } from 'react-native';

/**
 * Wraps chat content and applies exactly the keyboard height as bottom padding
 * when the keyboard is visible, so the input sits flush on top of the keyboard
 * with no extra gap (WhatsApp-style).
 */
export function KeyboardAwareLayout({ children, style }: { children: React.ReactNode; style?: any }) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
    };
    const onHide = () => setKeyboardHeight(0);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  return (
    <View style={[{ flex: 1 }, style]} pointerEvents="box-none">
      <View style={{ flex: 1, minHeight: 0, paddingBottom: keyboardHeight }}>
        {children}
      </View>
    </View>
  );
}

// Expo Router: file under app/ must have default export (this is a shared layout, not a route).
export default function KeyboardAwareLayoutRoute() {
  return null;
}
