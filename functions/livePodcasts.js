const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { randomBytes } = require('crypto');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const { TrackSource } = require('@livekit/protocol');

const db = admin.firestore();

const COLLECTIONS = {
  rooms: 'live_podcast_rooms',
  invites: 'live_podcast_invite_codes',
  speakerRequests: 'live_podcast_speaker_requests',
  reminders: 'live_podcast_reminders',
  auditLogs: 'live_podcast_audit_logs',
};

/** Must match client `storageBucket` (e.g. *.firebasestorage.app). `admin.storage().bucket()` defaults to *.appspot.com and will not write to this bucket. */
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'spillll.firebasestorage.app';

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

async function getUserDoc(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() || {} : {};
}

async function isTherapistOrAdmin(uid) {
  const [userSnap, therapistSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('therapist_profiles').doc(uid).get(),
  ]);
  const user = userSnap.exists ? userSnap.data() || {} : {};
  return !!user.is_admin || therapistSnap.exists;
}

function getLiveKitConfig() {
  const livekitCfg = functions.config().livekit || {};
  const apiKey = process.env.LIVEKIT_API_KEY || livekitCfg.api_key || '';
  const apiSecret = process.env.LIVEKIT_API_SECRET || livekitCfg.api_secret || '';
  const serverUrl = process.env.LIVEKIT_URL || livekitCfg.url || '';
  if (!apiKey || !apiSecret || !serverUrl) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.'
    );
  }
  return { apiKey, apiSecret, serverUrl };
}

function livekitHttpBaseUrl(serverUrl) {
  const s = String(serverUrl || '').trim();
  if (s.startsWith('wss://')) return `https://${s.slice(6)}`;
  if (s.startsWith('ws://')) return `http://${s.slice(5)}`;
  return s;
}

function getRoomServiceClient() {
  const { apiKey, apiSecret, serverUrl } = getLiveKitConfig();
  return new RoomServiceClient(livekitHttpBaseUrl(serverUrl), apiKey, apiSecret);
}

/** Pick published mic/audio track for RoomService mute (handles protobuf JSON shapes). */
function pickAudioTrackForModeration(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const bySource = tracks.find((t) => {
    const s = t?.source;
    return s === 2 || s === 'MICROPHONE' || (typeof s === 'string' && s.toUpperCase().includes('MICROPHONE'));
  });
  if (bySource?.sid) return bySource;
  const byType = tracks.find((t) => {
    const ty = t?.type;
    return ty === 0 || ty === 'AUDIO' || Number(ty) === 0;
  });
  return byType?.sid ? byType : null;
}

function getAssemblyAiConfig() {
  const assemblyAiCfg = functions.config().assemblyai || {};
  const apiKey = process.env.ASSEMBLYAI_API_KEY || assemblyAiCfg.api_key || '';
  if (!apiKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY or functions config assemblyai.api_key.'
    );
  }
  return { apiKey };
}

async function sendPushToUser(recipientId, title, body, payload) {
  const userSnap = await db.collection('users').doc(String(recipientId || '').trim()).get();
  if (!userSnap.exists) return { ok: false, error: 'user-not-found' };
  const expoPushToken = userSnap.data()?.expo_push_token;
  const isExpoToken =
    typeof expoPushToken === 'string' &&
    (expoPushToken.startsWith('ExponentPushToken[') || expoPushToken.startsWith('ExpoPushToken['));
  if (!isExpoToken) {
    return { ok: false, error: 'missing-push-token' };
  }
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: expoPushToken,
        title: String(title || '').slice(0, 100),
        body: String(body || '').slice(0, 200),
        data: payload || {},
        sound: 'default',
        channelId: 'default',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('live podcast push failed', { recipientId, status: res.status, text });
      return { ok: false, error: text || 'push-http-failed' };
    }
    return { ok: true };
  } catch (error) {
    console.error('live podcast push failed', { recipientId, error });
    return { ok: false, error: error?.message || 'push-failed' };
  }
}

async function notifyPodcastStarted(roomId, room) {
  const reminderSnap = await db.collection(COLLECTIONS.reminders).where('room_id', '==', roomId).get();
  const recipientIds = [...new Set(reminderSnap.docs.map((d) => String(d.data()?.user_uid || '').trim()).filter(Boolean))];
  if (!recipientIds.length) return;

  const title = `${room.host_name || 'Therapist'} is live now`;
  const body = `${room.title || 'Podcast space'} has started. Tap to join and listen live.`;

  await Promise.all(
    recipientIds.map(async (recipientId) => {
      try {
        await db.collection('notifications').add({
          recipient_id: recipientId,
          from_user_id: room.host_uid,
          title,
          body,
          type: 'live_podcast_started',
          room_id: roomId,
          cover_url: room.cover_url || null,
          host_name: room.host_name || 'Therapist',
          read: false,
          created_at: nowIso(),
        });
        await sendPushToUser(recipientId, title, body, {
          type: 'live_podcast_started',
          room_id: roomId,
          cover_url: room.cover_url || '',
        });
      } catch (error) {
        console.error('Failed to notify podcast reminder subscriber', { recipientId, roomId, error });
      }
    })
  );
}

