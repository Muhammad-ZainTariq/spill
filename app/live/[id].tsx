import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLivePodcast } from '@/components/live/LivePodcastProvider';
import { SpeakingWave } from '@/components/live/SpeakingWave';
import { tokens } from '@/app/ui/tokens';
import { auth } from '@/lib/firebase';
import {
  createLivePodcastInviteCode,
  endLivePodcastRoom,
  getLivePodcastRoom,
  joinLivePodcastRoom,
  leaveLivePodcastRoom,
  LivePodcastInviteDoc,
  LivePodcastRoom,
  LivePodcastTranscriptSegment,
  moderateLivePodcastParticipant,
  requestLivePodcastSpeaker,
  resolveLivePodcastSpeakerRequest,
  SpeakerRequest,
  startLivePodcastRoom,
  subscribeLivePodcastTranscriptSegments,
  subscribeLivePodcastRoom,
  subscribeRoomCoHostInvites,
  subscribeSpeakerRequests,
} from '@/lib/livePodcasts';

function prettyStatus(room: LivePodcastRoom | null) {
  if (!room) return 'Loading';
  if (room.status === 'live') return 'Live now';
  if (room.status === 'scheduled') return room.scheduled_for ? `Scheduled · ${new Date(room.scheduled_for).toLocaleString()}` : 'Scheduled';
  if (room.status === 'ended') return 'Ended';
  return room.status;
}

