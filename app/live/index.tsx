import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLivePodcast } from '@/components/live/LivePodcastProvider';
import { tokens } from '@/app/ui/tokens';
import { auth } from '@/lib/firebase';
import {
  currentUserCanHostLivePodcasts,
  joinLivePodcastByInviteCode,
  LivePodcastRoom,
  setLivePodcastReminder,
  subscribeLivePodcastRooms,
} from '@/lib/livePodcasts';

function fmtStart(iso?: string | null) {
  if (!iso) return 'Starts soon';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Starts soon';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LivePodcastHubScreen() {
  const router = useRouter();
  const { connectToRoom } = useLivePodcast();
  const [rooms, setRooms] = useState<LivePodcastRoom[]>([]);
  const [canHost, setCanHost] = useState(false);
  const [coHostCode, setCoHostCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const therapistHomePath = auth.currentUser?.uid ? `/therapist/${auth.currentUser.uid}` : null;

  useEffect(() => {
    const unsub = subscribeLivePodcastRooms(setRooms);
    currentUserCanHostLivePodcasts().then(setCanHost).catch(() => setCanHost(false));
    return unsub;
  }, []);

  const liveRooms = useMemo(() => rooms.filter((r) => r.status === 'live'), [rooms]);
  const scheduledRooms = useMemo(() => rooms.filter((r) => r.status === 'scheduled'), [rooms]);
  const replayRooms = useMemo(() => rooms.filter((r) => r.status === 'ended' && r.replay_status === 'published'), [rooms]);

  const handleJoinByCode = async () => {
    const normalizedCode = coHostCode.trim().toUpperCase();
    if (!normalizedCode) {
      Alert.alert('Missing code', 'Enter the co-host code the host shared with you.');
      return;
    }
    setJoiningByCode(true);
    try {
      const session = await joinLivePodcastByInviteCode(normalizedCode);
      connectToRoom({
        room: session.room,
        role: session.role,
        token: session.token,
        serverUrl: session.serverUrl,
      });
      setCoHostCode('');
      router.push(`/live/${session.room.id}` as any);
    } catch (error: any) {
      Alert.alert('Could not join as co-host', error?.message || 'Check the code and try again.');
    } finally {
      setJoiningByCode(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
              return;
            }
            if (therapistHomePath) {
              router.replace(therapistHomePath as any);
            }
          }}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={20} color={tokens.colors.text} />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>spill</Text>
        <View style={styles.backBtnSpacer} />
      </View>
      <View style={styles.headerSub}>
        <Text style={styles.eyebrow}>Live audio</Text>
        <Text style={styles.title}>Podcast spaces</Text>
        <Text style={styles.subtitle}>Join live therapist rooms, schedule reminders, or host your own audio session.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {canHost ? (
          <Pressable style={styles.heroCard} onPress={() => router.push('/live/create' as any)}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Feather name="mic" size={24} color={tokens.colors.pink} />
              </View>
              <View style={styles.heroArrow}>
                <Feather name="plus" size={18} color={tokens.colors.pink} />
              </View>
            </View>
            <Text style={styles.heroEyebrow}>Host</Text>
            <Text style={styles.heroTitle}>Start a live podcast</Text>
            <Text style={styles.heroDesc}>Create a room, schedule it, invite co-hosts, and talk live inside the app.</Text>
          </Pressable>
        ) : null}

        <View style={styles.codeCard}>
          <View style={styles.codeHead}>
            <View style={styles.codeIcon}>
              <Feather name="key" size={18} color="#2563eb" />
            </View>
            <View style={styles.codeTextWrap}>
              <Text style={styles.codeTitle}>Join as co-host</Text>
              <Text style={styles.codeDesc}>If the host shared a co-host code, enter it here and jump straight into the live room.</Text>
            </View>
          </View>
          <TextInput
            value={coHostCode}
            onChangeText={setCoHostCode}
            placeholder="Enter co-host code"
            placeholderTextColor={tokens.colors.textMuted}
            autoCapitalize="characters"
            style={styles.codeInput}
          />
          <Pressable style={[styles.codeBtn, joiningByCode && styles.codeBtnDisabled]} onPress={handleJoinByCode} disabled={joiningByCode}>
            <Text style={styles.codeBtnText}>{joiningByCode ? 'Joining...' : 'Join with code'}</Text>
          </Pressable>
          <Text style={styles.codeHelper}>
            The host starts the broadcast first. When they create a live podcast, a co-host code is generated automatically to share with you; they can also create a new code from the room screen.
          </Text>
        </View>

        <Section title="Live now" icon="radio">
          {liveRooms.length === 0 ? (
            <Empty text="No one is live right now." />
          ) : (
            liveRooms.map((room) => (
              <Pressable key={room.id} style={styles.roomCard} onPress={() => router.push(`/live/${room.id}` as any)}>
                <View style={styles.roomCardTop}>
                  <View style={styles.roomCoverWrap}>
                    {room.cover_url ? (
                      <Image source={{ uri: room.cover_url }} style={styles.roomCover} contentFit="cover" />
                    ) : (
                      <View style={styles.roomCoverFallback}>
                        <Feather name="mic" size={18} color={tokens.colors.pink} />
                      </View>
                    )}
                  </View>
                  <View style={styles.roomBadgeLive}>
                    <Text style={styles.roomBadgeLiveText}>LIVE</Text>
                  </View>
                </View>
                <Text style={styles.roomTitle}>{room.title}</Text>
                <Text style={styles.roomMeta}>{room.host_name || 'Therapist'} · Live now</Text>
                {!!room.topic ? <Text style={styles.roomDesc}>{room.topic}</Text> : null}
              </Pressable>
            ))
          )}
        </Section>

        <Section title="Scheduled" icon="clock">
          {scheduledRooms.length === 0 ? (
            <Empty text="No scheduled podcasts yet." />
          ) : (
            scheduledRooms.map((room) => (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomCardTop}>
                  <View style={styles.roomCoverWrap}>
                    {room.cover_url ? (
                      <Image source={{ uri: room.cover_url }} style={styles.roomCover} contentFit="cover" />
                    ) : (
                      <View style={styles.roomCoverFallback}>
                        <Feather name="clock" size={18} color={tokens.colors.textSecondary} />
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.roomTitle}>{room.title}</Text>
                <Text style={styles.roomMeta}>{room.host_name || 'Therapist'} · {fmtStart(room.scheduled_for)}</Text>
                {!!room.topic ? <Text style={styles.roomDesc}>{room.topic}</Text> : null}
                <View style={styles.roomActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setLivePodcastReminder(room.id).catch(() => undefined);
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>Remind me</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={() => router.push(`/live/${room.id}` as any)}>
                    <Text style={styles.primaryBtnText}>View</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </Section>

        <Section title="Replays" icon="play-circle">
          {replayRooms.length === 0 ? (
            <Empty text="No published replays yet." />
          ) : (
            replayRooms.map((room) => (
              <Pressable key={room.id} style={styles.roomCard} onPress={() => router.push(`/live/${room.id}` as any)}>
                <View style={styles.roomCardTop}>
                  <View style={styles.roomCoverWrap}>
                    {room.cover_url ? (
                      <Image source={{ uri: room.cover_url }} style={styles.roomCover} contentFit="cover" />
                    ) : (
                      <View style={styles.roomCoverFallback}>
                        <Feather name="play" size={18} color={tokens.colors.textSecondary} />
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.roomTitle}>{room.title}</Text>
                <Text style={styles.roomMeta}>{room.host_name || 'Therapist'} · Replay available</Text>
                {!!room.topic ? <Text style={styles.roomDesc}>{room.topic}</Text> : null}
              </Pressable>
            ))
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon: keyof typeof Feather.glyphMap; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Feather name={icon} size={16} color={tokens.colors.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: tokens.colors.surface,
  },
  backBtn: {
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  backBtnSpacer: {
    minWidth: 72,
    height: 36,
  },
  brand: {
    fontSize: 24,
    fontWeight: '900',
    color: tokens.colors.pink,
  },
  headerSub: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 4,
    paddingBottom: 14,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: tokens.colors.textMuted },
  title: { marginTop: 6, fontSize: 24, fontWeight: '900', color: tokens.colors.text },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '600', color: tokens.colors.textSecondary },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 40, gap: 18 },
  heroCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#fff4f8',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.22)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(244,114,182,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7, color: tokens.colors.pink },
  heroTitle: { marginTop: 6, fontSize: 24, fontWeight: '900', color: tokens.colors.text },
  heroDesc: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '600', color: tokens.colors.textSecondary },
  codeCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.16)',
    gap: 12,
  },
  codeHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  codeIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeTextWrap: {
    flex: 1,
  },
  codeTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  codeDesc: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  codeInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  codeBtn: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBtnDisabled: {
    opacity: 0.65,
  },
  codeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  codeHelper: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: tokens.colors.textSecondary,
  },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: tokens.colors.text },
  roomCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 16,
    gap: 6,
  },
  roomCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  roomCoverWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  roomCover: {
    width: '100%',
    height: '100%',
  },
  roomCoverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  roomBadgeLive: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.12)',
  },
  roomBadgeLiveText: { fontSize: 11, fontWeight: '900', color: tokens.colors.pink },
  roomTitle: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  roomMeta: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  roomDesc: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: tokens.colors.textSecondary },
  roomActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  secondaryBtnText: { color: tokens.colors.text, fontSize: 13, fontWeight: '800' },
  emptyCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 16,
  },
  emptyText: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
});
