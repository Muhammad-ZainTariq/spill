import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { auth } from '@/lib/firebase';
import { getCurrentUserRole } from './functions';

/** Wait until Firebase Auth has hydrated the session (avoids routing as logged-out after OTP login). */
async function waitForAuthUser(maxMs = 5000): Promise<boolean> {
  if (auth.currentUser) return true;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 120));
    if (auth.currentUser) return true;
  }
  return !!auth.currentUser;
}

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

    let cancelled = false;

    const timeout = setTimeout(async () => {
      const ok = await waitForAuthUser(12000);
      if (cancelled) return;
      if (!ok || !auth.currentUser) {
        router.replace('/login');
        return;
      }
      try {
        const role = await getCurrentUserRole();
        if (cancelled) return;
        if (role.is_admin) {
          router.replace('/admin');
        } else if (role.role === 'therapist') {
          const uid = auth.currentUser.uid;
          if (role.is_therapist_verified && uid) router.replace(`/therapist/${uid}` as any);
          else router.replace('/therapist/verification' as any);
        } else {
          router.replace('/(tabs)');
        }
      } catch {
        router.replace('/(tabs)');
      }
    }, 1800);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
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




