import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActiveLivePodcastSession } from '@/app/components/live/LivePodcastProvider';
import { leaveLivePodcastRoom } from '@/lib/livePodcasts';

export function LivePodcastMiniPlayer({
  activeSession,
  expandRoom,
  leaveRoom,
}: {
  activeSession: ActiveLivePodcastSession | null;
  expandRoom: () => void;
  leaveRoom: () => void;
}) {
  const router = useRouter();

  if (!activeSession || !activeSession.minimized) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Pressable
        style={styles.card}
        onPress={() => {
          expandRoom();
          router.push(`/live/${activeSession.room.id}` as any);
        }}
      >
        <View style={styles.liveDot} />
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {activeSession.room.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {activeSession.room.host_name || 'Therapist'} · LIVE
          </Text>
        </View>
        <Pressable
          hitSlop={8}
          style={styles.iconBtn}
          onPress={async () => {
            try {
              await leaveLivePodcastRoom(activeSession.room.id);
            } catch {}
            leaveRoom();
          }}
        >
          <Feather name="x" size={16} color="#fff" />
        </Pressable>
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
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
