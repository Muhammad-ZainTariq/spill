import { auth, db, functions, getDownloadURL, ref, storage } from '@/lib/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
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

export const listAllSlotsForTherapist = async (therapistUid: string, max: number = 100): Promise<TherapistSlot[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'therapist_slots'), where('therapist_uid', '==', therapistUid), limit(200));
  const snap = await getDocs(q);
  const now = Date.now();
  const seen = new Set<string>();
  const list: TherapistSlot[] = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => !['cancelled'].includes(String(s.status || '')))
    .filter((s) => {
      const t = Date.parse(String(s.start_at || ''));
      return Number.isFinite(t) && t >= now;
    })
    .filter((s) => {
      const key = String(s.start_at || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    .slice(0, max);
  return list;
};

export const listOpenSlotsForTherapist = async (therapistUid: string, max: number = 25): Promise<TherapistSlot[]> => {
  if (!auth.currentUser) return [];
  // Keep query simple (avoid composite indexes); filter/sort in JS.
  const q = query(collection(db, 'therapist_slots'), where('therapist_uid', '==', therapistUid), limit(200));
  const snap = await getDocs(q);
  const now = Date.now();
  const seen = new Set<string>();
  const list: TherapistSlot[] = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => String(s.status) === 'open')
    .filter((s) => {
      const t = Date.parse(String(s.start_at || ''));
      return Number.isFinite(t) && t >= now;
    })
    .filter((s) => {
      const key = String(s.start_at || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
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

export const cancelTherapistSlot = async (slotId: string): Promise<{ ok: boolean; error?: string }> => {
  const u = auth.currentUser;
  if (!u) return { ok: false, error: 'Not logged in.' };
  try {
    const slotRef = doc(db, 'therapist_slots', slotId);
    const snap = await getDoc(slotRef);
    if (!snap.exists()) return { ok: false, error: 'Slot not found.' };
    const data = snap.data() as any;
    if (String(data?.therapist_uid || '') !== u.uid) return { ok: false, error: 'Not your slot.' };
    if (String(data?.status || '') !== 'open') return { ok: false, error: 'Can only cancel open slots.' };
    await updateDoc(slotRef, { status: 'cancelled' });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not cancel slot.' };
  }
};

export const cancelTherapistSession = async (sessionId: string): Promise<{ ok: boolean; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<{ sessionId: string }, { ok: boolean; error?: string }>(
      functions,
      'cancelTherapistSession'
    );
    const res = await fn({ sessionId });
    return res.data || { ok: false, error: 'Cancel failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Cancel failed.' };
  }
};

export const rescheduleTherapistSession = async (
  sessionId: string,
  newSlotId: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!auth.currentUser) return { ok: false, error: 'Not logged in.' };
  try {
    const fn = httpsCallable<{ sessionId: string; newSlotId: string }, { ok: boolean; error?: string }>(
      functions,
      'rescheduleTherapistSession'
    );
    const res = await fn({ sessionId, newSlotId });
    return res.data || { ok: false, error: 'Reschedule failed.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Reschedule failed.' };
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

export const RESOURCE_TYPES = ['video', 'book', 'article'] as const;

/** Display labels for therapist library categories (clinical / modality topics). Alphabetically sorted IDs. */
export const RESOURCE_CATEGORY_LABELS: Record<string, string> = {
  anxiety_disorders: 'Anxiety disorders',
  behavior_therapy: 'Behavior therapy',
  borderline_syndromes: 'Borderline syndromes',
  brief_therapy: 'Brief therapy',
  child_therapy: 'Child therapy',
  couple_therapy: 'Couple therapy',
  crisis: 'Crisis',
  depression: 'Depression',
  eating_disorders: 'Eating disorders',
  family_therapy: 'Family therapy',
  group_therapy: 'Group therapy',
  legal_ethics: 'Legal / ethics',
  mood_disorders: 'Mood disorders',
  object_relations: 'Object relations',
  psychiatry: 'Psychiatry',
  psychoanalysis: 'Psychoanalysis',
  psychosomatic: 'Psychosomatic',
  psychotherapy: 'Psychotherapy',
  psychotherapy_fiction: 'Psychotherapy & fiction',
  research: 'Research',
  schizophrenia: 'Schizophrenia',
  self_care: 'Self-care',
  sex_therapy: 'Sex therapy',
  substance_abuse: 'Substance abuse',
  suicide: 'Suicide',
  supervision: 'Supervision',
};

/** Sorted by label A–Z for chip UIs */
export const RESOURCE_CATEGORIES: string[] = Object.entries(RESOURCE_CATEGORY_LABELS)
  .sort(([, a], [, b]) => a.localeCompare(b))
  .map(([id]) => id);

const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  'self-care': 'Self-care',
  research: 'Research',
  legal: 'Legal / Ethics',
};

/** Map old Firestore category values to current IDs (for forms / migrations on save). */
const LEGACY_CATEGORY_IDS: Record<string, string> = {
  clinical: 'psychotherapy',
  'self-care': 'self_care',
  research: 'research',
  legal: 'legal_ethics',
};

export function getResourceCategoryLabel(category: string | null | undefined): string {
  if (!category) return '—';
  if (RESOURCE_CATEGORY_LABELS[category]) return RESOURCE_CATEGORY_LABELS[category];
  if (LEGACY_CATEGORY_LABELS[category]) return LEGACY_CATEGORY_LABELS[category];
  return category.replace(/_/g, ' ');
}

/** Coerce stored category to a canonical id (legacy docs → new ids; unknown ids pass through). */
export function normalizeResourceCategoryId(category: string | null | undefined): string {
  const raw = String(category || '').trim();
  if (!raw) return 'psychotherapy';
  if (RESOURCE_CATEGORY_LABELS[raw]) return raw;
  if (LEGACY_CATEGORY_IDS[raw]) return LEGACY_CATEGORY_IDS[raw];
  return raw;
}

/** Id safe to use in category pickers (falls back if stored value is unknown). */
export function resolvePickerCategoryId(category: string | null | undefined): string {
  const id = normalizeResourceCategoryId(category);
  return RESOURCE_CATEGORIES.includes(id) ? id : 'psychotherapy';
}

export type TherapistResource = {
  id: string;
  title: string;
  description?: string | null;
  /** YouTube URL for videos; external link for articles (optional) */
  url?: string | null;
  /** Storage download URL for uploaded PDFs (books/articles) */
  file_url?: string | null;
  /** Cover image URL (usually first page of PDF, generated on upload; optional manual override in admin). */
  cover_url?: string | null;
  /** Extracted from YouTube URL for thumbnail */
  youtube_id?: string | null;
  type: (typeof RESOURCE_TYPES)[number];
  /** Category id (see RESOURCE_CATEGORY_LABELS); legacy values still readable via getResourceCategoryLabel */
  category: string;
  author?: string | null;
  /** @deprecated No longer set in app; list order is by date */
  order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Extract YouTube video ID from URL */
export function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const m1 = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m1) return m1[1];
  return null;
}

/** YouTube thumbnail URL (maxresdefault or hqdefault fallback) */
export function youtubeThumbnailUrl(videoId: string, highRes = true): string {
  return highRes
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export type TherapistResourcePdfUploadResult = {
  fileUrl: string;
};

export const uploadTherapistResourcePdf = async (
  base64: string,
  fileName: string,
  contentType = 'application/pdf',
  /** Storage folder; must match Firestore `type` for books vs articles. */
  resourceType: 'book' | 'article' = 'book'
): Promise<TherapistResourcePdfUploadResult> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const fn = httpsCallable<
    { base64: string; contentType: string; fileName: string; resourceType: 'book' | 'article' },
    { path: string }
  >(functions, 'uploadTherapistResourceFile');
  const { data } = await fn({ base64, contentType, fileName, resourceType });
  const path = String((data as any)?.path || '').trim();
  if (!path) throw new Error('Upload failed.');
  const fileUrl = await getDownloadURL(ref(storage, path));
  return { fileUrl };
};

/** Upload PNG (raw base64, no data: prefix) from client-rendered PDF first page. Admin-only callable. */
export const uploadTherapistResourceCoverPng = async (
  pngBase64: string,
  resourceType: 'book' | 'article'
): Promise<string> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const fn = httpsCallable<
    { base64: string; resourceType: 'book' | 'article' },
    { path: string }
  >(functions, 'uploadTherapistResourceCover');
  const { data } = await fn({ base64: pngBase64, resourceType });
  const path = String((data as any)?.path || '').trim();
  if (!path) throw new Error('Cover upload failed.');
  return getDownloadURL(ref(storage, path));
};

export const listTherapistResources = async (max: number = 100): Promise<TherapistResource[]> => {
  if (!auth.currentUser) return [];
  const q = query(
    collection(db, 'therapist_resources'),
    orderBy('created_at', 'desc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TherapistResource[];
};

export const createTherapistResource = async (
  data: Omit<TherapistResource, 'id' | 'created_at' | 'updated_at'>
): Promise<string> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'therapist_resources'), {
    ...data,
    created_at: now,
    updated_at: now,
  });
  return ref.id;
};

export const updateTherapistResource = async (
  id: string,
  patch: Partial<Omit<TherapistResource, 'id' | 'created_at'>>
): Promise<void> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'therapist_resources', id), { ...patch, updated_at: now });
};

export const deleteTherapistResource = async (id: string): Promise<void> => {
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in.');
  await deleteDoc(doc(db, 'therapist_resources', id));
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

