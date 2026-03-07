import { auth, db, functions } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export type TherapistProfile = {
  id: string;
  verified?: boolean;
  display_name?: string | null;
  specialization?: string | null;
  languages?: string[] | null;
  bio?: string | null;
  // Auto-generated from reviews (updated every ~10 reviews)
  ai_persona_summary?: string | null;
  review_count?: number | null;
  avg_rating?: number | null;
  timezone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TherapistSlot = {
  id: string;
  therapist_uid: string;
  start_at: string; // ISO
  end_at: string; // ISO
  duration_min: number;
  status: 'open' | 'requested' | 'booked' | 'cancelled' | string;
  booked_by_uid?: string | null;
  created_at?: string | null;
};

export type TherapistSession = {
  id: string;
  therapist_uid: string;
  user_uid: string;
  slot_id: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled' | string;
  starts_at: string;
  ends_at: string;
  created_at?: string | null;
  duration_min?: number;
};

export type UserLite = {
  id: string;
  display_name?: string | null;
  anonymous_username?: string | null;
  avatar_url?: string | null;
};

export type TherapistReview = {
  id: string;
  therapist_uid: string;
  session_id: string;
  reviewer_uid: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

export type TherapistBookingRequest = {
  id: string;
  therapist_uid: string;
  requester_uid: string;
  slot_id: string;
  start_at: string;
  end_at: string;
  requested_duration_min: number;
  status: 'requested' | 'approved' | 'rejected' | string;
  created_at: string;
  session_id?: string | null;
};

export const getTherapistProfile = async (therapistId: string): Promise<TherapistProfile | null> => {
  if (!auth.currentUser) return null;
  const snap = await getDoc(doc(db, 'therapist_profiles', therapistId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
};

export const listTherapistProfiles = async (max: number = 50): Promise<TherapistProfile[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'therapist_profiles'), where('verified', '==', true), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
};

export const upsertMyTherapistProfile = async (patch: Omit<TherapistProfile, 'id'>): Promise<void> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'therapist_profiles', u.uid),
    {
      ...patch,
      updated_at: now,
    },
    { merge: true }
  );
};

export const createTherapistSlot = async (durationMin: number, startAtIso: string): Promise<string> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid start time.');
  const end = new Date(start.getTime() + Math.max(15, durationMin) * 60 * 1000);
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'therapist_slots'), {
    therapist_uid: u.uid,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    duration_min: durationMin,
    status: 'open',
    booked_by_uid: null,
    created_at: now,
  });
  return ref.id;
};

export const listOpenSlotsForTherapist = async (therapistUid: string, max: number = 25): Promise<TherapistSlot[]> => {
  if (!auth.currentUser) return [];
  // Keep query simple (avoid composite indexes); filter/sort in JS.
  const q = query(collection(db, 'therapist_slots'), where('therapist_uid', '==', therapistUid), limit(200));
  const snap = await getDocs(q);
  const now = Date.now();
  const list: TherapistSlot[] = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => String(s.status) === 'open')
    .filter((s) => {
      const t = Date.parse(String(s.start_at || ''));
      return Number.isFinite(t) && t >= now;
    })
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    .slice(0, max);
  return list;
};

export const bookTherapistSlot = async (
  slotId: string,
  requestedDurationMin: 30 | 60
): Promise<{ ok: boolean; requestId?: string; status?: string; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<
      { slotId: string; requestedDurationMin: number },
      { ok: boolean; requestId?: string; status?: string; error?: string }
    >(
      functions,
      'bookTherapistSlot'
    );
    const res = await fn({ slotId, requestedDurationMin });
    return res.data || { ok: false, error: 'Booking failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Booking failed.' };
  }
};

export const listBookingRequestsForTherapist = async (
  therapistUid: string,
  max: number = 50
): Promise<TherapistBookingRequest[]> => {
  if (!auth.currentUser) return [];
  const tid = String(therapistUid || '').trim();
  if (!tid) return [];
  const q = query(collection(db, 'therapist_booking_requests'), where('therapist_uid', '==', tid), limit(200));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TherapistBookingRequest[];
  return list
    .filter((r) => String(r.status || '') === 'requested')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, max);
};

export const approveTherapistBookingRequest = async (
  requestId: string
): Promise<{ ok: boolean; sessionId?: string; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<{ requestId: string }, { ok: boolean; sessionId?: string; error?: string }>(
      functions,
      'approveTherapistBookingRequest'
    );
    const res = await fn({ requestId });
    return res.data || { ok: false, error: 'Approve failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Approve failed.' };
  }
};

export const rejectTherapistBookingRequest = async (requestId: string): Promise<{ ok: boolean; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<{ requestId: string }, { ok: boolean; error?: string }>(
      functions,
      'rejectTherapistBookingRequest'
    );
    const res = await fn({ requestId });
    return res.data || { ok: false, error: 'Reject failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Reject failed.' };
  }
};

export const listSessionsForTherapist = async (therapistUid: string, max: number = 50): Promise<TherapistSession[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'therapist_sessions'), where('therapist_uid', '==', therapistUid), limit(200));
  const snap = await getDocs(q);
  const list: TherapistSession[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return list
    .filter((s) => String(s.status) !== 'cancelled')
    .sort((a, b) => Date.parse(String(a.starts_at || '')) - Date.parse(String(b.starts_at || '')))
    .slice(0, max);
};

export const getUserLite = async (uid: string): Promise<UserLite | null> => {
  if (!auth.currentUser) return null;
  const id = String(uid || '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return { id };
  const data = snap.data() as any;
  return {
    id,
    display_name: data?.display_name ?? null,
    anonymous_username: data?.anonymous_username ?? null,
    avatar_url: data?.avatar_url ?? null,
  };
};

export const submitTherapistSessionReview = async (
  sessionId: string,
  rating: number,
  comment: string
): Promise<{ ok: boolean; error?: string }> => {
  const u = auth.currentUser;
  if (!u) return { ok: false, error: 'Not logged in.' };
  const sid = String(sessionId || '').trim();
  if (!sid) return { ok: false, error: 'Missing session.' };
  const r = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
  const now = new Date().toISOString();
  try {
    // Create-only: rules will deny updates if it already exists.
    await setDoc(doc(db, 'therapist_sessions', sid, 'reviews', u.uid), {
      rating: r,
      comment: String(comment || '').trim().slice(0, 800) || null,
      reviewer_uid: u.uid,
      created_at: now,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not submit review.' };
  }
};

export const listReviewsForTherapist = async (therapistUid: string, max: number = 30): Promise<TherapistReview[]> => {
  if (!auth.currentUser) return [];
  const tid = String(therapistUid || '').trim();
  if (!tid) return [];
  // Keep query simple; show most recent first
  const q = query(collection(db, 'therapist_reviews'), where('therapist_uid', '==', tid), limit(200));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TherapistReview[];
  return list
    .filter((r) => String(r.therapist_uid || '') === tid)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, max);
};

