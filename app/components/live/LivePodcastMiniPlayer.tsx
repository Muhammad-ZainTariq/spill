import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

import type { ActiveLivePodcastSession } from '@/app/components/live/LivePodcastProvider';
import { SpeakingWave } from '@/app/components/live/SpeakingWave';
import { leaveLivePodcastRoom } from '@/lib/livePodcasts';

export function LivePodcastMiniPlayer({
  activeSession,
  presentRoom,
  presentedRoomId,
  leaveRoom,
  someoneSpeaking,
  micEnabled,
  playbackMuted,
  dominantSpeakerLevel,
  togglePlayback,
}: {
  activeSession: ActiveLivePodcastSession | null;
  presentRoom: (roomId: string) => void;
  presentedRoomId: string | null;
  leaveRoom: () => void;
  someoneSpeaking: boolean;
  micEnabled: boolean;
  playbackMuted: boolean;
  dominantSpeakerLevel: number;
  togglePlayback: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const isVisible = !!activeSession && activeSession.minimized && presentedRoomId !== activeSession.room.id;
  const roomId = activeSession?.room.id || '';
  const isHostLike = activeSession ? activeSession.role === 'host' || activeSession.role === 'co_host' || activeSession.role === 'speaker' : false;

  useEffect(() => {
    if (!isVisible) {
      entrance.setValue(0);
      return;
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, isVisible, roomId]);

  if (!activeSession || !isVisible) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Animated.View
        style={[
          styles.cardWrap,
          {
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          },
        ]}
      >
      <Pressable
        style={[styles.card, isHostLike && styles.cardHost]}
        onPress={() => {
          presentRoom(activeSession.room.id);
        }}
      >
        <View style={styles.artworkWrap}>
          {activeSession.room.cover_url ? (
            <Image source={{ uri: activeSession.room.cover_url }} style={styles.artwork} contentFit="cover" />
          ) : (
            <View style={styles.artworkFallback}>
              <Feather name="mic" size={16} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.textWrap}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {activeSession.room.title}
            </Text>
            {isHostLike ? (
              <View style={styles.micPill}>
                <Feather name={micEnabled ? 'mic' : 'mic-off'} size={11} color="#fff" />
                <Text style={styles.micPillText}>{micEnabled ? 'Mic on' : 'Mic off'}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <SpeakingWave
              active={someoneSpeaking && !playbackMuted}
              level={dominantSpeakerLevel}
              compact
              color="rgba(255,255,255,0.95)"
            />
            <Text style={styles.meta} numberOfLines={1}>
              {isHostLike
                ? `You are live${micEnabled ? ' · speaking ready' : ' · muted'}`
                : `${activeSession.room.host_name || 'Therapist'} · LIVE`}
            </Text>
          </View>
        </View>
        <View style={styles.controls}>
          <Pressable
            hitSlop={8}
            style={styles.iconBtn}
            onPress={(event) => {
              event.stopPropagation();
              togglePlayback();
            }}
          >
            <Feather name={playbackMuted ? 'play' : 'pause'} size={15} color="#fff" />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={styles.iconBtn}
            onPress={async (event) => {
              event.stopPropagation();
              try {
                await leaveLivePodcastRoom(activeSession.room.id);
              } catch {}
              leaveRoom();
            }}
          >
            <Feather name="x" size={16} color="#fff" />
          </Pressable>
        </View>
      </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 86,
    zIndex: 50,
  },
  cardWrap: {
    borderRadius: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#2563eb',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    gap: 10,
  },
  cardHost: {
    backgroundColor: '#1d4ed8',
  },
  artworkWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artworkFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  micPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  micPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  meta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
