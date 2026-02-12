// Note: No tap animation here; only shake + static error logo
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

export default function ErrorScreen() {
  const router = useRouter();
  const { message } = useLocalSearchParams<{ message?: string }>();

  const shake = useSharedValue(0);
  const opacity = useSharedValue(0);
  // removed scale for tap animation on error screen

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300 });
    shake.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 60, easing: Easing.linear }),
        withTiming(10, { duration: 120, easing: Easing.linear }),
        withTiming(0, { duration: 60, easing: Easing.linear })
      ),
      3,
      false
    );
  }, [opacity, shake]);

  const carrotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shake.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#ec4899', paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={carrotStyle}>
        <Image
          source={require('@/assets/images/error-logo.png')}
          style={{ width: 180, height: 180, borderRadius: 24 }}
          contentFit="contain"
        />
      </Animated.View>
      <Text style={{ color: 'white', fontSize: 22, fontWeight: '800', marginTop: 16 }}>Wrong password broooo</Text>
      <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 16, lineHeight: 24, marginTop: 8 }}>
        {message || 'Please try again.'}
      </Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: 24, backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}>
        <Text style={{ color: '#ec4899', fontWeight: '700' }}>Go Back</Text>
      </Pressable>
    </View>
  );
}


