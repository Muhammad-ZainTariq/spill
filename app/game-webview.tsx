import { recordGameResult, setGameInviteCancelled, setGameInviteExpired, subscribeToMatchLastGameInvite, type MatchLastGameInvite } from '@/app/functions';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { auth } from '@/lib/firebase';

const GAME_TITLES: Record<string, string> = {
  tictactoe: 'Tic-Tac-Toe',
  chess: 'Chess',
};

/** Expo Router can pass string | string[]; arrays break WebView URLs and Firestore listeners. */
function paramStr(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

export default function GameWebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const raw = useLocalSearchParams<{
    room?: string | string[];
    matchId?: string | string[];
    gameType?: string | string[];
    inviteId?: string | string[];
    opponentName?: string | string[];
    myName?: string | string[];
  }>();
  const room = paramStr(raw.room);
  const matchId = paramStr(raw.matchId) || room;
  const gameType = paramStr(raw.gameType) || 'tictactoe';
  const inviteId = paramStr(raw.inviteId);
  const opponentNameParam = paramStr(raw.opponentName);
  const myNameParam = paramStr(raw.myName);
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [lastGameInvite, setLastGameInvite] = useState<MatchLastGameInvite>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUserId(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!matchId?.trim() || !inviteId) return;
    const unsub = subscribeToMatchLastGameInvite(matchId, setLastGameInvite);
    return () => unsub();
  }, [matchId, inviteId]);

  const inviteMatchesScreen = !!inviteId && lastGameInvite?.invite_id === inviteId;
  const iSentThisInvite = inviteMatchesScreen && !!currentUserId && lastGameInvite?.from_user_id === currentUserId;

  useEffect(() => {
    if (!matchId || !inviteMatchesScreen || lastGameInvite?.status !== 'pending') return;
    const expiresAt = Date.parse(lastGameInvite.expires_at || '');
    if (Number.isNaN(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      void setGameInviteExpired(matchId, inviteId);
      return;
    }
    const id = setTimeout(() => {
      void setGameInviteExpired(matchId, inviteId);
    }, delay + 250);
    return () => clearTimeout(id);
  }, [matchId, inviteId, inviteMatchesScreen, lastGameInvite]);

  const handleBack = useCallback(() => {
    if (matchId && inviteId) {
      void setGameInviteCancelled(matchId, inviteId);
    }
    router.back();
  }, [matchId, inviteId, router]);

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
    // Always include a real path before the query (?room= alone breaks some hosts / WebViews → "Not Found")
    const pathPart = gameType === 'chess' ? '/chess' : '/';
    let url = `${base}${pathPart}?room=${encodeURIComponent(room)}`;
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
          <Pressable onPress={handleBack} style={styles.backBtn}>
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
          <Pressable onPress={handleBack} style={styles.backBtn}>
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
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={12}>
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
            if (data?.type === 'leave') handleBack();
            if (data?.type === 'game_over' && data?.roomCode && (data?.result === 'win' || data?.result === 'loss' || data?.result === 'draw')) {
              recordGameResult(data.roomCode, data.result, data.gameType || 'tictactoe').catch(() => {});
            }
          } catch (_) {}
        }}
        renderLoading={() => (
          <View style={[styles.loading, gameType === 'chess' && styles.loadingDark]}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={[styles.loadingText, gameType === 'chess' && styles.loadingTextDark]}>Loading game...</Text>
          </View>
        )}
      />
      {inviteMatchesScreen && iSentThisInvite && (lastGameInvite?.status === 'declined' || lastGameInvite?.status === 'expired') && (
        <View style={styles.declinedOverlay}>
          <View style={styles.declinedCard}>
            <Feather name="info" size={40} color="#f59e0b" />
            <Text style={styles.declinedTitle}>{lastGameInvite?.status === 'expired' ? 'Invite expired' : 'Invite declined'}</Text>
            <Text style={styles.declinedText}>
              {lastGameInvite?.status === 'expired'
                ? 'No one joined in time. Send a new request when you are ready.'
                : "Your match declined and isn't joining right now."}
            </Text>
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