async function notifyPodcastScheduledSoon(roomId, room) {
  const reminderSnap = await db.collection(COLLECTIONS.reminders).where('room_id', '==', roomId).get();
  const recipientIds = [...new Set(reminderSnap.docs.map((d) => String(d.data()?.user_uid || '').trim()).filter(Boolean))];
  if (!recipientIds.length) return;

  let startLabel = 'soon';
  try {
    if (room.scheduled_for) {
      const d = new Date(String(room.scheduled_for));
      if (!Number.isNaN(d.getTime())) {
        startLabel = d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      }
    }
  } catch (_) {
    /* ignore */
  }

  const title = `Starting soon · ${room.title || 'Podcast space'}`;
  const body = `${room.host_name || 'Therapist'} is scheduled to go live around ${startLabel}. Open the app when you are ready.`;

  await Promise.all(
    recipientIds.map(async (recipientId) => {
      try {
        await db.collection('notifications').add({
          recipient_id: recipientId,
          from_user_id: room.host_uid,
          title,
          body,
          type: 'live_podcast_soon',
          room_id: roomId,
          cover_url: room.cover_url || null,
          host_name: room.host_name || 'Therapist',
          read: false,
          created_at: nowIso(),
        });
        await sendPushToUser(recipientId, title, body, {
          type: 'live_podcast_soon',
          room_id: roomId,
          cover_url: room.cover_url || '',
        });
      } catch (error) {
        console.error('Failed to send scheduled podcast reminder', { recipientId, roomId, error });
      }
    })
  );
}

function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

/** Create a row in live_podcast_invite_codes (shared by createRoom + manual host action). */
async function createInviteRecord({ roomId, hostUid, role, expiresInMinutes, maxUses }) {
  const rid = String(roomId || '').trim();
  const uid = String(hostUid || '').trim();
  const r = String(role || 'co_host').trim();
  const expM = Math.max(10, Math.min(24 * 60, Number(expiresInMinutes || 120)));
  const maxU = Math.max(1, Math.min(25, Number(maxUses || 1)));
  const inviteRef = db.collection(COLLECTIONS.invites).doc();
  const code = generateInviteCode();
  await inviteRef.set({
    room_id: rid,
    code,
    role: r,
    created_by_uid: uid,
    is_active: true,
    max_uses: maxU,
    uses_count: 0,
    expires_at: new Date(Date.now() + expM * 60 * 1000).toISOString(),
    created_at: nowIso(),
  });
  return { code, role: r, expiresInMinutes: expM, maxUses: maxU };
}

