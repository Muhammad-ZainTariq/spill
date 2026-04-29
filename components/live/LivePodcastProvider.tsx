import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { LivePodcastOverlay } from '@/components/live/LivePodcastOverlay';
import { LivePodcastMiniPlayer } from '@/components/live/LivePodcastMiniPlayer';
import { getLivePodcastWebPlayerHtml } from '@/components/live/livePodcastWebPlayerHtml';
import { auth } from '@/lib/firebase';
import {
  createLivePodcastTranscriptToken,
  formatLiveSessionDuration,
  joinLivePodcastRoom,
  leaveLivePodcastRoom,
  publishLivePodcastTranscriptSegment,
  subscribeLivePodcastRoom,
  subscribeSpeakerRequests,
  type LivePodcastRole,
  type LivePodcastRoom,
} from '@/lib/livePodcasts';

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
  role?: LivePodcastRole | null;
  isLocal: boolean;
  isSpeaking: boolean;
  audioLevel: number;
};

type LivePodcastContextValue = {
  activeSession: ActiveLivePodcastSession | null;
  participants: LivePodcastParticipant[];
  connectionState: string;
  micEnabled: boolean;
  playbackMuted: boolean;
  dominantSpeakerLevel: number;
  lastError: string | null;
  presentedRoomId: string | null;
  connectToRoom: (session: Omit<ActiveLivePodcastSession, 'minimized'>) => void;
  minimizeRoom: () => void;
  expandRoom: () => void;
  leaveRoom: () => void;
  updateRoom: (room: LivePodcastRoom) => void;
  toggleMicrophone: () => void;
  togglePlayback: () => void;
  presentRoom: (roomId: string) => void;
  dismissPresentedRoom: () => void;
  /** Time connected to LiveKit audio for this session (updates while connected). */
  sessionElapsedMs: number;
  sessionDurationLabel: string;
};

const LivePodcastContext = createContext<LivePodcastContextValue | null>(null);

