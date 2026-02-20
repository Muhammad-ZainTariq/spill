import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const GAME_TITLES: Record<string, string> = {
  tictactoe: 'Tic-Tac-Toe',
  connect4: 'Connect 4',
  chess: 'Chess',
  ludo: 'Ludo',
};

export default function GameWebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { room, gameType = 'tictactoe' } = useLocalSearchParams<{
    room?: string;
    gameType?: string;
  }>();

  const gameBaseUrl =
    (Constants as any)?.expoConfig?.extra?.gameBaseUrl ||
    (Constants as any)?.manifest?.extra?.gameBaseUrl ||
    '';

  const gameUrl = useMemo(() => {
    if (!gameBaseUrl.trim() || !room?.trim()) return null;
    const base = gameBaseUrl.replace(/\/$/, '');
    const path = gameType === 'chess' ? '/chess' : gameType === 'ludo' ? '/ludo' : '';
    const sep = (base + path).includes('?') ? '&' : '?';
    return `${base}${path}${sep}room=${encodeURIComponent(room)}`;
  }, [gameBaseUrl, room, gameType]);

  const title = GAME_TITLES[gameType] || 'Play';

  if (!gameBaseUrl.trim()) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>Play game</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.placeholder}>
          <Feather name="settings" size={48} color="#94a3b8" />
          <Text style={styles.placeholderTitle}>Game URL not set</Text>
          <Text style={styles.placeholderText}>
            Add your deployed game URL in app.json → extra → gameBaseUrl.{'\n\n'}
            Deploy a multiplayer game (e.g. Tic-Tac-Toe from GitHub), then set the frontend URL here.
          </Text>
        </View>
      </View>
    );
  }

  if (!room?.trim()) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No room ID. Open this screen from an active match.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.backBtn} />
      </View>
      <WebView
        source={{ uri: gameUrl! }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading game...</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  webview: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginTop: 12 },
  placeholderText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
