import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLivePodcast } from '@/app/components/live/LivePodcastProvider';
import { tokens } from '@/app/ui/tokens';
import {
  createLivePodcastInviteCode,
  endLivePodcastRoom,
  getLivePodcastRoom,
  joinLivePodcastRoom,
  leaveLivePodcastRoom,
  LivePodcastRoom,
  requestLivePodcastSpeaker,
  resolveLivePodcastSpeakerRequest,
  SpeakerRequest,
  startLivePodcastRoom,
  subscribeLivePodcastRoom,
  subscribeSpeakerRequests,
} from '@/lib/livePodcasts';

function prettyStatus(room: LivePodcastRoom | null) {
  if (!room) return 'Loading';
  if (room.status === 'live') return 'Live now';
  if (room.status === 'scheduled') return room.scheduled_for ? `Scheduled · ${new Date(room.scheduled_for).toLocaleString()}` : 'Scheduled';
  if (room.status === 'ended') return 'Ended';
  return room.status;
}

export default function LivePodcastRoomScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const roomId = String(params.id || '');
  const router = useRouter();
  const {
    activeSession,
    connectToRoom,
    leaveRoom,
    minimizeRoom,
    updateRoom,
    participants,
    connectionState,
    micEnabled,
    lastError,
    toggleMicrophone,
  } = useLivePodcast();
  const [room, setRoom] = useState<LivePodcastRoom | null>(null);
  const [speakerRequests, setSpeakerRequests] = useState<SpeakerRequest[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [micBusy, setMicBusy] = useState(false);

  const sessionForThisRoom = !!activeSession && activeSession.room.id === roomId;
  const activeRole = sessionForThisRoom ? activeSession?.role : null;
  const canModerate = activeRole === 'host' || activeRole === 'co_host';

  useEffect(() => {
    if (!roomId) return;
    getLivePodcastRoom(roomId).then(setRoom).catch(() => setRoom(null));
    const unsubRoom = subscribeLivePodcastRoom(roomId, (next) => {
      setRoom(next);
      if (next && sessionForThisRoom) updateRoom(next);
    });
    const unsubRequests = subscribeSpeakerRequests(roomId, setSpeakerRequests);
    return () => {
      unsubRoom();
      unsubRequests();
    };
  }, [roomId, sessionForThisRoom, updateRoom]);

  const pendingRequests = useMemo(
    () => speakerRequests.filter((item) => item.status === 'waiting'),
    [speakerRequests]
  );

  const handleJoin = async () => {
    if (!roomId) return;
    if (sessionForThisRoom) {
      return;
    }
    setBusy(true);
    try {
      const session = await joinLivePodcastRoom(roomId, inviteCode.trim() || undefined);
      connectToRoom({
        room: session.room,
        role: session.role,
        token: session.token,
        serverUrl: session.serverUrl,
      });
      if (session.usedFreeAccess) {
        Alert.alert('First live free', 'This room used your one free live podcast access. Future live rooms require premium.');
      }
    } catch (error: any) {
      if (String(error?.message || '').includes('premium-required-for-live-podcast')) {
        Alert.alert('Premium required', 'Your free live podcast access has already been used. Upgrade to keep joining live rooms.', [
          { text: 'Not now' },
          { text: 'Go premium', onPress: () => router.push('/premium' as any) },
        ]);
      } else {
        Alert.alert('Could not join room', error?.message || 'Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      await startLivePodcastRoom(roomId);
      const session = await joinLivePodcastRoom(roomId);
      connectToRoom({
        room: session.room,
        role: session.role,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch (error: any) {
      Alert.alert('Could not start room', error?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    try {
      if (roomId) await leaveLivePodcastRoom(roomId);
    } catch {}
    leaveRoom();
    router.replace('/live' as any);
  };

  const handleInvite = async () => {
    if (!roomId) return;
    try {
      const res = await createLivePodcastInviteCode(roomId, 'co_host');
      Alert.alert('Co-host code', `${res.code}\nExpires in ${res.expiresInMinutes} minutes.`);
    } catch (error: any) {
      Alert.alert('Could not create invite', error?.message || 'Try again.');
    }
  };

  const handleEnd = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      await endLivePodcastRoom(roomId);
      leaveRoom();
      router.replace('/live' as any);
    } catch (error: any) {
      Alert.alert('Could not end room', error?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMic = async () => {
    if (activeRole === 'listener') return;
    setMicBusy(true);
    try {
      toggleMicrophone();
    } finally {
      setMicBusy(false);
    }
  };

  const visibleParticipants = useMemo(
    () => participants.slice().sort((a, b) => Number(b.isSpeaking) - Number(a.isSpeaking)),
    [participants]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {room?.title || 'Podcast room'}
        </Text>
        <Pressable onPress={() => (sessionForThisRoom ? minimizeRoom() : router.push('/live' as any))} style={styles.iconBtn}>
          <Feather name={sessionForThisRoom ? 'minus' : 'radio'} size={18} color={tokens.colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.livePill}>
            <Text style={styles.livePillText}>{prettyStatus(room)}</Text>
          </View>
          <Text style={styles.roomTitle}>{room?.title || 'Loading room...'}</Text>
          <Text style={styles.roomMeta}>
            {(room?.host_name || 'Therapist') + (room?.listener_count_current ? ` · ${room.listener_count_current} listening` : '')}
          </Text>
          {!!room?.description ? <Text style={styles.roomDesc}>{room.description}</Text> : null}
          {!!room?.topic ? <Text style={styles.topicPill}>{room.topic}</Text> : null}
        </View>

        {!sessionForThisRoom ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Join this room</Text>
            <Text style={styles.panelText}>
              Use a co-host code if you were invited, otherwise join as a listener.
            </Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Optional invite code"
              placeholderTextColor={tokens.colors.textMuted}
              autoCapitalize="characters"
              style={styles.input}
            />
            <View style={styles.actionsRow}>
              <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={handleJoin} disabled={busy}>
                <Text style={styles.primaryBtnText}>{busy ? 'Joining…' : 'Join room'}</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>Once joined, you can minimize the room and keep listening while browsing the app.</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Connected</Text>
            <Text style={styles.panelText}>Role: {activeRole!.replace('_', ' ')} · Audio: {connectionState}</Text>
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
            <View style={styles.actionsRow}>
              {activeRole !== 'listener' ? (
                <Pressable style={styles.secondaryBtn} onPress={handleToggleMic} disabled={micBusy}>
                  <Text style={styles.secondaryBtnText}>{micEnabled ? 'Mute mic' : 'Unmute mic'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.secondaryBtn} onPress={minimizeRoom}>
                <Text style={styles.secondaryBtnText}>Minimize</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={handleLeave}>
                <Text style={styles.secondaryBtnText}>Leave room</Text>
              </Pressable>
            </View>

            <View style={styles.infoBox}>
              <Feather name="smartphone" size={15} color={tokens.colors.pink} />
              <Text style={styles.infoText}>Minimize to a floating capsule and keep listening while using other app screens.</Text>
            </View>
          </View>
        )}

        {activeRole === 'host' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Host controls</Text>
            <View style={styles.actionsRow}>
              {room?.status === 'scheduled' ? (
                <Pressable style={styles.secondaryBtn} onPress={handleStart}>
                  <Text style={styles.secondaryBtnText}>Start room</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.secondaryBtn} onPress={handleInvite}>
                <Text style={styles.secondaryBtnText}>Create co-host code</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={handleEnd}>
                <Text style={styles.dangerBtnText}>End room</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {sessionForThisRoom ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>People in room</Text>
            {visibleParticipants.length === 0 ? (
              <Text style={styles.panelText}>Waiting for participants...</Text>
            ) : (
              <View style={styles.peopleWrap}>
                {visibleParticipants.map((item) => (
                  <View key={item.identity} style={styles.personChip}>
                    <View style={[styles.personDot, item.isSpeaking && styles.personDotLive]} />
                    <Text style={styles.personText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.isLocal ? <Text style={styles.meTag}>You</Text> : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {canModerate ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Speaker queue</Text>
            {pendingRequests.length === 0 ? (
              <Text style={styles.panelText}>No one is waiting to speak.</Text>
            ) : (
              pendingRequests.map((item) => (
                <View key={item.id} style={styles.queueRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.queueTitle}>{item.user_uid}</Text>
                    {!!item.note ? <Text style={styles.queueNote}>{item.note}</Text> : null}
                  </View>
                  <Pressable style={styles.queueApprove} onPress={() => resolveLivePodcastSpeakerRequest(item.id, true)}>
                    <Text style={styles.queueApproveText}>Approve</Text>
                  </Pressable>
                  <Pressable style={styles.queueDecline} onPress={() => resolveLivePodcastSpeakerRequest(item.id, false)}>
                    <Text style={styles.queueDeclineText}>Decline</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        ) : null}

        {!canModerate && room?.allow_raise_hand !== false ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Want to speak?</Text>
            <Text style={styles.panelText}>Raise your hand and the host can invite you on stage.</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => requestLivePodcastSpeaker(roomId)}>
              <Text style={styles.secondaryBtnText}>Raise hand</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 50, gap: 16 },
  hero: {
    backgroundColor: '#fff4f8',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.24)',
    padding: 18,
    gap: 8,
  },
  livePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.12)',
  },
  livePillText: { fontSize: 11, fontWeight: '900', color: tokens.colors.pink },
  roomTitle: { fontSize: 24, fontWeight: '900', color: tokens.colors.text },
  roomMeta: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  roomDesc: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: tokens.colors.textSecondary },
  topicPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 16,
    gap: 10,
  },
  panelTitle: { fontSize: 17, fontWeight: '900', color: tokens.colors.text },
  panelText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: tokens.colors.textSecondary },
  helperText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: tokens.colors.textMuted },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#dc2626' },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 16,
    backgroundColor: tokens.colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: tokens.colors.text, fontSize: 13, fontWeight: '900' },
  dangerBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '900' },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  queueTitle: { fontSize: 13, fontWeight: '800', color: tokens.colors.text },
  queueNote: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textSecondary },
  queueApprove: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  queueApproveText: { fontSize: 12, fontWeight: '900', color: '#059669' },
  queueDecline: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  queueDeclineText: { fontSize: 12, fontWeight: '900', color: '#dc2626' },
  peopleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  personDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.colors.textMuted },
  personDotLive: { backgroundColor: tokens.colors.pink },
  personText: { maxWidth: 140, fontSize: 12, fontWeight: '800', color: tokens.colors.text },
  meTag: { fontSize: 11, fontWeight: '900', color: tokens.colors.pink },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(244,114,182,0.08)',
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700', color: tokens.colors.textSecondary },
});
