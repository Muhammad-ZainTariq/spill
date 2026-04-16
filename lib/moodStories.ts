/**
 * Daily story / mood check-ins — Firestore under users/{uid}/story_checkins
 * (owned by path; no composite index for user_uid + created_at).
 */
import { auth, db } from '@/lib/firebase';
import { addDoc, collection, getDocs, limit, orderBy, query } from 'firebase/firestore';

export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number;
  note?: string | null;
  created_at: string;
}

function storyCollectionRef(uid: string) {
  return collection(db, 'users', uid, 'story_checkins');
}

export async function logMood(moodValue: number, note?: string): Promise<MoodEntry | null> {
  const u = auth.currentUser;
  if (!u) {
    console.error('logMood: not signed in');
    return null;
  }
  if (moodValue < 1 || moodValue > 5) return null;

  const now = new Date().toISOString();
  try {
    const ref = await addDoc(storyCollectionRef(u.uid), {
      mood_value: moodValue,
      note: (note && note.trim()) || null,
      created_at: now,
    });
    return {
      id: ref.id,
      user_id: u.uid,
      mood_value: moodValue,
      note: note?.trim() || null,
      created_at: now,
    };
  } catch (e) {
    console.error('logMood Firestore error:', e);
    return null;
  }
}

export async function getMoodEntries(days: number = 30): Promise<MoodEntry[]> {
  const u = auth.currentUser;
  if (!u) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    const q = query(storyCollectionRef(u.uid), orderBy('created_at', 'desc'), limit(400));
    const snap = await getDocs(q);
    const list: MoodEntry[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          user_id: u.uid,
          mood_value: Number(data.mood_value) || 3,
          note: data.note ?? null,
          created_at: String(data.created_at || ''),
        };
      })
      .filter((e) => {
        const t = Date.parse(e.created_at);
        return Number.isFinite(t) && t >= cutoff.getTime();
      });
    list.reverse();
    return list;
  } catch (e) {
    console.error('getMoodEntries Firestore error:', e);
    return [];
  }
}

export async function getAverageMood(days: number = 7): Promise<number | null> {
  const entries = await getMoodEntries(days);
  if (entries.length === 0) return null;
  const sum = entries.reduce((acc, e) => acc + e.mood_value, 0);
  return sum / entries.length;
}
