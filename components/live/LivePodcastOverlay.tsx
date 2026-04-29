import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeakingWave } from '@/components/live/SpeakingWave';
import { tokens } from '@/app/ui/tokens';
import { auth } from '@/lib/firebase';
import {
  endLivePodcastRoom,
  getLivePodcastRoom,
  joinLivePodcastRoom,
  leaveLivePodcastRoom,
  LivePodcastTranscriptSegment,
  moderateLivePodcastParticipant,
  requestLivePodcastSpeaker,
  resolveLivePodcastSpeakerRequest,
  SpeakerRequest,
  startLivePodcastRoom,
  subscribeLivePodcastTranscriptSegments,
  subscribeLivePodcastRoom,
  subscribeSpeakerRequests,
  type LivePodcastRole,
  type LivePodcastRoom,
} from '@/lib/livePodcasts';

function prettyStatus(room: LivePodcastRoom | null) {
  if (!room) return 'Loading';
  if (room.status === 'live') return 'Live now';
  if (room.status === 'scheduled') return room.scheduled_for ? `Scheduled · ${new Date(room.scheduled_for).toLocaleString()}` : 'Scheduled';
  if (room.status === 'ended') return 'Ended';
  return room.status;
}

export function LivePodcastOverlay({
  roomId,
  visible,
  onClose,
  activeSession,
  connectToRoom,
  leaveRoom,
  participants,
  connectionState,
  micEnabled,
  playbackMuted,
  dominantSpeakerLevel,
  lastError,
  toggleMicrophone,
  togglePlayback,
  sessionDurationLabel,
}: {
  roomId: string | null;
  visible: boolean;
  onClose: () => void;
  activeSession: { room: LivePodcastRoom; role: LivePodcastRole } | null;
  connectToRoom: (session: { room: LivePodcastRoom; role: LivePodcastRole; token: string; serverUrl: string }) => void;
  leaveRoom: () => void;
  participants: { identity: string; name: string; role?: LivePodcastRole | null; isLocal: boolean; isSpeaking: boolean; audioLevel: number }[];
  connectionState: string;
  micEnabled: boolean;
  playbackMuted: boolean;
  dominantSpeakerLevel: number;
  lastError: string | null;
  toggleMicrophone: () => void;
  togglePlayback: () => void;
  sessionDurationLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<LivePodcastRoom | null>(null);
  const [speakerRequests, setSpeakerRequests] = useState<SpeakerRequest[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<LivePodcastTranscriptSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [participantMenuTarget, setParticipantMenuTarget] = useState<{ identity: string; name: string } | null>(null);

  const sessionForThisRoom = !!activeSession && !!roomId && activeSession.room.id === roomId;
  const currentUid = auth.currentUser?.uid || null;
  const activeRole = useMemo(() => {
    if (!sessionForThisRoom || !room || !currentUid) return null;
    if (currentUid === room.host_uid) return 'host';
    if (Array.isArray(room.co_host_ids) && room.co_host_ids.includes(currentUid)) return 'co_host';
    if (Array.isArray(room.approved_speaker_uids) && room.approved_speaker_uids.includes(currentUid)) return 'speaker';
    return activeSession?.role || 'listener';
  }, [activeSession?.role, currentUid, room, sessionForThisRoom]);
  const isRoomHost = !!room?.host_uid && room.host_uid === auth.currentUser?.uid;
  const canModerate = isRoomHost || activeRole === 'host' || activeRole === 'co_host';
  const pendingRequests = useMemo(
    () => speakerRequests.filter((item) => item.status === 'waiting'),
    [speakerRequests]
  );
  const visibleParticipants = useMemo(
    () => participants.slice().sort((a, b) => Number(b.isSpeaking) - Number(a.isSpeaking)),
    [participants]
  );
  const someoneSpeaking = visibleParticipants.some((p) => p.isSpeaking);
  const currentUserRequest = useMemo(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    const mine = speakerRequests.filter((item) => item.user_uid === uid);
    if (!mine.length) return undefined;
    return mine.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
  }, [speakerRequests]);

  const requestBlocked =
    busy || currentUserRequest?.status === 'waiting' || currentUserRequest?.status === 'approved';

  useEffect(() => {
    if (!roomId || !visible) return;
    getLivePodcastRoom(roomId).then(setRoom).catch(() => setRoom(null));
    const unsubRoom = subscribeLivePodcastRoom(roomId, setRoom);
    const unsubRequests = subscribeSpeakerRequests(roomId, setSpeakerRequests);
    const unsubTranscripts = subscribeLivePodcastTranscriptSegments(roomId, setTranscriptSegments);
    return () => {
      unsubRoom();
      unsubRequests();
      unsubTranscripts();
    };
  }, [roomId, visible]);

  const captionLines = useMemo(
    () => transcriptSegments.filter((item) => String(item.text || '').trim()).slice(-3),
    [transcriptSegments]
  );

  const closeOverlay = () => {
    onClose();
  };

  const handleJoin = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      const session = await joinLivePodcastRoom(roomId);
      connectToRoom({
        room: session.room,
        role: session.role,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch (error: any) {
      Alert.alert('Could not join room', error?.message || 'Try again.');
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
    if (roomId) {
      try {
        await leaveLivePodcastRoom(roomId);
      } catch {}
    }
    leaveRoom();
    onClose();
  };

  const handleEnd = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      await endLivePodcastRoom(roomId);
      leaveRoom();
      onClose();
    } catch (error: any) {
      Alert.alert('Could not end room', error?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestMic = async () => {
    if (!roomId || requestBlocked) return;
    setBusy(true);
    try {
      await requestLivePodcastSpeaker(roomId, 'Requested from live room sheet');
      Alert.alert('Request sent', 'The broadcaster can now approve or decline your request while live.');
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

  if (!visible || !roomId) return null;

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeOverlay}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={closeOverlay} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <View style={styles.topBar}>
            {sessionForThisRoom ? (
              <Pressable style={styles.topActionPill} onPress={handleLeave}>
                <Feather name="log-out" size={16} color="#dc2626" />
                <Text style={styles.topActionPillTextDanger}>Leave</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.topIconBtn} onPress={closeOverlay}>
                <Feather name="x" size={24} color={tokens.colors.text} />
              </Pressable>
            )}
            <View style={styles.topActions}>
              {sessionForThisRoom ? (
                <Pressable style={styles.topIconBtn} onPress={togglePlayback}>
                  <Feather name={playbackMuted ? 'play' : 'pause'} size={18} color={tokens.colors.text} />
                </Pressable>
              ) : null}
              <Pressable style={styles.topIconBtn} onPress={closeOverlay}>
                <Feather name="chevron-down" size={20} color={tokens.colors.text} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroArtworkWrap}>
                  {room?.cover_url ? (
                    <Image source={{ uri: room.cover_url }} style={styles.heroArtwork} contentFit="cover" />
                  ) : (
                    <View style={styles.heroArtworkFallback}>
                      <Feather name="mic" size={28} color={tokens.colors.pink} />
                    </View>
                  )}
                </View>
                <View style={styles.heroTextWrap}>
                  {room?.status === 'live' ? (
                    <View style={styles.recPill}>
                      <View style={styles.recDot} />
                      <Text style={styles.recText}>LIVE</Text>
                    </View>
                  ) : null}
                  <Text style={styles.heroTitle}>{room?.title || 'Podcast space'}</Text>
                  <Text style={styles.heroMeta}>{room?.host_name || 'Therapist'} · {prettyStatus(room)}</Text>
                </View>
              </View>
              {!!room?.description ? <Text style={styles.heroDescription}>{room.description}</Text> : null}
            </View>

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
                <Text style={styles.captionEmpty}>Subtitles will appear here when the speaker starts talking.</Text>
              )}
            </View>

            {sessionForThisRoom && visibleParticipants.length > 0 ? (
              <View style={styles.grid}>
                {visibleParticipants.map((participant) => {
                  const canOpenMenu =
                    canModerate &&
                    !participant.isLocal &&
                    participant.identity !== room?.host_uid;
                  const isCoHost =
                    (Array.isArray(room?.co_host_ids) && room.co_host_ids.includes(participant.identity)) ||
                    participant.role === 'co_host' ||
                    (participant.isLocal && activeRole === 'co_host');
                  const CardWrap = canOpenMenu ? Pressable : View;
                  return (
                    <CardWrap
                      key={participant.identity}
                      style={[styles.personCard, isCoHost && styles.coHostPersonCard]}
                      onPress={
                        canOpenMenu
                          ? () =>
                              setParticipantMenuTarget({
                                identity: participant.identity,
                                name: participant.name || 'Participant',
                              })
                          : undefined
                      }
                    >
                    <View style={styles.personAvatar}>
                      {room?.cover_url ? (
                        <Image source={{ uri: room.cover_url }} style={styles.personAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.personAvatarFallback}>{participant.name.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.personName} numberOfLines={1}>{participant.name}</Text>
                    <View style={styles.personMetaRow}>
                      <SpeakingWave
                        active={participant.isSpeaking && !playbackMuted}
                        level={participant.audioLevel}
                        compact
                        color={isCoHost ? '#F59E0B' : tokens.colors.pink}
                      />
                      <Text style={[styles.personRole, isCoHost && styles.coHostPersonRole]}>
                        {participant.isLocal
                          ? isCoHost
                            ? 'You · Co-host'
                            : 'You'
                          : participant.identity === room?.host_uid
                            ? 'Host'
                            : isCoHost
                              ? 'Co-host'
                              : room?.approved_speaker_uids?.includes(participant.identity)
                              ? 'Speaker'
                              : 'Listener'}
                      </Text>
                      {isCoHost ? (
                        <View style={styles.coHostCrown}>
                          <Feather name="star" size={9} color="#92400e" />
                        </View>
                      ) : null}
                    </View>
                    </CardWrap>
                  );
                })}
              </View>
            ) : (
              <View style={styles.previewCard}>
                <View style={styles.previewCoverWrap}>
                  {room?.cover_url ? (
                    <Image source={{ uri: room.cover_url }} style={styles.previewCover} contentFit="cover" />
                  ) : (
                    <View style={styles.previewFallback}>
                      <Feather name="mic" size={30} color={tokens.colors.pink} />
                    </View>
                  )}
                </View>
                <Text style={styles.previewTitle}>{room?.title || 'Podcast space'}</Text>
                <Text style={styles.previewText}>{room?.description || 'Join this live conversation and keep listening while browsing the app.'}</Text>
              </View>
            )}

            {sessionForThisRoom ? (
              <View style={styles.actionPanel}>
                <Text style={styles.panelTitle}>Connected</Text>
                <Text style={styles.panelText}>
                  In session · {sessionDurationLabel} · Audio: {connectionState}
                </Text>
                {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
                <View style={styles.controlsRow}>
                  <Pressable style={styles.secondaryBtn} onPress={togglePlayback}>
                    <Text style={styles.secondaryBtnText}>{playbackMuted ? 'Resume audio' : 'Pause audio'}</Text>
                  </Pressable>
                  {activeRole !== 'listener' ? (
                    <Pressable style={styles.secondaryBtn} onPress={toggleMicrophone}>
                      <Text style={styles.secondaryBtnText}>{micEnabled ? 'Mute mic' : 'Unmute mic'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {activeRole === 'speaker' && connectionState === 'connected' && !micEnabled ? (
                  <Text style={styles.helperText}>
                    Tap &quot;Unmute mic&quot; so others can hear you. If nothing happens, check microphone permission in Settings.
                  </Text>
                ) : null}
                <View style={styles.levelRow}>
                  <SpeakingWave active={someoneSpeaking && !playbackMuted} level={dominantSpeakerLevel} color={tokens.colors.pink} />
                  <Text style={styles.panelText}>
                    {activeRole === 'host' || activeRole === 'co_host'
                      ? micEnabled
                        ? 'Your microphone is live'
                        : 'Your microphone is muted'
                      : someoneSpeaking
                        ? 'Someone is speaking right now'
                        : 'Waiting for someone to speak'}
                  </Text>
                </View>
                {activeRole === 'listener' && room?.allow_raise_hand !== false ? (
                  <>
                    <Pressable
                      style={[styles.requestBtn, requestBlocked && styles.btnDisabled]}
                      onPress={handleRequestMic}
                      disabled={requestBlocked}
                    >
                      <Feather name="user-plus" size={16} color={tokens.colors.pink} />
                      <Text style={styles.requestBtnText}>
                        {currentUserRequest?.status === 'waiting'
                          ? 'Request sent'
                          : currentUserRequest?.status === 'approved'
                            ? 'Approved to speak'
                            : 'Request speaker access'}
                      </Text>
                    </Pressable>
                    {currentUserRequest ? (
                      <Text style={styles.helperText}>
                        {currentUserRequest.status === 'waiting'
                          ? 'Your request is pending for the broadcaster.'
                          : currentUserRequest.status === 'approved'
                            ? 'You have been approved. Your mic will connect automatically in a few seconds.'
                            : 'Your last speaker request was declined.'}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : (
              <View style={styles.actionPanel}>
                <Text style={styles.panelTitle}>Join live</Text>
                <Text style={styles.panelText}>Start listening right away, or request speaker access for the broadcaster to approve.</Text>
                <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleJoin} disabled={busy}>
                  <Text style={styles.primaryBtnText}>{busy ? 'Joining…' : 'Start listening'}</Text>
                </Pressable>
                {room?.allow_raise_hand !== false ? (
                  <Pressable style={[styles.requestBtn, requestBlocked && styles.btnDisabled]} onPress={handleRequestMic} disabled={requestBlocked}>
                    <Feather name="user-plus" size={16} color={tokens.colors.pink} />
                    <Text style={styles.requestBtnText}>
                      {currentUserRequest?.status === 'waiting'
                        ? 'Request sent'
                        : currentUserRequest?.status === 'approved'
                          ? 'Approved to speak'
                          : 'Request speaker access'}
                    </Text>
                  </Pressable>
                ) : null}
                {currentUserRequest ? (
                  <Text style={styles.helperText}>
                    {currentUserRequest.status === 'waiting'
                      ? 'Your request is pending for the broadcaster.'
                      : currentUserRequest.status === 'approved'
                        ? 'You have been approved. Stay connected — your mic will turn on automatically.'
                        : 'Your last speaker request was declined.'}
                  </Text>
                ) : null}
              </View>
            )}

            {isRoomHost ? (
              <View style={styles.actionPanel}>
                <Text style={styles.panelTitle}>Host controls</Text>
                <View style={styles.controlsRow}>
                  {room?.status === 'scheduled' ? (
                    <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={handleStart} disabled={busy}>
                      <Text style={styles.secondaryBtnText}>{busy ? 'Starting…' : 'Start room'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {room?.status === 'live' ? (
                  <Pressable style={[styles.dangerBtn, busy && styles.btnDisabled]} onPress={handleEnd} disabled={busy}>
                    <Text style={styles.dangerBtnText}>{busy ? 'Ending…' : 'End broadcast'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {canModerate && pendingRequests.length > 0 ? (
              <View style={styles.actionPanel}>
                <Text style={styles.panelTitle}>Join requests</Text>
                <Text style={styles.panelText}>Approve people who want mic access while you are broadcasting.</Text>
                {pendingRequests.map((item) => (
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
                        <Text style={styles.queueText} numberOfLines={1}>
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
                ))}
              </View>
            ) : null}

            {canModerate && (room?.approved_speaker_uids?.length ?? 0) > 0 ? (
              <View style={styles.actionPanel}>
                <Text style={styles.panelTitle}>On stage</Text>
                <Text style={styles.panelText}>
                  Remove from mic keeps them in the podcast as a listener. Remove from broadcast disconnects them completely. Tap someone in People above for the same options.
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
                            <Text style={styles.queueText} numberOfLines={1}>
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
          </ScrollView>
        </View>
      </View>
    </Modal>

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
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    minHeight: '76%',
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    marginBottom: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  topActionPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  topActionPillTextDanger: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '900',
  },
  topIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 16,
  },
  heroCard: {
    gap: 12,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroArtworkWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  heroArtwork: {
    width: '100%',
    height: '100%',
  },
  heroArtworkFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  recPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f43f5e',
  },
  recText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
  },
  heroMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#475569',
  },
  captionCard: {
    borderRadius: 20,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },
  personCard: {
    width: '23%',
    alignItems: 'center',
    gap: 6,
  },
  coHostPersonCard: {
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    shadowColor: '#92400e',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  personAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarImg: {
    width: '100%',
    height: '100%',
  },
  personAvatarFallback: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  personName: {
    maxWidth: '100%',
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  personMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  personRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  coHostPersonRole: {
    fontWeight: '900',
    color: '#92400e',
  },
  coHostCrown: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  previewCoverWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  previewCover: {
    width: '100%',
    height: '100%',
  },
  previewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
  },
  previewText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#64748b',
  },
  actionPanel: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    gap: 12,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  panelText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748b',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  requestBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.22)',
    backgroundColor: 'rgba(236,72,153,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  requestBtnText: {
    color: '#be185d',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  dangerBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  dangerBtnText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '900',
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueAvatarImg: {
    width: '100%',
    height: '100%',
  },
  queueAvatarFallback: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  queueIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  queueNote: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  queueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  queueActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  modBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  modBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
  },
  modBtnDanger: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  modBtnDangerText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
  queueApprove: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  queueApproveText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },
  queueDecline: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  queueDeclineText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748b',
  },
  participantMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  participantMenuSheet: {
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 16,
    gap: 8,
  },
  participantMenuTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  participantMenuHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  participantMenuBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
  },
  participantMenuBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  participantMenuSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
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
    color: '#64748b',
  },
});
