import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { LivePodcastMiniPlayer } from '@/app/components/live/LivePodcastMiniPlayer';
import { getLivePodcastWebPlayerHtml } from '@/app/components/live/livePodcastWebPlayerHtml';
import type { LivePodcastRole, LivePodcastRoom } from '@/lib/livePodcasts';

export type ActiveLivePodcastSession = {
  room: LivePodcastRoom;
  role: LivePodcastRole;
  token: string;
  serverUrl: string;
  minimized: boolean;
};

export type LivePodcastParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
};

type LivePodcastContextValue = {
  activeSession: ActiveLivePodcastSession | null;
  participants: LivePodcastParticipant[];
  connectionState: string;
  micEnabled: boolean;
  lastError: string | null;
  connectToRoom: (session: Omit<ActiveLivePodcastSession, 'minimized'>) => void;
  minimizeRoom: () => void;
  expandRoom: () => void;
  leaveRoom: () => void;
  updateRoom: (room: LivePodcastRoom) => void;
  toggleMicrophone: () => void;
};

const LivePodcastContext = createContext<LivePodcastContextValue | null>(null);

export function LivePodcastProvider({ children }: React.PropsWithChildren) {
  const webRef = useRef<WebView>(null);
  const [activeSession, setActiveSession] = useState<ActiveLivePodcastSession | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [participants, setParticipants] = useState<LivePodcastParticipant[]>([]);
  const [connectionState, setConnectionState] = useState('idle');
  const [micEnabled, setMicEnabled] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const hasActiveSession = !!activeSession;
  const sessionToken = activeSession?.token;
  const sessionServerUrl = activeSession?.serverUrl;
  const sessionRoomId = activeSession?.room.id;
  const canPublish = activeSession ? activeSession.role !== 'listener' : false;
  const sessionConnectKey = activeSession
    ? `${activeSession.room.id}:${activeSession.token}:${activeSession.serverUrl}:${activeSession.role}`
    : '';

  const sendCommand = useCallback((command: { type: string; payload?: Record<string, unknown> }) => {
    const payload = JSON.stringify(command).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    webRef.current?.injectJavaScript(`window.__SPILL_LIVEKIT_COMMAND && window.__SPILL_LIVEKIT_COMMAND(${payload}); true;`);
  }, []);

  useEffect(() => {
    if (!webReady) return;
    if (!hasActiveSession) {
      sendCommand({ type: 'disconnect' });
      setParticipants([]);
      setConnectionState('idle');
      setMicEnabled(false);
      return;
    }
    setLastError(null);
    sendCommand({
      type: 'connect',
      payload: {
        token: sessionToken,
        serverUrl: sessionServerUrl,
        canPublish,
      },
    });
  }, [
    canPublish,
    hasActiveSession,
    sessionRoomId,
    sessionServerUrl,
    sessionToken,
    sendCommand,
    sessionConnectKey,
    webReady,
  ]);

  const connectToRoom = useCallback((session: Omit<ActiveLivePodcastSession, 'minimized'>) => {
    setWebReady(false);
    setActiveSession((prev) => {
      if (prev?.room.id === session.room.id) {
        return { ...prev, ...session, minimized: false };
      }
      return { ...session, minimized: false };
    });
  }, []);

  const minimizeRoom = useCallback(() => {
    setActiveSession((prev) => (prev ? { ...prev, minimized: true } : prev));
  }, []);

  const expandRoom = useCallback(() => {
    setActiveSession((prev) => (prev ? { ...prev, minimized: false } : prev));
  }, []);

  const leaveRoom = useCallback(() => {
    sendCommand({ type: 'disconnect' });
    setActiveSession(null);
    setWebReady(false);
    setParticipants([]);
    setConnectionState('idle');
    setMicEnabled(false);
  }, [sendCommand]);

  const updateRoom = useCallback((room: LivePodcastRoom) => {
    setActiveSession((prev) => (prev ? { ...prev, room: { ...prev.room, ...room } } : prev));
  }, []);

  const toggleMicrophone = useCallback(() => {
    sendCommand({ type: 'toggleMic' });
  }, [sendCommand]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg?.type === 'ready') {
        setWebReady(true);
        return;
      }
      if (msg?.type === 'state') {
        setConnectionState(String(msg.payload?.status || 'idle'));
        setMicEnabled(!!msg.payload?.micEnabled);
        return;
      }
      if (msg?.type === 'participants') {
        setParticipants(Array.isArray(msg.payload?.participants) ? msg.payload.participants : []);
        return;
      }
      if (msg?.type === 'error') {
        setLastError(String(msg.payload?.message || 'Live room error.'));
      }
    } catch (error) {
      console.warn('Failed to parse live podcast WebView message', error);
    }
  }, []);

  const value = useMemo(
    () => ({
      activeSession,
      participants,
      connectionState,
      micEnabled,
      lastError,
      connectToRoom,
      minimizeRoom,
      expandRoom,
      leaveRoom,
      updateRoom,
      toggleMicrophone,
    }),
    [
      activeSession,
      participants,
      connectionState,
      micEnabled,
      lastError,
      connectToRoom,
      minimizeRoom,
      expandRoom,
      leaveRoom,
      updateRoom,
      toggleMicrophone,
    ]
  );

  return (
    <LivePodcastContext.Provider value={value}>
      {children}
      {activeSession ? (
        <View pointerEvents="none" style={styles.hiddenWebViewWrap}>
          <WebView
            key={activeSession.room.id}
            ref={webRef}
            source={{ html: getLivePodcastWebPlayerHtml() }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            onMessage={onMessage}
            style={styles.hiddenWebView}
          />
        </View>
      ) : null}
      <LivePodcastMiniPlayer activeSession={activeSession} expandRoom={expandRoom} leaveRoom={leaveRoom} />
    </LivePodcastContext.Provider>
  );
}

export function useLivePodcast() {
  const ctx = useContext(LivePodcastContext);
  if (!ctx) throw new Error('useLivePodcast must be used inside LivePodcastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  hiddenWebViewWrap: {
    position: 'absolute',
    left: -200,
    bottom: -200,
    width: 2,
    height: 2,
    opacity: 0.01,
  },
  hiddenWebView: {
    width: 2,
    height: 2,
    backgroundColor: 'transparent',
  },
});
