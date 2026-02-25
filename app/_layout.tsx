import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="success" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="error" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="auth-callback" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="signup" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="login" 
          options={{ 
              headerShown: false,
              gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="forgetpassword" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="reset-password" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="logout" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen 
          name="createpost" 
          options={{ 
            title: 'Create Post',
            headerShown: true,
          }} 
        />
        <Stack.Screen 
          name="settings" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="comments" 
          options={({ navigation }) => ({ 
            headerShown: true,
            headerBackTitle: '',
            headerTintColor: '#ec4899',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            title: 'Comments',
            gestureEnabled: true,
            headerLeft: () => (
              <TouchableOpacity 
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('(tabs)'))}
                activeOpacity={0.6}
                style={{ paddingHorizontal: 12 }}
              >
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 18 }}>{'<'}</Text>
              </TouchableOpacity>
            ),
          })} 
        />
        <Stack.Screen 
          name="profile" 
          options={({ navigation }) => ({ 
            headerShown: true,
            headerBackTitle: '',
            headerTintColor: '#ec4899',
            gestureEnabled: true,
            headerLeft: () => (
              <TouchableOpacity 
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('(tabs)'))}
                activeOpacity={0.6}
                style={{ paddingHorizontal: 12 }}
              >
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 18 }}>{'<'}</Text>
              </TouchableOpacity>
            ),
          })} 
        />
        <Stack.Screen 
          name="notifications" 
          options={{ 
            headerShown: true,
            headerBackTitle: '',
            headerTintColor: '#ec4899',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            title: 'Notifications',
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="message" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="group" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="streaks" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="premium" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="payment" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen 
          name="premium-welcome" 
          options={{ 
            headerShown: false,
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="match-chat" 
          options={{ 
            headerShown: false,
            gestureEnabled: true,
          }} 
        />
        <Stack.Screen
          name="chess"
          options={{
            headerShown: false,
            gestureEnabled: true,
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}