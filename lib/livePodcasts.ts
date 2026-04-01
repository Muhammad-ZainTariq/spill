import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { getApp } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { auth, db, functions, getDownloadURL, ref, storage } from '@/lib/firebase';

export type LivePodcastRoomStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type LivePodcastRecordMode = 'none' | 'draft' | 'publish';
export type LivePodcastRole = 'host' | 'co_host' | 'speaker' | 'listener';

export type LivePodcastRoom = {
  id: string;
  title: string;
  description?: string;
  topic?: string;
  tags?: string[];
  cover_url?: string | null;
  host_uid: string;
  host_name?: string;
  status: LivePodcastRoomStatus;
  visibility?: 'public' | 'premium_only';
  scheduled_for?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  record_mode?: LivePodcastRecordMode;
  replay_status?: 'none' | 'draft' | 'published' | 'deleted';
  allow_raise_hand?: boolean;
  allow_listener_speaking?: boolean;
  livekit_room_name?: string;
  co_host_ids?: string[];
  /** UIDs approved via raise-hand (granted speaker role on next join). */
  approved_speaker_uids?: string[];
  /** ISO time when server should send “starting soon” reminder pushes (subscribers + host). */
  reminder_fire_at?: string | null;
  scheduled_reminder_sent?: boolean;
  listener_count_current?: number;
  listener_count_peak?: number;
  total_join_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type SpeakerRequest = {
  id: string;
  room_id: string;
  user_uid: string;
  user_display_name?: string;
  user_avatar_url?: string | null;
  note?: string;
  status: 'waiting' | 'approved' | 'declined' | 'cancelled';
  created_at?: string;
};

export type LivePodcastSession = {
  room: LivePodcastRoom;
  role: LivePodcastRole;
  token: string;
  serverUrl: string;
  usedFreeAccess?: boolean;
  premiumUnlocked?: boolean;
};

export type LivePodcastTranscriptSegment = {
  id: string;
  room_id: string;
  text: string;
  is_final: boolean;
  speaker_uid?: string | null;
  speaker_name?: string | null;
  sequence?: number;
  created_at?: string;
  updated_at?: string;
};

function normalizeLivePodcastRoom(raw: LivePodcastRoom): LivePodcastRoom {
  const endedAt = typeof raw.ended_at === 'string' ? raw.ended_at.trim() : '';
  const startedAt = typeof raw.started_at === 'string' ? raw.started_at.trim() : '';
  if (endedAt) {
    return { ...raw, status: 'ended', ended_at: endedAt };
  }
  if (startedAt && raw.status !== 'cancelled') {
    return { ...raw, status: 'live', started_at: startedAt };
  }
  if (raw.status === 'scheduled' || raw.status === 'cancelled') {
    return raw;
  }
  return { ...raw, status: 'scheduled' };
}

export async function currentUserCanHostLivePodcasts(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const [userSnap, therapistSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'therapist_profiles', uid)),
  ]);
  return !!userSnap.data()?.is_admin || therapistSnap.exists();
}

export function subscribeLivePodcastRooms(cb: (rooms: LivePodcastRoom[]) => void): Unsubscribe {
  const q = query(collection(db, 'live_podcast_rooms'), orderBy('created_at', 'desc'), limit(60));
  return onSnapshot(q, (snap) => {
    const rooms = snap.docs.map((d) => normalizeLivePodcastRoom({ id: d.id, ...(d.data() as any) } as LivePodcastRoom));
    cb(rooms);
  });
}

export async function getLivePodcastRoom(roomId: string): Promise<LivePodcastRoom | null> {
  const snap = await getDoc(doc(db, 'live_podcast_rooms', roomId));
  return snap.exists() ? normalizeLivePodcastRoom({ id: snap.id, ...(snap.data() as any) } as LivePodcastRoom) : null;
}

export function subscribeLivePodcastRoom(roomId: string, cb: (room: LivePodcastRoom | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'live_podcast_rooms', roomId), (snap) => {
    cb(snap.exists() ? normalizeLivePodcastRoom({ id: snap.id, ...(snap.data() as any) } as LivePodcastRoom) : null);
  });
}

