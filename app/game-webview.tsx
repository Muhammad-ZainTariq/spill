import { subscribeToMatchGameInviteStatus } from '@/app/functions';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
  chess: 'Chess',
};

export default function GameWebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { room, gameType = 'tictactoe', opponentName: opponentNameParam, myName: myNameParam } = useLocalSearchParams<{
    room?: string;
    gameType?: string;
    opponentName?: string;
    myName?: string;
  }>();
  const [inviteDeclined, setInviteDeclined] = useState(false);

  useEffect(() => {
    if (!room?.trim() || !gameType) return;
    const unsub = subscribeToMatchGameInviteStatus(room, gameType, () => setInviteDeclined(true));
    return () => unsub();
  }, [room, gameType]);

  const gameBaseUrl =
    (Constants as any)?.expoConfig?.extra?.gameBaseUrl ||
    (Constants as any)?.manifest?.extra?.gameBaseUrl ||
    '';
  const gameSocketUrl =
    (Constants as any)?.expoConfig?.extra?.gameSocketUrl ||
    (Constants as any)?.manifest?.extra?.gameSocketUrl ||
    '';

  const gameUrl = useMemo(() => {
    if (!gameBaseUrl.trim() || !room?.trim()) return null;
    const base = gameBaseUrl.replace(/\/$/, '');
    const path = gameType === 'chess' ? '/chess' : '';
    const sep = (base + path).includes('?') ? '&' : '?';
    let url = `${base}${path}${sep}room=${encodeURIComponent(room)}`;
    const socketBase = gameSocketUrl.trim() ? gameSocketUrl.replace(/\/$/, '') : base;
    url += '&socketUrl=' + encodeURIComponent(socketBase);
    if (opponentNameParam?.trim()) {
      url += '&opponent=' + encodeURIComponent(opponentNameParam.trim());
    }
    if (myNameParam?.trim()) {
      url += '&name=' + encodeURIComponent(myNameParam.trim());
    }
    return url;
  }, [gameBaseUrl, gameSocketUrl, room, gameType, opponentNameParam, myNameParam]);

  const title = GAME_TITLES[gameType] || 'Play';

  if (!gameBaseUrl.trim()) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 6, paddingBottom: 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#0f172a" />
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
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 6, paddingBottom: 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#0f172a" />
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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6, paddingBottom: 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backBtn} />
      </View>
      <WebView
        source={{ uri: gameUrl! }}
        style={[styles.webview, gameType === 'chess' && { backgroundColor: '#0f172a' }]}
        startInLoadingState
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        injectedJavaScriptBeforeContentLoaded={`
          (function() {
            var c = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';
            var meta = document.querySelector('meta[name=viewport]');
            if (meta) meta.setAttribute('content', c);
            else {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              meta.content = c;
              (document.head || document.documentElement).appendChild(meta);
            }
            document.documentElement.style.touchAction = 'manipulation';
            document.documentElement.style.webkitTextSizeAdjust = '100%';
          })();
          true;
        `}
        injectedJavaScript={`
          (function() {
            var c = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';
            var meta = document.querySelector('meta[name=viewport]');
            if (meta) meta.setAttribute('content', c);
            else {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              meta.content = c;
              document.head.appendChild(meta);
            }
            document.documentElement.style.touchAction = 'manipulation';
            document.body.style.touchAction = 'manipulation';
            document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
            document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
            document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });
          })();
          true;
        `}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data?.type === 'leave') router.back();
          } catch (_) {}
        }}
        renderLoading={() => (
          <View style={[styles.loading, gameType === 'chess' && styles.loadingDark]}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={[styles.loadingText, gameType === 'chess' && styles.loadingTextDark]}>Loading game...</Text>
          </View>
        )}
      />
      {inviteDeclined && (
        <View style={styles.declinedOverlay}>
          <View style={styles.declinedCard}>
            <Feather name="info" size={40} color="#f59e0b" />
            <Text style={styles.declinedTitle}>Invite declined</Text>
            <Text style={styles.declinedText}>Your match chose "Later" and isn't joining right now.</Text>
            <Pressable style={styles.declinedBtn} onPress={() => router.back()}>
              <Text style={styles.declinedBtnText}>Back to match</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginHorizontal: 8 },
  webview: { flex: 1, backgroundColor: '#f8fafc' },
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
  loadingDark: { backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  loadingTextDark: { color: '#94a3b8' },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginTop: 12 },
  placeholderText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  declinedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  declinedCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
  },
  declinedTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 12 },
  declinedText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  declinedBtn: {
    marginTop: 20,
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  declinedBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