function sanitizeRoom(data, id) {
  return {
    id,
    title: String(data.title || 'Untitled room'),
    description: String(data.description || ''),
    topic: String(data.topic || ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    cover_url: data.cover_url || null,
    host_uid: String(data.host_uid || ''),
    host_name: String(data.host_name || 'Therapist'),
    status: String(data.status || 'scheduled'),
    visibility: String(data.visibility || 'public'),
    scheduled_for: data.scheduled_for || null,
    reminder_fire_at: data.reminder_fire_at || null,
    scheduled_reminder_sent: !!data.scheduled_reminder_sent,
    started_at: data.started_at || null,
    ended_at: data.ended_at || null,
    record_mode: String(data.record_mode || 'draft'),
    replay_status: String(data.replay_status || 'none'),
    allow_raise_hand: data.allow_raise_hand !== false,
    allow_listener_speaking: data.allow_listener_speaking === true,
    livekit_room_name: String(data.livekit_room_name || `podcast-${id}`),
    co_host_ids: Array.isArray(data.co_host_ids) ? data.co_host_ids : [],
    approved_speaker_uids: Array.isArray(data.approved_speaker_uids) ? data.approved_speaker_uids : [],
    listener_count_current: Number(data.listener_count_current || 0),
    listener_count_peak: Number(data.listener_count_peak || 0),
    total_join_count: Number(data.total_join_count || 0),
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
}

function resolveRole({ room, uid, inviteDoc }) {
  if (uid === room.host_uid) return 'host';
  // When joining with an invite code, honor that role first (e.g. co-host) over stale
  // approved_speaker_uids so the client gets a publishing token for mic + captions.
  if (inviteDoc) {
    const role = String(inviteDoc.role || '').trim();
    if (role === 'co_host') return 'co_host';
    if (role === 'speaker_guest') return 'speaker';
  }
  if (Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid)) return 'co_host';
  if (Array.isArray(room.approved_speaker_uids) && room.approved_speaker_uids.includes(uid)) return 'speaker';
  return 'listener';
}

async function hasApprovedSpeakerRequest(roomId, uid) {
  const snap = await db
    .collection(COLLECTIONS.speakerRequests)
    .where('room_id', '==', String(roomId || ''))
    .where('user_uid', '==', String(uid || ''))
    .where('status', '==', 'approved')
    .limit(1)
    .get();
  return !snap.empty;
}

async function getInviteDocByRoomAndCode(roomId, inviteCode) {
  const inviteSnap = await db.collection(COLLECTIONS.invites).where('room_id', '==', roomId).where('code', '==', inviteCode).limit(1).get();
  const invite = inviteSnap.docs[0];
  if (!invite) throw new functions.https.HttpsError('not-found', 'Invite code not found.');
  const data = invite.data() || {};
  if (!data.is_active) throw new functions.https.HttpsError('failed-precondition', 'Invite code is inactive.');
  if (Number(data.uses_count || 0) >= Number(data.max_uses || 1)) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite code has already been used.');
  }
  if (typeof data.expires_at === 'string' && Date.parse(data.expires_at) < Date.now()) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite code expired.');
  }
  return { id: invite.id, ...data };
}

async function createJoinSession({ uid, roomId, room, roomRef, inviteDoc }) {
  let role = resolveRole({ room, uid, inviteDoc });
  if (role === 'listener' && (await hasApprovedSpeakerRequest(roomId, uid))) {
    role = 'speaker';
  }
  if (role === 'co_host') {
    await roomRef.update({
      co_host_ids: admin.firestore.FieldValue.arrayUnion(uid),
      updated_at: nowIso(),
    });
    room.co_host_ids = Array.from(new Set([...(room.co_host_ids || []), uid]));
  } else if (role === 'speaker') {
    await roomRef.update({
      approved_speaker_uids: admin.firestore.FieldValue.arrayUnion(uid),
      updated_at: nowIso(),
    });
    room.approved_speaker_uids = Array.from(new Set([...(room.approved_speaker_uids || []), uid]));
  }
  const isPrivileged = role === 'host' || role === 'co_host' || role === 'speaker';
  if (room.status !== 'live' && !isPrivileged) {
    throw new functions.https.HttpsError('failed-precondition', 'Room is not live yet.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const premium = !!user.is_premium;
  const freeAlreadyUsed = !!user.first_live_podcast_used_at;

  if (!isPrivileged && !premium && freeAlreadyUsed) {
    throw new functions.https.HttpsError('failed-precondition', 'premium-required-for-live-podcast');
  }

  const token = await createAccessToken({
    uid,
    displayName: String(user.display_name || user.anonymous_username || 'Listener'),
    roomName: room.livekit_room_name,
    role,
  });

  await roomRef.update({
    listener_count_current: admin.firestore.FieldValue.increment(1),
    total_join_count: admin.firestore.FieldValue.increment(1),
    updated_at: nowIso(),
  });

  if (!isPrivileged && !premium && !freeAlreadyUsed) {
    await userRef.set({ first_live_podcast_used_at: nowIso() }, { merge: true });
  }

  if (inviteDoc) {
    await db.collection(COLLECTIONS.invites).doc(inviteDoc.id).update({
      uses_count: admin.firestore.FieldValue.increment(1),
    });
  }

  await logAudit(roomId, uid, 'room_joined', null, { role });
  const { serverUrl } = getLiveKitConfig();
  return {
    room,
    role,
    token,
    serverUrl,
    usedFreeAccess: !isPrivileged && !premium && !freeAlreadyUsed,
    premiumUnlocked: premium,
  };
}

async function createAccessToken({ uid, displayName, roomName, role }) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: uid,
    name: displayName || 'Listener',
    ttl: '4h',
    metadata: JSON.stringify({ role }),
  });
  const grant = {
    roomJoin: true,
    room: roomName,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: role === 'host' || role === 'co_host',
  };
  if (role === 'listener') {
    grant.canPublish = false;
  } else {
    grant.canPublish = true;
    /** Explicit mic-only publish (some LiveKit configs treat this more reliably than canPublish alone). */
    grant.canPublishSources = [TrackSource.MICROPHONE];
  }
  at.addGrant(grant);
  return at.toJwt();
}

