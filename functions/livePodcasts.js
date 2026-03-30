const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { randomBytes } = require('crypto');
const { AccessToken } = require('livekit-server-sdk');

const db = admin.firestore();

const COLLECTIONS = {
  rooms: 'live_podcast_rooms',
  invites: 'live_podcast_invite_codes',
  speakerRequests: 'live_podcast_speaker_requests',
  reminders: 'live_podcast_reminders',
  auditLogs: 'live_podcast_audit_logs',
};

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

function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
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
    started_at: data.started_at || null,
    ended_at: data.ended_at || null,
    record_mode: String(data.record_mode || 'draft'),
    replay_status: String(data.replay_status || 'none'),
    allow_raise_hand: data.allow_raise_hand !== false,
    allow_listener_speaking: data.allow_listener_speaking === true,
    livekit_room_name: String(data.livekit_room_name || `podcast-${id}`),
    co_host_ids: Array.isArray(data.co_host_ids) ? data.co_host_ids : [],
    listener_count_current: Number(data.listener_count_current || 0),
    listener_count_peak: Number(data.listener_count_peak || 0),
    total_join_count: Number(data.total_join_count || 0),
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
}

function resolveRole({ room, uid, inviteDoc }) {
  if (uid === room.host_uid) return 'host';
  if (Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid)) return 'co_host';
  if (!inviteDoc) return 'listener';
  const role = String(inviteDoc.role || '').trim();
  if (role === 'co_host') return 'co_host';
  if (role === 'speaker_guest') return 'speaker';
  return 'listener';
}

async function createAccessToken({ uid, displayName, roomName, role }) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: uid,
    name: displayName || 'Listener',
    ttl: '4h',
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: role !== 'listener',
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: role === 'host' || role === 'co_host',
  });
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
    scheduled_for: data?.scheduled_for ? String(data.scheduled_for) : null,
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
    listener_count_current: 0,
    listener_count_peak: 0,
    total_join_count: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await ref.set(room);
  await logAudit(ref.id, uid, 'room_created', null, { status: room.status });
  return { room: sanitizeRoom(room, ref.id) };
});

exports.startLivePodcastRoom = functions.region('us-central1').https.onCall(async (data, context) => {
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
  const canTranscribe = uid === room.host_uid || (Array.isArray(room.co_host_ids) && room.co_host_ids.includes(uid));
  if (!canTranscribe) {
    throw new functions.https.HttpsError('permission-denied', 'Only the host or a co-host can start live captions.');
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

  const inviteRef = db.collection(COLLECTIONS.invites).doc();
  const code = generateInviteCode();
  const expiresInMinutes = Math.max(10, Math.min(24 * 60, Number(data?.expiresInMinutes || 120)));
  await inviteRef.set({
    room_id: roomId,
    code,
    role,
    created_by_uid: uid,
    is_active: true,
    max_uses: Math.max(1, Math.min(25, Number(data?.maxUses || 1))),
    uses_count: 0,
    expires_at: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
    created_at: nowIso(),
  });
  await logAudit(roomId, uid, 'invite_created', null, { role });
  return { code, role, expiresInMinutes };
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
    inviteDoc = { id: invite.id, ...data };
  }

  const role = resolveRole({ room, uid, inviteDoc });
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

  const updates = {
    listener_count_current: admin.firestore.FieldValue.increment(1),
    total_join_count: admin.firestore.FieldValue.increment(1),
    updated_at: nowIso(),
  };
  await roomRef.update(updates);

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

  const existing = await db
    .collection(COLLECTIONS.speakerRequests)
    .where('room_id', '==', roomId)
    .where('user_uid', '==', uid)
    .where('status', '==', 'waiting')
    .limit(1)
    .get();
  if (!existing.empty) return { ok: true, alreadyWaiting: true };

  await db.collection(COLLECTIONS.speakerRequests).add({
    room_id: roomId,
    user_uid: uid,
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
  await logAudit(String(request.room_id || ''), uid, approve ? 'speaker_request_approved' : 'speaker_request_declined', String(request.user_uid || ''), { requestId });
  return { ok: true };
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
