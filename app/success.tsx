import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export default function Success() {
  const router = useRouter();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.05, { duration: 600, easing: Easing.out(Easing.cubic) }),
      withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.cubic) })
    );

    const timeout = setTimeout(() => {
      router.replace('/(tabs)');
    }, 1800);

    return () => clearTimeout(timeout);
  }, [opacity, scale, router]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#ec4899', justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={animatedStyle}>
        <Image
          source={require('@/assets/images/animated logo.png')}
          style={{ width: 220, height: 220 }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}




