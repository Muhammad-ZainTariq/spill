import { functions, db, auth } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where,
} from 'firebase/firestore';

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
    const rooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as LivePodcastRoom[];
    cb(rooms);
  });
}

export async function getLivePodcastRoom(roomId: string): Promise<LivePodcastRoom | null> {
  const snap = await getDoc(doc(db, 'live_podcast_rooms', roomId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as LivePodcastRoom) : null;
}

export function subscribeLivePodcastRoom(roomId: string, cb: (room: LivePodcastRoom | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'live_podcast_rooms', roomId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as LivePodcastRoom) : null);
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
  const fn = httpsCallable(functions, 'createLivePodcastRoom');
  const { data } = await fn(input as any);
  return data as { room: LivePodcastRoom };
}

export async function startLivePodcastRoom(roomId: string) {
  const fn = httpsCallable(functions, 'startLivePodcastRoom');
  await fn({ roomId });
}

export async function endLivePodcastRoom(roomId: string) {
  const fn = httpsCallable(functions, 'endLivePodcastRoom');
  const { data } = await fn({ roomId });
  return data as { ok: true; replayStatus: string };
}

export async function joinLivePodcastRoom(roomId: string, inviteCode?: string) {
  const fn = httpsCallable(functions, 'joinLivePodcastRoom');
  const { data } = await fn({ roomId, inviteCode: inviteCode || null });
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