export function subscribeSpeakerRequests(roomId: string, cb: (items: SpeakerRequest[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'live_podcast_speaker_requests'),
    where('room_id', '==', roomId),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }) as SpeakerRequest)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    cb(items);
  });
}

export function subscribeLivePodcastTranscriptSegments(
  roomId: string,
  cb: (items: LivePodcastTranscriptSegment[]) => void,
  max: number = 6
): Unsubscribe {
  const q = query(
    collection(db, 'live_podcast_rooms', roomId, 'transcripts'),
    orderBy('created_at', 'desc'),
    limit(max)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }) as LivePodcastTranscriptSegment)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0) || (a.created_at || '').localeCompare(b.created_at || ''));
    cb(items);
  });
}

export async function publishLivePodcastTranscriptSegment(
  roomId: string,
  segment: Omit<LivePodcastTranscriptSegment, 'room_id'> & { id: string; text: string }
) {
  const ref = doc(db, 'live_podcast_rooms', roomId, 'transcripts', segment.id);
  await setDoc(
    ref,
    {
      room_id: roomId,
      text: segment.text,
      is_final: !!segment.is_final,
      speaker_uid: segment.speaker_uid || auth.currentUser?.uid || null,
      speaker_name: segment.speaker_name || auth.currentUser?.displayName || null,
      sequence: Number(segment.sequence || 0),
      created_at: segment.created_at || new Date().toISOString(),
      updated_at: segment.updated_at || new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function createLivePodcastRoom(input: {
  title: string;
  description?: string;
  topic?: string;
  tags?: string[];
  cover_url?: string | null;
  scheduled_for?: string | null;
  record_mode?: LivePodcastRecordMode;
  allow_raise_hand?: boolean;
  allow_listener_speaking?: boolean;
}) {
  const fn = httpsCallable(functions, 'createLivePodcastRoom', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  const { data } = await fn(input as any);
  return data as { room: LivePodcastRoom };
}

async function ensureReadableFileUri(uri: string): Promise<string> {
  const trimmed = String(uri || '').trim();
  if (!trimmed) {
    throw new Error('Missing image file.');
  }
  if (trimmed.startsWith('file://')) {
    return trimmed;
  }
  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('This device cannot prepare the image for upload.');
  }
  const dest = `${baseDir}live_podcast_cover_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: trimmed, to: dest });
  return dest;
}

const LIVE_PODCAST_COVER_MAX_EDGE = 1200;
const LIVE_PODCAST_COVER_JPEG_QUALITY = 0.82;
/** Base64 uploads can be slow; must stay under client + function limits. */
const UPLOAD_COVER_TIMEOUT_MS = 300000;
/** Cold starts + LiveKit / notifications can exceed the default ~70s client deadline. */
const LIVE_PODCAST_FN_TIMEOUT_MS = 120000;

export async function uploadLivePodcastCoverFromUri(uri: string, _contentType?: string | null) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('You must be logged in to upload a podcast cover.');
  }
  const fileUri = await ensureReadableFileUri(uri);
  const optimized = await ImageManipulator.manipulateAsync(
    fileUri,
    [{ resize: { width: LIVE_PODCAST_COVER_MAX_EDGE } }],
    { compress: LIVE_PODCAST_COVER_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64Data = await FileSystem.readAsStringAsync(optimized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64Data?.length) {
    throw new Error('Could not read the selected image.');
  }

  const mime = 'image/jpeg';
  const storageBucket = getApp().options.storageBucket || '(unknown)';
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[livePodcastCover] client → callable upload', {
      storageBucket,
      base64Chars: base64Data.length,
      approxKb: Math.round((base64Data.length * 3) / 4 / 1024),
    });
  }

  const fn = httpsCallable(functions, 'uploadLivePodcastCover', { timeout: UPLOAD_COVER_TIMEOUT_MS });
  const { data } = await fn({ base64: base64Data, contentType: mime });
  const path = String((data as { path?: string })?.path || '').trim();
  if (!path) {
    throw new Error('Upload did not return a storage path.');
  }
  const downloadUrl = await getDownloadURL(ref(storage, path));

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[livePodcastCover] client ← done', {
      storageBucket,
      path,
      downloadHost: (() => {
        try {
          return new URL(downloadUrl).host;
        } catch {
          return 'parse-error';
        }
      })(),
    });
  }

  return downloadUrl;
}

export async function startLivePodcastRoom(roomId: string) {
  const fn = httpsCallable(functions, 'startLivePodcastRoom', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  await fn({ roomId });
}

export async function createLivePodcastTranscriptToken(roomId: string) {
  const fn = httpsCallable(functions, 'createLivePodcastTranscriptToken');
  const { data } = await fn({ roomId });
  return data as {
    token: string;
    sampleRate: number;
    speechModel: string;
    formattedFinals: boolean;
  };
}

export async function endLivePodcastRoom(roomId: string) {
  const fn = httpsCallable(functions, 'endLivePodcastRoom', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  const { data } = await fn({ roomId });
  return data as { ok: true; replayStatus: string };
}

export async function joinLivePodcastRoom(roomId: string, inviteCode?: string) {
  const fn = httpsCallable(functions, 'joinLivePodcastRoom', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  const { data } = await fn({ roomId, inviteCode: inviteCode || null });
  return data as LivePodcastSession;
}

/** New token when your role changed (e.g. approved speaker) without counting as a new join. */
export async function refreshLivePodcastJoin(roomId: string, inviteCode?: string) {
  const fn = httpsCallable(functions, 'refreshLivePodcastJoin', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  const { data } = await fn({ roomId, inviteCode: inviteCode || null });
  return data as LivePodcastSession;
}

/** Formats milliseconds as H:MM:SS or M:SS for the live session timer. */
export function formatLiveSessionDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function joinLivePodcastByInviteCode(inviteCode: string) {
  const fn = httpsCallable(functions, 'joinLivePodcastByInviteCode', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  const { data } = await fn({ inviteCode });
  return data as LivePodcastSession;
}

export async function leaveLivePodcastRoom(roomId: string) {
  const fn = httpsCallable(functions, 'leaveLivePodcastRoom');
  await fn({ roomId });
}

export async function createLivePodcastInviteCode(roomId: string, role: 'co_host' | 'speaker_guest' = 'co_host') {
  const fn = httpsCallable(functions, 'createLivePodcastInviteCode');
  const { data } = await fn({ roomId, role });
  return data as { code: string; role: string; expiresInMinutes: number };
}

export async function requestLivePodcastSpeaker(roomId: string, note?: string) {
  const fn = httpsCallable(functions, 'requestLivePodcastSpeaker');
  await fn({ roomId, note: note || '' });
}

export async function resolveLivePodcastSpeakerRequest(requestId: string, approve: boolean) {
  const fn = httpsCallable(functions, 'resolveLivePodcastSpeakerRequest');
  await fn({ requestId, approve });
}

export async function moderateLivePodcastParticipant(
  roomId: string,
  targetUid: string,
  action: 'kick' | 'remove_from_stage' | 'mute' | 'unmute'
) {
  const fn = httpsCallable(functions, 'moderateLivePodcastParticipant', { timeout: LIVE_PODCAST_FN_TIMEOUT_MS });
  await fn({ roomId, targetUid, action });
}

export async function setLivePodcastReminder(roomId: string) {
  const fn = httpsCallable(functions, 'setLivePodcastReminder');
  await fn({ roomId });
}

export async function getCurrentUserLivePodcastFreeStatus(): Promise<{ premium: boolean; firstFreeUsed: boolean }> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { premium: false, firstFreeUsed: false };
  const userSnap = await getDoc(doc(db, 'users', uid));
  const data = userSnap.data() || {};
  return {
    premium: !!data.is_premium,
    firstFreeUsed: !!data.first_live_podcast_used_at,
  };
}
