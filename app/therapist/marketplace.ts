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
  status: 'open' | 'booked' | 'cancelled' | string;
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

export const bookTherapistSlot = async (slotId: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<{ slotId: string }, { ok: boolean; sessionId?: string; error?: string }>(
      functions,
      'bookTherapistSlot'
    );
    const res = await fn({ slotId });
    return res.data || { ok: false, error: 'Booking failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Booking failed.' };
  }
};