export function LivePodcastProvider({ children }: React.PropsWithChildren) {
  const webRef = useRef<WebView>(null);
  const [activeSession, setActiveSession] = useState<ActiveLivePodcastSession | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [participants, setParticipants] = useState<LivePodcastParticipant[]>([]);
  const [connectionState, setConnectionState] = useState('idle');
  const [micEnabled, setMicEnabled] = useState(false);
  const [playbackMuted, setPlaybackMuted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [presentedRoomId, setPresentedRoomId] = useState<string | null>(null);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const connectedAtRef = useRef<number | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const speakerUpgradeInFlightRef = useRef(false);
  const hasActiveSession = !!activeSession;
  const someoneSpeaking = participants.some((participant) => participant.isSpeaking);
  const dominantSpeakerLevel = participants.reduce((max, participant) => Math.max(max, Number(participant.audioLevel || 0)), 0);
  const sessionToken = activeSession?.token;
  const sessionServerUrl = activeSession?.serverUrl;
  const sessionRoomId = activeSession?.room.id;
  const canPublish = activeSession ? activeSession.role !== 'listener' : false;
  const sessionConnectKey = activeSession
    ? `${activeSession.room.id}:${activeSession.token}:${activeSession.serverUrl}:${activeSession.role}`
    : '';

  const sessionDurationLabel = useMemo(() => formatLiveSessionDuration(sessionElapsedMs), [sessionElapsedMs]);

  useEffect(() => {
    activeRoomIdRef.current = activeSession?.room.id ?? null;
  }, [activeSession?.room.id]);

  const sendCommand = useCallback((command: { type: string; payload?: Record<string, unknown> }) => {
    const payload = JSON.stringify(command).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    webRef.current?.injectJavaScript(`window.__SPILL_LIVEKIT_COMMAND && window.__SPILL_LIVEKIT_COMMAND(${payload}); true;`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!webReady) return;
    if (!hasActiveSession) {
      sendCommand({ type: 'disconnect' });
      setParticipants([]);
      setConnectionState('idle');
      setMicEnabled(false);
      setPlaybackMuted(false);
      return;
    }
    const connect = async () => {
      setLastError(null);
      let transcript: { token: string; sampleRate: number; speechModel: string; formattedFinals: boolean } | null = null;
      if (canPublish && sessionRoomId) {
        try {
          transcript = await createLivePodcastTranscriptToken(sessionRoomId);
        } catch (error) {
          console.warn('Failed to start live captions', error);
        }
      }
      if (cancelled) return;
      sendCommand({
        type: 'connect',
        payload: {
          token: sessionToken,
          serverUrl: sessionServerUrl,
          role: activeSession?.role || 'listener',
          canPublish,
          transcript,
        },
      });
    };
    connect();
    return () => {
      cancelled = true;
    };
  }, [
    canPublish,
    hasActiveSession,
    sessionRoomId,
    sessionServerUrl,
    sessionToken,
    activeSession?.role,
    sendCommand,
    sessionConnectKey,
    webReady,
  ]);

  useEffect(() => {
    connectedAtRef.current = null;
    setSessionElapsedMs(0);
  }, [sessionConnectKey]);

  useEffect(() => {
    if (connectionState === 'connected' && connectedAtRef.current === null) {
      connectedAtRef.current = Date.now();
    }
    if (connectionState !== 'connected') {
      connectedAtRef.current = null;
      setSessionElapsedMs(0);
    }
  }, [connectionState, sessionConnectKey]);

  useEffect(() => {
    if (connectionState !== 'connected') return;
    const tick = () => {
      if (connectedAtRef.current) {
        setSessionElapsedMs(Date.now() - connectedAtRef.current);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [connectionState, sessionConnectKey]);

  const connectToRoom = useCallback((session: Omit<ActiveLivePodcastSession, 'minimized'>) => {
    setWebReady(false);
    setActiveSession((prev) => {
      if (prev?.room.id === session.room.id) {
        return { ...prev, ...session, minimized: false };
      }
      return { ...session, minimized: false };
    });
  }, []);

  const reconnectToRoom = useCallback(
    async (session: Omit<ActiveLivePodcastSession, 'minimized'>) => {
      sendCommand({ type: 'disconnect' });
      setActiveSession(null);
      setParticipants([]);
      setConnectionState('idle');
      setMicEnabled(false);
      setWebReady(false);
      await new Promise((resolve) => setTimeout(resolve, 250));
      setActiveSession({ ...session, minimized: false });
    },
    [sendCommand]
  );

  const minimizeRoom = useCallback(() => {
    setActiveSession((prev) => (prev ? { ...prev, minimized: true } : prev));
  }, []);

  const expandRoom = useCallback(() => {
    setActiveSession((prev) => (prev ? { ...prev, minimized: false } : prev));
  }, []);

  const presentRoom = useCallback((roomId: string) => {
    if (!roomId) return;
    setPresentedRoomId(roomId);
  }, []);

  const dismissPresentedRoom = useCallback(() => {
    setPresentedRoomId((prevRoomId) => {
      if (activeSession?.room.id && prevRoomId === activeSession.room.id) {
        setActiveSession((prev) => (prev ? { ...prev, minimized: true } : prev));
      }
      return null;
    });
  }, [activeSession?.room.id]);

  const leaveRoom = useCallback(() => {
    sendCommand({ type: 'disconnect' });
    setActiveSession(null);
    setWebReady(false);
    setParticipants([]);
    setConnectionState('idle');
    setMicEnabled(false);
    setPlaybackMuted(false);
  }, [sendCommand]);

  const updateRoom = useCallback((room: LivePodcastRoom) => {
    setActiveSession((prev) => (prev ? { ...prev, room: { ...prev.room, ...room } } : prev));
  }, []);

  const toggleMicrophone = useCallback(() => {
    sendCommand({ type: 'toggleMic' });
  }, [sendCommand]);

  const togglePlayback = useCallback(() => {
    sendCommand({ type: 'togglePlayback' });
  }, [sendCommand]);

  useEffect(() => {
    if (!activeSession?.room.id) return;
    const unsub = subscribeLivePodcastRoom(activeSession.room.id, (room) => {
      if (!room) return;
      if (room.status === 'ended' || !!room.ended_at) {
        setPresentedRoomId((prev) => (prev === room.id ? null : prev));
        leaveRoom();
        return;
      }
      updateRoom(room);
    });
    return () => unsub();
  }, [activeSession?.room.id, leaveRoom, updateRoom]);

  const attemptSpeakerUpgrade = useCallback(
    async (roomId: string) => {
      if (speakerUpgradeInFlightRef.current) return;
      speakerUpgradeInFlightRef.current = true;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            // Use the same fresh-join path as co-host audio. A listener token cannot reliably
            // become a publishing token in-place on every device/WebView.
            const data = await joinLivePodcastRoom(roomId);
            await reconnectToRoom({
              room: data.room,
              role: data.role,
              token: data.token,
              serverUrl: data.serverUrl,
            });
            return;
          } catch (error: any) {
            const code = String(error?.code || '');
            const msg = String(error?.message || '');
            const notReady =
              code.includes('failed-precondition') || msg.includes('listener-role-refresh');
            if (notReady && attempt < 9) {
              await wait(400 + attempt * 350);
              continue;
            }
            if (!notReady) {
              console.warn('[LivePodcast] speaker reconnect failed', error);
            }
            return;
          }
        }
      } finally {
        speakerUpgradeInFlightRef.current = false;
      }
    },
    [reconnectToRoom]
  );

  useEffect(() => {
    if (!activeSession?.room.id) return;
    if (activeSession.role !== 'listener') return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const approved =
      Array.isArray(activeSession.room.approved_speaker_uids) && activeSession.room.approved_speaker_uids.includes(uid);
    if (!approved) return;
    attemptSpeakerUpgrade(activeSession.room.id);
  }, [activeSession?.room.id, activeSession?.role, activeSession?.room.approved_speaker_uids, attemptSpeakerUpgrade]);

  useEffect(() => {
    if (!activeSession?.room.id) return;
    if (activeSession.role !== 'listener') return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeSpeakerRequests(activeSession.room.id, (items) => {
      const approved = items.some((i) => i.user_uid === uid && i.status === 'approved');
      if (approved) {
        attemptSpeakerUpgrade(activeSession.room.id);
      }
    });
  }, [activeSession?.room.id, activeSession?.role, attemptSpeakerUpgrade]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg?.type === 'ready') {
        setWebReady(true);
        return;
      }
      if (msg?.type === 'livekitDisconnected') {
        const r = Number(msg.payload?.reason ?? -1);
        const rid = activeRoomIdRef.current;
        if (rid && (r === 4 || r === 5 || r === 10)) {
          setLastError(
            r === 4 ? 'You were removed from the broadcast.' : 'The live broadcast ended.'
          );
          leaveLivePodcastRoom(rid).catch(() => {});
          leaveRoom();
        }
        return;
      }
      if (msg?.type === 'state') {
        setConnectionState(String(msg.payload?.status || 'idle'));
        setMicEnabled(!!msg.payload?.micEnabled);
        setPlaybackMuted(!!msg.payload?.playbackMuted);
        return;
      }
      if (msg?.type === 'participants') {
        setParticipants(Array.isArray(msg.payload?.participants) ? msg.payload.participants : []);
        return;
      }
      if (msg?.type === 'transcriptTurn') {
        const currentRoomId = activeSession?.room.id;
        const turnId = String(msg.payload?.id || '').trim();
        const text = String(msg.payload?.text || '').trim();
        if (!currentRoomId || !turnId || !text) return;
        const localParticipant = participants.find((participant) => participant.isLocal);
        publishLivePodcastTranscriptSegment(currentRoomId, {
          id: turnId,
          text,
          is_final: !!msg.payload?.isFinal,
          sequence: Number(msg.payload?.sequence || 0),
          speaker_uid: auth.currentUser?.uid || activeSession?.room.host_uid || null,
          speaker_name: localParticipant?.name || auth.currentUser?.displayName || activeSession?.room.host_name || null,
          created_at: typeof msg.payload?.createdAt === 'string' ? msg.payload.createdAt : undefined,
          updated_at: new Date().toISOString(),
        }).catch((error) => {
          console.warn('Failed to publish live transcript segment', error);
        });
        return;
      }
      if (msg?.type === 'error') {
        setLastError(String(msg.payload?.message || 'Live room error.'));
      }
    } catch (error) {
      console.warn('Failed to parse live podcast WebView message', error);
    }
  }, [activeSession?.room.host_name, activeSession?.room.host_uid, activeSession?.room.id, leaveRoom, participants]);

  const value = useMemo(
    () => ({
      activeSession,
      participants,
      connectionState,
      micEnabled,
      playbackMuted,
      dominantSpeakerLevel,
      lastError,
      presentedRoomId,
      connectToRoom,
      minimizeRoom,
      expandRoom,
      leaveRoom,
      updateRoom,
      toggleMicrophone,
      togglePlayback,
      presentRoom,
      dismissPresentedRoom,
      sessionElapsedMs,
      sessionDurationLabel,
    }),
    [
      activeSession,
      participants,
      connectionState,
      micEnabled,
      playbackMuted,
      dominantSpeakerLevel,
      lastError,
      presentedRoomId,
      connectToRoom,
      minimizeRoom,
      expandRoom,
      leaveRoom,
      updateRoom,
      toggleMicrophone,
      togglePlayback,
      presentRoom,
      dismissPresentedRoom,
      sessionElapsedMs,
      sessionDurationLabel,
    ]
  );

  return (
    <LivePodcastContext.Provider value={value}>
      {children}
      <LivePodcastOverlay
        roomId={presentedRoomId}
        visible={!!presentedRoomId}
        onClose={dismissPresentedRoom}
        activeSession={activeSession}
        connectToRoom={connectToRoom}
        leaveRoom={leaveRoom}
        participants={participants}
        connectionState={connectionState}
        micEnabled={micEnabled}
        playbackMuted={playbackMuted}
        dominantSpeakerLevel={dominantSpeakerLevel}
        lastError={lastError}
        toggleMicrophone={toggleMicrophone}
        togglePlayback={togglePlayback}
        sessionDurationLabel={sessionDurationLabel}
      />
      {activeSession ? (
        <View pointerEvents="none" style={styles.hiddenWebViewWrap}>
          <WebView
            key={sessionConnectKey}
            ref={webRef}
            source={{ html: getLivePodcastWebPlayerHtml(), baseUrl: 'https://spill.local/' }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
            onMessage={onMessage}
            style={styles.hiddenWebView}
          />
        </View>
      ) : null}
      <LivePodcastMiniPlayer
        activeSession={activeSession}
        presentRoom={presentRoom}
        presentedRoomId={presentedRoomId}
        leaveRoom={leaveRoom}
        someoneSpeaking={someoneSpeaking}
        micEnabled={micEnabled}
        playbackMuted={playbackMuted}
        dominantSpeakerLevel={dominantSpeakerLevel}
        togglePlayback={togglePlayback}
        sessionDurationLabel={sessionDurationLabel}
      />
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
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.02,
  },
  hiddenWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
