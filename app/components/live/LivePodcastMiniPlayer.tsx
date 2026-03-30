import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActiveLivePodcastSession } from '@/app/components/live/LivePodcastProvider';
import { SpeakingWave } from '@/app/components/live/SpeakingWave';
import { leaveLivePodcastRoom } from '@/lib/livePodcasts';

export function LivePodcastMiniPlayer({
  activeSession,
  presentRoom,
  presentedRoomId,
  leaveRoom,
  someoneSpeaking,
  playbackMuted,
  dominantSpeakerLevel,
  togglePlayback,
}: {
  activeSession: ActiveLivePodcastSession | null;
  presentRoom: (roomId: string) => void;
  presentedRoomId: string | null;
  leaveRoom: () => void;
  someoneSpeaking: boolean;
  playbackMuted: boolean;
  dominantSpeakerLevel: number;
  togglePlayback: () => void;
}) {
  if (!activeSession || !activeSession.minimized || presentedRoomId === activeSession.room.id) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Pressable
        style={styles.card}
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
          <Text style={styles.title} numberOfLines={1}>
            {activeSession.room.title}
          </Text>
          <View style={styles.metaRow}>
            <SpeakingWave
              active={someoneSpeaking && !playbackMuted}
              level={dominantSpeakerLevel}
              compact
              color="rgba(255,255,255,0.95)"
            />
            <Text style={styles.meta} numberOfLines={1}>
              {activeSession.room.host_name || 'Therapist'} · LIVE
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2563eb',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    gap: 10,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#93c5fd',
  },
  artworkWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
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