function formatCoHostInviteMeta(inv: LivePodcastInviteDoc): string {
  const max = Number(inv.max_uses || 1);
  const used = Number(inv.uses_count || 0);
  const left = Math.max(0, max - used);
  let expLabel = '';
  if (inv.expires_at) {
    const t = Date.parse(String(inv.expires_at));
    if (!Number.isNaN(t)) {
      const mins = Math.max(0, Math.round((t - Date.now()) / 60000));
      if (mins >= 1440) expLabel = ` · expires in ~${Math.round(mins / 1440)}d`;
      else if (mins >= 60) expLabel = ` · expires in ~${Math.round(mins / 60)}h`;
      else expLabel = ` · expires in ~${mins}m`;
    }
  }
  return `${left} use${left === 1 ? '' : 's'} left${expLabel}`;
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
    sessionDurationLabel,
  } = useLivePodcast();
  const [room, setRoom] = useState<LivePodcastRoom | null>(null);
  const [speakerRequests, setSpeakerRequests] = useState<SpeakerRequest[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<LivePodcastTranscriptSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [participantMenuTarget, setParticipantMenuTarget] = useState<{ identity: string; name: string } | null>(null);
  const [hostCoHostInvites, setHostCoHostInvites] = useState<LivePodcastInviteDoc[]>([]);
  const therapistHomePath = auth.currentUser?.uid ? `/therapist/${auth.currentUser.uid}` : '/live';

  const sessionForThisRoom = !!activeSession && activeSession.room.id === roomId;
  const activeRole = sessionForThisRoom ? activeSession?.role : null;
  const isRoomHost = !!room?.host_uid && room.host_uid === auth.currentUser?.uid;
  const canModerate = isRoomHost || activeRole === 'host' || activeRole === 'co_host';
  const activeRoleLabel = activeRole ? activeRole.replace('_', ' ') : isRoomHost ? 'host' : 'listener';

  useEffect(() => {
    if (!roomId) return;
    getLivePodcastRoom(roomId).then(setRoom).catch(() => setRoom(null));
    const unsubRoom = subscribeLivePodcastRoom(roomId, (next) => {
      setRoom(next);
      if (next && sessionForThisRoom) updateRoom(next);
    });
    const unsubRequests = subscribeSpeakerRequests(roomId, setSpeakerRequests);
    const unsubTranscripts = subscribeLivePodcastTranscriptSegments(roomId, setTranscriptSegments);
    return () => {
      unsubRoom();
      unsubRequests();
      unsubTranscripts();
    };
  }, [roomId, sessionForThisRoom, updateRoom]);

  useEffect(() => {
    if (!roomId || !isRoomHost) {
      setHostCoHostInvites([]);
      return;
    }
    const unsub = subscribeRoomCoHostInvites(roomId, setHostCoHostInvites);
    return unsub;
  }, [roomId, isRoomHost]);

  const pendingRequests = useMemo(
    () => speakerRequests.filter((item) => item.status === 'waiting'),
    [speakerRequests]
  );

  const currentUserRequest = useMemo(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    const mine = speakerRequests.filter((item) => item.user_uid === uid);
    if (!mine.length) return undefined;
    return mine.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
  }, [speakerRequests]);

  const requestRaiseBlocked =
    busy || currentUserRequest?.status === 'waiting' || currentUserRequest?.status === 'approved';

  const handleRaiseHand = async () => {
    if (!roomId || requestRaiseBlocked) return;
    setBusy(true);
    try {
      await requestLivePodcastSpeaker(roomId);
      Alert.alert('Request sent', 'The host can approve you to speak.');
    } catch (error: any) {
      Alert.alert('Could not send request', error?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleModerate = async (
    targetUid: string,
    action: 'kick' | 'remove_from_stage' | 'mute' | 'unmute'
  ) => {
    if (!roomId) return;
    setModBusy(`${targetUid}:${action}`);
    try {
      await moderateLivePodcastParticipant(roomId, targetUid, action);
    } catch (error: any) {
      Alert.alert('Could not update participant', error?.message || 'Try again.');
    } finally {
      setModBusy(null);
    }
  };

  const handleJoin = async () => {
    if (!roomId) return;
    if (sessionForThisRoom) {
      return;
    }
    setBusy(true);
    try {
      const session = await joinLivePodcastRoom(roomId);
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
    router.replace((isRoomHost ? therapistHomePath : '/live') as any);
  };

  const handleInvite = async () => {
    if (!roomId) return;
    try {
      await createLivePodcastInviteCode(roomId, 'co_host');
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
      router.replace(therapistHomePath as any);
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
  const someoneSpeaking = useMemo(
    () => visibleParticipants.some((participant) => participant.isSpeaking),
    [visibleParticipants]
  );
  const captionLines = useMemo(
    () => transcriptSegments.filter((item) => String(item.text || '').trim()).slice(-4),
    [transcriptSegments]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace((isRoomHost ? therapistHomePath : '/live') as any))}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {room?.title || 'Podcast room'}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {isRoomHost ? 'Host room controls' : 'Join and listen live'}
          </Text>
        </View>
        {sessionForThisRoom ? (
          <Pressable onPress={minimizeRoom} style={styles.iconBtn}>
            <Feather name="minus" size={18} color={tokens.colors.text} />
          </Pressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroCoverWrap}>
              {room?.cover_url ? (
                <Image source={{ uri: room.cover_url }} style={styles.heroCover} contentFit="cover" />
              ) : (
                <View style={styles.heroCoverFallback}>
                  <Feather name="mic" size={28} color={tokens.colors.pink} />
                </View>
              )}
            </View>
            {room?.status === 'live' ? (
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>{prettyStatus(room)}</Text>
              </View>
            ) : null}
          </View>
          {room?.status !== 'live' ? (
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>{prettyStatus(room)}</Text>
            </View>
          ) : null}
          <Text style={styles.roomTitle}>{room?.title || 'Loading room...'}</Text>
          <Text style={styles.roomMeta}>{room?.host_name || 'Therapist'} · {room?.status === 'live' ? 'Live now' : 'Podcast space'}</Text>
          {!!room?.description ? <Text style={styles.roomDesc}>{room.description}</Text> : null}
          {!!room?.topic ? <Text style={styles.topicPill}>{room.topic}</Text> : null}
          {sessionForThisRoom ? (
            <View style={styles.waveInfoRow}>
              <SpeakingWave active={someoneSpeaking} color={tokens.colors.pink} />
              <Text style={styles.waveInfoText}>
                {activeRole === 'host' || activeRole === 'co_host'
                  ? micEnabled
                    ? 'Your microphone is live'
                    : 'Your microphone is muted'
                  : someoneSpeaking
                    ? 'The room is active right now'
                    : 'Waiting for someone to speak'}
              </Text>
            </View>
          ) : null}
        </View>

        {isRoomHost && room && room.status !== 'ended' ? (
          <View style={styles.coHostShareCard}>
            <View style={styles.coHostShareHead}>
              <View style={styles.coHostShareIcon}>
                <Feather name="key" size={18} color="#2563eb" />
              </View>
              <Text style={styles.coHostShareTitle}>Co-host code</Text>
            </View>
            <Text style={styles.coHostShareDesc}>
              Share this code so someone can join from Live → Join as co-host. They can connect after you go live.
            </Text>
            {hostCoHostInvites.length > 0 ? (
              <>
                <Text style={styles.coHostCodeMono} selectable>
                  {hostCoHostInvites[0].code}
                </Text>
                <Text style={styles.coHostShareMeta}>{formatCoHostInviteMeta(hostCoHostInvites[0])}</Text>
              </>
            ) : (
              <Text style={styles.coHostShareEmpty}>
                No active code yet — tap &quot;Create new co-host code&quot; in Host controls below.
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.captionCard}>
          <View style={styles.captionHeader}>
            <Feather name="message-square" size={15} color={tokens.colors.pink} />
            <Text style={styles.captionTitle}>Live subtitles</Text>
          </View>
          {captionLines.length > 0 ? (
            captionLines.map((item) => (
              <Text key={item.id} style={[styles.captionLine, !item.is_final && styles.captionLineMuted]}>
                {item.text}
              </Text>
            ))
          ) : (
            <Text style={styles.captionEmpty}>Subtitles will appear here when someone speaks in the room.</Text>
          )}
        </View>

        {!sessionForThisRoom && !isRoomHost ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Join this room</Text>
            <Text style={styles.panelText}>
              Join as a listener and keep the room playing while you browse the app.
            </Text>
            <View style={styles.actionsRow}>
              <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={handleJoin} disabled={busy}>
                <Text style={styles.primaryBtnText}>{busy ? 'Joining…' : 'Join room'}</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>Once joined, you can minimize the room and keep listening while browsing the app.</Text>
          </View>
        ) : sessionForThisRoom ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Connected</Text>
            <Text style={styles.panelText}>
              Role: {activeRoleLabel} · In session {sessionDurationLabel} · Audio: {connectionState}
            </Text>
            {activeRole === 'speaker' && connectionState === 'connected' && !micEnabled ? (
              <Text style={styles.helperText}>
                Tap &quot;Unmute mic&quot; below so others can hear you. Check the mic permission in Settings if needed.
              </Text>
            ) : null}
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
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Host audio is not connected</Text>
            <Text style={styles.panelText}>Start the room, then tap connect audio so listeners can hear you live.</Text>
            <View style={styles.actionsRow}>
              {room?.status === 'live' ? (
                <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={handleJoin} disabled={busy}>
                  <Text style={styles.primaryBtnText}>{busy ? 'Connecting…' : 'Connect audio'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        {isRoomHost ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Host controls</Text>
            <View style={styles.actionsRow}>
              {room?.status === 'scheduled' ? (
                <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={handleStart} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>{busy ? 'Starting…' : 'Start room'}</Text>
                </Pressable>
              ) : null}
              {room?.status === 'live' && !sessionForThisRoom ? (
                <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={handleJoin} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>{busy ? 'Connecting…' : 'Connect audio'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.secondaryBtn} onPress={handleInvite}>
                <Text style={styles.secondaryBtnText}>Create new co-host code</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Your current code is shown in the card above. Use the button to generate a new one anytime (the latest appears first).
            </Text>
            {room?.status === 'live' ? (
              <Pressable style={[styles.dangerBtnWide, busy && styles.btnDisabled]} onPress={handleEnd} disabled={busy}>
                <Text style={styles.dangerBtnText}>{busy ? 'Ending…' : 'End live broadcast'}</Text>
              </Pressable>
            ) : null}
            {room?.status === 'ended' ? (
              <Text style={styles.helperText}>This broadcast has ended. Replay status is managed from the room data.</Text>
            ) : null}
          </View>
        ) : null}

        {sessionForThisRoom ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>People in room</Text>
            {canModerate ? (
              <Text style={styles.panelHint}>Tap someone to mute, remove from mic, or remove from the broadcast.</Text>
            ) : null}
            {visibleParticipants.length === 0 ? (
              <Text style={styles.panelText}>Waiting for participants...</Text>
            ) : (
              <View style={styles.peopleWrap}>
                {visibleParticipants.map((item) => {
                  const canOpenMenu =
                    canModerate && !item.isLocal && item.identity !== room?.host_uid;
                  const Chip = canOpenMenu ? Pressable : View;
                  return (
                    <Chip
                      key={item.identity}
                      style={styles.personChip}
                      onPress={
                        canOpenMenu
                          ? () => setParticipantMenuTarget({ identity: item.identity, name: item.name || 'Participant' })
                          : undefined
                      }
                    >
                      {item.isSpeaking ? (
                        <SpeakingWave active compact color={tokens.colors.pink} />
                      ) : (
                        <View style={styles.personDot} />
                      )}
                      <Text style={styles.personText} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.isLocal ? <Text style={styles.meTag}>You</Text> : null}
                    </Chip>
                  );
                })}
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
                  <View style={styles.queueIdentity}>
                    <View style={styles.queueAvatar}>
                      {item.user_avatar_url ? (
                        <Image source={{ uri: item.user_avatar_url }} style={styles.queueAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.queueAvatarFallback}>
                          {(item.user_display_name || item.user_uid || '?').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.queueIdentityText}>
                      <Text style={styles.queueTitle} numberOfLines={1}>
                        {item.user_display_name?.trim() || `Member ${String(item.user_uid || '').slice(0, 8)}`}
                      </Text>
                      {!!item.note ? <Text style={styles.queueNote}>{item.note}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.queueActions}>
                    <Pressable style={styles.queueApprove} onPress={() => resolveLivePodcastSpeakerRequest(item.id, true)}>
                      <Text style={styles.queueApproveText}>Approve</Text>
                    </Pressable>
                    <Pressable style={styles.queueDecline} onPress={() => resolveLivePodcastSpeakerRequest(item.id, false)}>
                      <Text style={styles.queueDeclineText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {canModerate && (room?.approved_speaker_uids?.length ?? 0) > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>On stage</Text>
            <Text style={styles.panelText}>
              Remove from mic keeps them in the podcast listening. Remove from broadcast disconnects them fully.
            </Text>
            {(room?.approved_speaker_uids || [])
              .filter((stageUid) => stageUid && stageUid !== room.host_uid)
              .map((stageUid) => {
                const reqMeta = speakerRequests
                  .filter((r) => r.user_uid === stageUid)
                  .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
                const label =
                  reqMeta?.user_display_name?.trim() ||
                  visibleParticipants.find((p) => p.identity === stageUid)?.name ||
                  `Member ${stageUid.slice(0, 8)}`;
                const avatarUrl = reqMeta?.user_avatar_url;
                const busyKey = (action: string) => modBusy === `${stageUid}:${action}`;
                return (
                  <View key={stageUid} style={styles.queueRow}>
                    <View style={styles.queueIdentity}>
                      <View style={styles.queueAvatar}>
                        {avatarUrl ? (
                          <Image source={{ uri: avatarUrl }} style={styles.queueAvatarImg} contentFit="cover" />
                        ) : (
                          <Text style={styles.queueAvatarFallback}>{label.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.queueIdentityText}>
                        <Text style={styles.queueTitle} numberOfLines={1}>
                          {label}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modActions}>
                      <Pressable
                        style={[styles.modBtn, busyKey('remove_from_stage') && styles.btnDisabled]}
                        disabled={!!modBusy}
                        onPress={() => handleModerate(stageUid, 'remove_from_stage')}
                      >
                        <Text style={styles.modBtnText}>Remove from mic</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modBtn, busyKey('mute') && styles.btnDisabled]}
                        disabled={!!modBusy}
                        onPress={() => handleModerate(stageUid, 'mute')}
                      >
                        <Text style={styles.modBtnText}>Mute</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modBtn, busyKey('unmute') && styles.btnDisabled]}
                        disabled={!!modBusy}
                        onPress={() => handleModerate(stageUid, 'unmute')}
                      >
                        <Text style={styles.modBtnText}>Unmute</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modBtnDanger, busyKey('kick') && styles.btnDisabled]}
                        disabled={!!modBusy}
                        onPress={() => handleModerate(stageUid, 'kick')}
                      >
                        <Text style={styles.modBtnDangerText}>Remove from broadcast</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
          </View>
        ) : null}

        {!canModerate && !isRoomHost && room?.allow_raise_hand !== false ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Want to speak?</Text>
            <Text style={styles.panelText}>Raise your hand and the host can invite you on stage.</Text>
            <Pressable style={[styles.secondaryBtn, requestRaiseBlocked && styles.btnDisabled]} onPress={handleRaiseHand} disabled={requestRaiseBlocked}>
              <Text style={styles.secondaryBtnText}>
                {currentUserRequest?.status === 'waiting'
                  ? 'Request sent'
                  : currentUserRequest?.status === 'approved'
                    ? 'Approved to speak'
                    : 'Raise hand'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={!!participantMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setParticipantMenuTarget(null)}
      >
        <Pressable style={styles.participantMenuBackdrop} onPress={() => setParticipantMenuTarget(null)}>
          <Pressable style={styles.participantMenuSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.participantMenuTitle} numberOfLines={1}>
              {participantMenuTarget?.name}
            </Text>
            <Text style={styles.participantMenuHint}>Moderation</Text>
            <Pressable
              style={styles.participantMenuBtn}
              onPress={() => {
                const id = participantMenuTarget?.identity;
                if (id) handleModerate(id, 'remove_from_stage');
                setParticipantMenuTarget(null);
              }}
            >
              <Text style={styles.participantMenuBtnText}>Remove from mic only</Text>
              <Text style={styles.participantMenuSub}>They stay in the podcast, listening</Text>
            </Pressable>
            <Pressable
              style={styles.participantMenuBtn}
              onPress={() => {
                const id = participantMenuTarget?.identity;
                if (id) handleModerate(id, 'mute');
                setParticipantMenuTarget(null);
              }}
            >
              <Text style={styles.participantMenuBtnText}>Mute</Text>
            </Pressable>
            <Pressable
              style={styles.participantMenuBtn}
              onPress={() => {
                const id = participantMenuTarget?.identity;
                if (id) handleModerate(id, 'unmute');
                setParticipantMenuTarget(null);
              }}
            >
              <Text style={styles.participantMenuBtnText}>Unmute</Text>
            </Pressable>
            <Pressable
              style={styles.participantMenuBtnDanger}
              onPress={() => {
                const id = participantMenuTarget?.identity;
                if (id) handleModerate(id, 'kick');
                setParticipantMenuTarget(null);
              }}
            >
              <Text style={styles.participantMenuBtnDangerText}>Remove from broadcast</Text>
              <Text style={styles.participantMenuSub}>Disconnects them from the live room</Text>
            </Pressable>
            <Pressable style={styles.participantMenuCancel} onPress={() => setParticipantMenuTarget(null)}>
              <Text style={styles.participantMenuCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  backBtn: {
    minWidth: 76,
    height: 42,
    borderRadius: 21,
    backgroundColor: tokens.colors.surfaceOverlay,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  headerSubtitle: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.textMuted,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 50, gap: 16 },
  hero: {
    backgroundColor: '#fff4f8',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.24)',
    padding: 18,
    gap: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroCoverWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  heroCover: {
    width: '100%',
    height: '100%',
  },
  heroCoverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
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
  coHostShareCard: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.22)',
    padding: 16,
    gap: 10,
  },
  coHostShareHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coHostShareIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coHostShareTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  coHostShareDesc: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  coHostCodeMono: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    color: tokens.colors.text,
    textAlign: 'center',
    paddingVertical: 8,
  },
  coHostShareMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  coHostShareEmpty: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: tokens.colors.textSecondary,
    fontStyle: 'italic',
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
  panelHint: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: tokens.colors.textMuted },
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
  btnDisabled: {
    opacity: 0.6,
  },
  dangerBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '900' },
  dangerBtnWide: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    flexWrap: 'wrap',
  },
  queueIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  queueAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueAvatarImg: { width: '100%', height: '100%' },
  queueAvatarFallback: { fontSize: 16, fontWeight: '900', color: tokens.colors.text },
  queueIdentityText: { flex: 1, minWidth: 0 },
  queueActions: { flexDirection: 'row', gap: 8 },
  modActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  modBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  modBtnText: { fontSize: 12, fontWeight: '900', color: tokens.colors.text },
  modBtnDanger: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  modBtnDangerText: { fontSize: 12, fontWeight: '900', color: '#dc2626' },
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
  waveInfoRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waveInfoText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.textSecondary,
  },
  captionCard: {
    borderRadius: 22,
    backgroundColor: '#0f172a',
    padding: 16,
    gap: 8,
  },
  captionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  captionLine: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  captionLineMuted: {
    color: 'rgba(255,255,255,0.78)',
  },
  captionEmpty: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(244,114,182,0.08)',
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700', color: tokens.colors.textSecondary },
  participantMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  participantMenuSheet: {
    borderRadius: 20,
    backgroundColor: tokens.colors.surface,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  participantMenuTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  participantMenuHint: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    marginBottom: 4,
  },
  participantMenuBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  participantMenuBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  participantMenuSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  participantMenuBtnDanger: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  participantMenuBtnDangerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#dc2626',
  },
  participantMenuCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  participantMenuCancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.textMuted,
  },
});