async function logAudit(roomId, actorUid, action, targetUid = null, metadata = {}) {
  await db.collection(COLLECTIONS.auditLogs).add({
    room_id: roomId,
    actor_uid: actorUid,
    target_uid: targetUid,
    action,
    metadata,
    created_at: nowIso(),
  });
}

/** Client Storage uploads hit React Native Blob limits; write cover bytes on the server instead. */
exports.uploadLivePodcastCover = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }
  const uid = context.auth.uid;
  const canHost = await isTherapistOrAdmin(uid);
  if (!canHost) {
    throw new functions.https.HttpsError('permission-denied', 'Only therapists can upload podcast covers.');
  }

  console.info('[uploadLivePodcastCover] invoked', {
    bucket: STORAGE_BUCKET,
    uid,
  });

  let b64 = String(data?.base64 || '')
    .trim()
    .replace(/\s/g, '');
  const dataUrl = /^data:image\/\w+;base64,(.+)$/i.exec(b64);
  if (dataUrl) {
    b64 = dataUrl[1];
  }
  if (!b64) {
    throw new functions.https.HttpsError('invalid-argument', 'Image data is required.');
  }
  const maxB64Len = 7 * 1024 * 1024;
  if (b64.length > maxB64Len) {
    throw new functions.https.HttpsError('invalid-argument', 'Image is too large. Choose a smaller photo.');
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch (e) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid image data.');
  }
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new functions.https.HttpsError('invalid-argument', 'Image is too large.');
  }

  console.info('[uploadLivePodcastCover] payload ready', {
    bucket: STORAGE_BUCKET,
    uid,
    base64Chars: b64.length,
    decodedBytes: buffer.length,
  });

  let mime = String(data?.contentType || 'image/jpeg').trim().toLowerCase();
  if (!mime.startsWith('image/')) {
    mime = 'image/jpeg';
  }
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const objectPath = `live_podcast_covers/${uid}/${Date.now()}.${ext}`;
  const bucket = admin.storage().bucket(STORAGE_BUCKET);
  const file = bucket.file(objectPath);

  console.info('[uploadLivePodcastCover] writing to Storage', {
    bucket: STORAGE_BUCKET,
    gsUri: `gs://${STORAGE_BUCKET}/${objectPath}`,
    objectPath,
    contentType: mime,
    bytes: buffer.length,
  });

  try {
    await file.save(buffer, {
      resumable: false,
      metadata: { contentType: mime },
    });
  } catch (err) {
    console.error('uploadLivePodcastCover save failed', {
      bucket: STORAGE_BUCKET,
      path: objectPath,
      message: err?.message,
      code: err?.code,
    });
    throw new functions.https.HttpsError(
      'internal',
      err?.message || 'Could not save the cover image. Try again or use a smaller photo.'
    );
  }

  console.info('[uploadLivePodcastCover] save OK', {
    bucket: STORAGE_BUCKET,
    gsUri: `gs://${STORAGE_BUCKET}/${objectPath}`,
    objectPath,
    contentType: mime,
    bytes: buffer.length,
  });

  // Stable HTTPS URL for Firestore + clients without relying on client-side getDownloadURL + Storage rules.
  let downloadUrl = null;
  try {
    await file.makePublic();
    const enc = encodeURIComponent(objectPath);
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${enc}?alt=media`;
  } catch (pubErr) {
    console.warn('[uploadLivePodcastCover] makePublic failed (uniform bucket ACL?); client will use getDownloadURL', pubErr?.message);
  }

  return { path: objectPath, downloadUrl };
  });

exports.createLivePodcastRoom = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }
  const uid = context.auth.uid;
  const canHost = await isTherapistOrAdmin(uid);
  if (!canHost) {
    throw new functions.https.HttpsError('permission-denied', 'Only therapists can create podcast rooms.');
  }

  const user = await getUserDoc(uid);
  const title = String(data?.title || '').trim();
  if (!title) {
    throw new functions.https.HttpsError('invalid-argument', 'Room title is required.');
  }

  let scheduledForIso = data?.scheduled_for ? String(data.scheduled_for).trim() : null;
  let reminderFireAt = null;
  if (scheduledForIso) {
    const scheduledAt = Date.parse(scheduledForIso);
    if (Number.isNaN(scheduledAt) || scheduledAt <= Date.now()) {
      throw new functions.https.HttpsError('invalid-argument', 'scheduled_for must be a valid future date and time.');
    }
    const fireAtMs = scheduledAt - 10 * 60 * 1000;
    reminderFireAt = new Date(Math.max(fireAtMs, Date.now())).toISOString();
  }

  const ref = db.collection(COLLECTIONS.rooms).doc();
  const room = {
    title,
    description: String(data?.description || '').trim(),
    topic: String(data?.topic || '').trim(),
    tags: normalizeTags(data?.tags),
    cover_url: typeof data?.cover_url === 'string' ? data.cover_url.trim() || null : null,
    host_uid: uid,
    host_name: String(user.display_name || user.anonymous_username || 'Therapist'),
    status: 'scheduled',
    visibility: 'public',
    scheduled_for: scheduledForIso,
    reminder_fire_at: reminderFireAt,
    scheduled_reminder_sent: false,
    started_at: null,
    ended_at: null,
    record_mode: ['none', 'draft', 'publish'].includes(String(data?.record_mode || ''))
      ? String(data.record_mode)
      : 'draft',
    replay_status: 'none',
    allow_raise_hand: data?.allow_raise_hand !== false,
    allow_listener_speaking: data?.allow_listener_speaking === true,
    livekit_room_name: `podcast-${ref.id}`,
    co_host_ids: [],
    approved_speaker_uids: [],
    listener_count_current: 0,
    listener_count_peak: 0,
    total_join_count: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await ref.set(room);
  if (scheduledForIso) {
    await db
      .collection(COLLECTIONS.reminders)
      .doc(`${ref.id}_${uid}`)
      .set(
        {
          room_id: ref.id,
          user_uid: uid,
          created_at: nowIso(),
          source: 'host_schedule',
        },
        { merge: true }
      );
  }
  await logAudit(ref.id, uid, 'room_created', null, { status: room.status });

  let coHostInvite = null;
  try {
    coHostInvite = await createInviteRecord({
      roomId: ref.id,
      hostUid: uid,
      role: 'co_host',
      expiresInMinutes: 24 * 60,
      maxUses: 5,
    });
    await logAudit(ref.id, uid, 'invite_created', null, { role: 'co_host', source: 'room_create' });
  } catch (err) {
    console.error('createLivePodcastRoom: co-host invite failed', err);
  }

  return { room: sanitizeRoom(room, ref.id), coHostInvite };
});

exports.tickLivePodcastScheduledReminders = functions
  .region('us-central1')
  .pubsub.schedule('every 5 minutes')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    const cutoff = nowIso();
    const snap = await db
      .collection(COLLECTIONS.rooms)
      .where('status', '==', 'scheduled')
      .where('reminder_fire_at', '<=', cutoff)
      .limit(40)
      .get();

    for (const doc of snap.docs) {
      const roomId = doc.id;
      const raw = doc.data() || {};
      if (!raw.reminder_fire_at || raw.scheduled_reminder_sent) continue;
      try {
        await notifyPodcastScheduledSoon(roomId, sanitizeRoom(raw, roomId));
        await doc.ref.update({
          scheduled_reminder_sent: true,
          updated_at: nowIso(),
        });
      } catch (error) {
        console.error('tickLivePodcastScheduledReminders failed', { roomId, error });
      }
    }
    return null;
  });

exports.startLivePodcastRoom = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    const uid = context.auth.uid;
    const roomId = String(data?.roomId || '').trim();
    if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

    const ref = db.collection(COLLECTIONS.rooms).doc(roomId);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
    const room = snap.data() || {};
    if (room.host_uid !== uid) throw new functions.https.HttpsError('permission-denied', 'Only host can start the room.');

    const nextRoom = {
      ...room,
      status: 'live',
      started_at: room.started_at || nowIso(),
      updated_at: nowIso(),
    };
    await ref.update({
      status: 'live',
      started_at: room.started_at || nowIso(),
      updated_at: nowIso(),
    });
    await notifyPodcastStarted(roomId, nextRoom);
    await logAudit(roomId, uid, 'room_started');
    return { ok: true };
  });

exports.createLivePodcastTranscriptToken = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const roomSnap = await db.collection(COLLECTIONS.rooms).doc(roomId).get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = sanitizeRoom(roomSnap.data() || {}, roomId);
  if (room.status !== 'live') {
    throw new functions.https.HttpsError('failed-precondition', 'Room must be live before transcription starts.');
  }
  const canTranscribe =
    uid === room.host_uid ||
    (Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid)) ||
    (Array.isArray(room.approved_speaker_uids) && room.approved_speaker_uids.includes(uid)) ||
    (await hasApprovedSpeakerRequest(roomId, uid));
  if (!canTranscribe) {
    throw new functions.https.HttpsError('permission-denied', 'Only approved speakers can start live captions.');
  }

  const { apiKey } = getAssemblyAiConfig();
  const tokenUrl = new URL('https://streaming.assemblyai.com/v3/token');
  tokenUrl.searchParams.set('expires_in_seconds', '600');
  tokenUrl.searchParams.set('max_session_duration_seconds', '10800');

  let token;
  try {
    const res = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `AssemblyAI token request failed with ${res.status}`);
    }
    const dataJson = await res.json();
    token = String(dataJson?.token || '').trim();
  } catch (error) {
    console.error('Failed to create AssemblyAI transcript token', { roomId, uid, error });
    throw new functions.https.HttpsError('internal', 'Could not start live captions.');
  }

  if (!token) {
    throw new functions.https.HttpsError('internal', 'AssemblyAI did not return a valid transcript token.');
  }

  return {
    token,
    sampleRate: 16000,
    speechModel: 'u3-rt-pro',
    formattedFinals: true,
  };
});

exports.endLivePodcastRoom = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const ref = db.collection(COLLECTIONS.rooms).doc(roomId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = snap.data() || {};
  if (room.host_uid !== uid) throw new functions.https.HttpsError('permission-denied', 'Only host can end the room.');

  const replayStatus =
    room.record_mode === 'publish' ? 'published' : room.record_mode === 'draft' ? 'draft' : 'deleted';
  await ref.update({
    status: 'ended',
    ended_at: nowIso(),
    replay_status: replayStatus,
    listener_count_current: 0,
    updated_at: nowIso(),
  });
  await logAudit(roomId, uid, 'room_ended', null, { replay_status: replayStatus });
  return { ok: true, replayStatus };
});

exports.deleteLivePodcastReplay = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const ref = db.collection(COLLECTIONS.rooms).doc(roomId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = snap.data() || {};
  const user = await getUserDoc(uid);
  if (room.host_uid !== uid && user.is_admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Only the host or an admin can delete this replay.');
  }
  if (room.status !== 'ended') {
    throw new functions.https.HttpsError('failed-precondition', 'Only ended podcast replays can be deleted.');
  }

  await ref.update({
    replay_status: 'deleted',
    replay_deleted_at: nowIso(),
    replay_deleted_by: uid,
    updated_at: nowIso(),
  });
  await logAudit(roomId, uid, 'replay_deleted');
  return { ok: true };
});

exports.createLivePodcastInviteCode = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  const role = String(data?.role || 'co_host').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');
  if (!['co_host', 'speaker_guest'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'role must be co_host or speaker_guest.');
  }

  const roomSnap = await db.collection(COLLECTIONS.rooms).doc(roomId).get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = roomSnap.data() || {};
  if (room.host_uid !== uid) throw new functions.https.HttpsError('permission-denied', 'Only host can create invite codes.');

  const created = await createInviteRecord({
    roomId,
    hostUid: uid,
    role,
    expiresInMinutes: data?.expiresInMinutes,
    maxUses: data?.maxUses,
  });
  await logAudit(roomId, uid, 'invite_created', null, { role: created.role });
  return { code: created.code, role: created.role, expiresInMinutes: created.expiresInMinutes };
});

exports.joinLivePodcastRoom = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  const inviteCode = String(data?.inviteCode || '').trim().toUpperCase();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const roomRef = db.collection(COLLECTIONS.rooms).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = sanitizeRoom(roomSnap.data() || {}, roomId);

  let inviteDoc = null;
  if (inviteCode) {
    inviteDoc = await getInviteDocByRoomAndCode(roomId, inviteCode);
  }
  return createJoinSession({ uid, roomId, room, roomRef, inviteDoc });
});

/**
 * New LiveKit token + role when the user is already in the room but their role changed
 * (e.g. approved to speak). Does not increment listener/join counters or consume free access.
 */
exports.refreshLivePodcastJoin = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  const inviteCode = String(data?.inviteCode || '').trim().toUpperCase();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const roomRef = db.collection(COLLECTIONS.rooms).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = sanitizeRoom(roomSnap.data() || {}, roomId);

  let inviteDoc = null;
  if (inviteCode) {
    inviteDoc = await getInviteDocByRoomAndCode(roomId, inviteCode);
  }

  let role = resolveRole({ room, uid, inviteDoc });
  if (role === 'listener' && (await hasApprovedSpeakerRequest(roomId, uid))) {
    role = 'speaker';
  }
  if (role === 'co_host') {
    await roomRef.update({
      co_host_ids: admin.firestore.FieldValue.arrayUnion(uid),
      updated_at: nowIso(),
    });
    room.co_host_ids = Array.from(new Set([...(room.co_host_ids || []), uid]));
  } else if (role === 'speaker') {
    await roomRef.update({
      approved_speaker_uids: admin.firestore.FieldValue.arrayUnion(uid),
      updated_at: nowIso(),
    });
    room.approved_speaker_uids = Array.from(new Set([...(room.approved_speaker_uids || []), uid]));
  }
  if (role === 'listener') {
    throw new functions.https.HttpsError('failed-precondition', 'listener-role-refresh');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() || {} : {};

  const token = await createAccessToken({
    uid,
    displayName: String(user.display_name || user.anonymous_username || 'Listener'),
    roomName: room.livekit_room_name,
    role,
  });

  await logAudit(roomId, uid, 'room_join_refreshed', null, { role });
  const { serverUrl } = getLiveKitConfig();
  return {
    room,
    role,
    token,
    serverUrl,
  };
});

exports.joinLivePodcastByInviteCode = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const inviteCode = String(data?.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) throw new functions.https.HttpsError('invalid-argument', 'inviteCode is required.');

  const inviteSnap = await db.collection(COLLECTIONS.invites).where('code', '==', inviteCode).limit(1).get();
  const invite = inviteSnap.docs[0];
  if (!invite) throw new functions.https.HttpsError('not-found', 'Invite code not found.');
  const inviteData = invite.data() || {};
  const roomId = String(inviteData.room_id || '').trim();
  if (!roomId) throw new functions.https.HttpsError('failed-precondition', 'Invite code is missing a room.');

  const roomRef = db.collection(COLLECTIONS.rooms).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = sanitizeRoom(roomSnap.data() || {}, roomId);
  if (room.status !== 'live') {
    throw new functions.https.HttpsError('failed-precondition', 'The host must start the broadcast before co-hosts can join.');
  }

  const inviteDoc = await getInviteDocByRoomAndCode(roomId, inviteCode);
  return createJoinSession({ uid, roomId, room, roomRef, inviteDoc });
});

exports.leaveLivePodcastRoom = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const roomRef = db.collection(COLLECTIONS.rooms).doc(roomId);
  await roomRef.set(
    {
      listener_count_current: admin.firestore.FieldValue.increment(-1),
      updated_at: nowIso(),
    },
    { merge: true }
  );
  await logAudit(roomId, uid, 'room_left');
  return { ok: true };
});

exports.requestLivePodcastSpeaker = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const roomSnap = await db.collection(COLLECTIONS.rooms).doc(roomId).get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = roomSnap.data() || {};
  if (room.allow_raise_hand === false) {
    throw new functions.https.HttpsError('failed-precondition', 'Raise hand is disabled for this room.');
  }

  const prior = await db
    .collection(COLLECTIONS.speakerRequests)
    .where('room_id', '==', roomId)
    .where('user_uid', '==', uid)
    .limit(20)
    .get();
  const statuses = prior.docs.map((d) => String(d.data()?.status || ''));
  if (statuses.includes('waiting')) {
    return { ok: true, alreadyWaiting: true };
  }
  if (statuses.includes('approved')) {
    return { ok: true, alreadyApproved: true };
  }

  const user = await getUserDoc(uid);
  const user_display_name = String(user.display_name || user.anonymous_username || 'Member').trim() || 'Member';
  const user_avatar_url = typeof user.avatar_url === 'string' && user.avatar_url.trim() ? user.avatar_url.trim() : null;

  await db.collection(COLLECTIONS.speakerRequests).add({
    room_id: roomId,
    user_uid: uid,
    user_display_name,
    user_avatar_url,
    note: String(data?.note || '').trim(),
    status: 'waiting',
    created_at: nowIso(),
  });
  await logAudit(roomId, uid, 'speaker_request_created');
  return { ok: true };
});

exports.resolveLivePodcastSpeakerRequest = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const requestId = String(data?.requestId || '').trim();
  const approve = data?.approve === true;
  if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');

  const requestRef = db.collection(COLLECTIONS.speakerRequests).doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) throw new functions.https.HttpsError('not-found', 'Speaker request not found.');
  const request = requestSnap.data() || {};
  const roomSnap = await db.collection(COLLECTIONS.rooms).doc(String(request.room_id || '')).get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = roomSnap.data() || {};
  if (room.host_uid !== uid && !(Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Only host or co-host can resolve requests.');
  }

  await requestRef.update({
    status: approve ? 'approved' : 'declined',
    decided_at: nowIso(),
    decided_by_uid: uid,
  });

  const roomIdStr = String(request.room_id || '');
  const targetUid = String(request.user_uid || '').trim();
  if (approve && roomIdStr && targetUid) {
    await db.collection(COLLECTIONS.rooms).doc(roomIdStr).update({
      approved_speaker_uids: admin.firestore.FieldValue.arrayUnion(targetUid),
      updated_at: nowIso(),
    });
    const roomName = String(room.livekit_room_name || '').trim();
    if (roomName) {
      try {
        const svc = getRoomServiceClient();
        await svc.updateParticipant(roomName, targetUid, {
          permission: {
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            canPublishSources: [TrackSource.MICROPHONE],
          },
        });
      } catch (permErr) {
        console.warn('resolveLivePodcastSpeakerRequest updateParticipant', permErr?.message || permErr);
      }
    }
  }

  await logAudit(String(request.room_id || ''), uid, approve ? 'speaker_request_approved' : 'speaker_request_declined', String(request.user_uid || ''), { requestId });
  return { ok: true };
});

exports.moderateLivePodcastParticipant = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  const targetUid = String(data?.targetUid || '').trim();
  const action = String(data?.action || '').trim().toLowerCase();
  if (!roomId || !targetUid || !['kick', 'remove_from_stage', 'mute', 'unmute'].includes(action)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'roomId, targetUid, and action (kick|remove_from_stage|mute|unmute) are required.'
    );
  }
  if (targetUid === uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot moderate yourself.');
  }

  const roomRef = db.collection(COLLECTIONS.rooms).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', 'Room not found.');
  const room = roomSnap.data() || {};
  if (room.host_uid !== uid && !(Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Only host or co-host can moderate.');
  }
  if (targetUid === room.host_uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot moderate the host.');
  }

  const roomName = String(room.livekit_room_name || '').trim();
  if (!roomName) throw new functions.https.HttpsError('failed-precondition', 'Room is missing LiveKit name.');

  let svc;
  try {
    svc = getRoomServiceClient();
  } catch (e) {
    throw new functions.https.HttpsError('failed-precondition', 'LiveKit is not configured for moderation.');
  }

  try {
    if (action === 'remove_from_stage') {
      await roomRef.update({
        approved_speaker_uids: admin.firestore.FieldValue.arrayRemove(targetUid),
        updated_at: nowIso(),
      });
      try {
        await svc.updateParticipant(roomName, targetUid, {
          permission: {
            canPublish: false,
            canSubscribe: true,
            canPublishData: true,
          },
        });
      } catch (permErr) {
        console.warn('moderateLivePodcastParticipant updateParticipant', permErr?.message || permErr);
      }
      try {
        const p = await svc.getParticipant(roomName, targetUid);
        const t = pickAudioTrackForModeration(p.tracks || []);
        if (t?.sid) {
          await svc.mutePublishedTrack(roomName, targetUid, t.sid, true);
        }
      } catch (muteErr) {
        /* participant may reconnect as listener; best-effort */
      }
      await logAudit(roomId, uid, 'participant_removed_from_stage', targetUid, {});
      return { ok: true };
    }

    if (action === 'kick') {
      await svc.removeParticipant(roomName, targetUid);
      await roomRef.update({
        approved_speaker_uids: admin.firestore.FieldValue.arrayRemove(targetUid),
        updated_at: nowIso(),
      });
      await logAudit(roomId, uid, 'participant_kicked_broadcast', targetUid, {});
      return { ok: true };
    }

    let target;
    try {
      target = await svc.getParticipant(roomName, targetUid);
    } catch (e) {
      const listed = await svc.listParticipants(roomName);
      target = listed.find((p) => p.identity === targetUid);
    }
    if (!target) {
      throw new functions.https.HttpsError('not-found', 'That participant is not connected right now.');
    }

    const audioTrack = pickAudioTrackForModeration(target.tracks || []);
    if (!audioTrack?.sid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No published microphone track for this participant yet.'
      );
    }
    await svc.mutePublishedTrack(roomName, targetUid, audioTrack.sid, action === 'mute');

    await logAudit(roomId, uid, action === 'mute' ? 'participant_muted' : 'participant_unmuted', targetUid, {});
    return { ok: true };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('moderateLivePodcastParticipant failed', { roomId, targetUid, action, message: err?.message });
    throw new functions.https.HttpsError('internal', err?.message || 'Moderation failed.');
  }
});

exports.setLivePodcastReminder = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const roomId = String(data?.roomId || '').trim();
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId is required.');

  const ref = db.collection(COLLECTIONS.reminders).doc(`${roomId}_${uid}`);
  await ref.set({
    room_id: roomId,
    user_uid: uid,
    created_at: nowIso(),
  });
  return { ok: true };
});
