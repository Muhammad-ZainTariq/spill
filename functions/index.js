const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { randomUUID } = require('crypto');

admin.initializeApp();

const db = admin.firestore();

// Shared Gmail transport for therapist onboarding emails and internal alerts.
// Trim and normalize: Gmail app passwords are 16 chars, sometimes stored with spaces.
const gmailUser = typeof functions.config().gmail?.user === 'string' ? functions.config().gmail.user.trim() : '';
const gmailPassRaw = typeof functions.config().gmail?.app_password === 'string' ? functions.config().gmail.app_password.trim() : '';
const gmailPass = gmailPassRaw ? gmailPassRaw.replace(/\s+/g, '') : ''; // Gmail expects no spaces

let gmailTransport = null;
if (gmailUser && gmailPass) {
  gmailTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
} else {
  console.warn('Gmail config not set in functions config. Therapist onboarding emails will be skipped.');
}

// Threshold for auto-flagging based on Perspective TOXICITY score (0–1).
// Lower values = more aggressive flagging.
const TOXICITY_THRESHOLD = 0.4; // 0-1; above this we flag for admin review

// When a new post is created, check content with Google Perspective API; if toxicity above threshold, flag post and add report for admin.
exports.checkPostToxicity = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 30 })
  .firestore.document('posts/{postId}')
  .onCreate(async (snap, context) => {
    const postId = context.params.postId;
    const data = snap.data();
    const content = typeof data.content === 'string' ? data.content.trim() : '';
    const postOwnerUid = data.user_id || null;

    if (!content.length) return null;

    const apiKey = functions.config().perspective?.api_key;
    if (!apiKey) {
      console.warn('Perspective API key not set. Skip toxicity check.');
      return null;
    }

    try {
      const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`;
      const body = {
        comment: { text: content },
        requestedAttributes: { TOXICITY: {} },
        doNotStore: true,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Perspective API error', res.status, errText);
        return null;
      }

      const result = await res.json();
      const toxicityScore =
        result?.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;
      console.log('Perspective TOXICITY score for post', postId, '=>', toxicityScore);

      if (toxicityScore < TOXICITY_THRESHOLD) {
        console.log('Post below toxicity threshold, not flagging.', {
          postId,
          toxicityScore,
          threshold: TOXICITY_THRESHOLD,
        });
        return null;
      }

      const now = new Date().toISOString();

      await snap.ref.update({
        flagged_for_toxicity: true,
        toxicity_score: Math.round(toxicityScore * 100) / 100,
        flagged_at: now,
      });

      await db.collection('reports').add({
        post_id: postId,
        post_owner_uid: postOwnerUid,
        reporter_uid: 'system',
        reason: `Auto-flagged: toxicity score ${(toxicityScore * 100).toFixed(0)}% (Perspective API)`,
        created_at: now,
        status: 'pending',
      });

      if (postOwnerUid) {
        const userRef = db.collection('users').doc(postOwnerUid);
        await userRef.update({
          reports_received_count: admin.firestore.FieldValue.increment(1),
        });

        // Notify all admins that a post was auto-flagged
        try {
          const adminsSnap = await db.collection('users').where('is_admin', '==', true).get();
          const notifBatch = db.batch();
          const adminIds = adminsSnap.docs.map((d) => d.id);
          console.log('checkPostToxicity: notifying admins for flagged post', {
            postId,
            toxicityScore,
            adminCount: adminIds.length,
          });
          adminsSnap.docs.forEach((adminDoc) => {
            const notifRef = db.collection('notifications').doc();
            notifBatch.set(notifRef, {
              recipient_id: adminDoc.id,
              type: 'post_flagged',
              post_id: postId,
              post_owner_uid: postOwnerUid,
              toxicity_score: Math.round(toxicityScore * 100) / 100,
              created_at: now,
              read: false,
            });
          });
          if (!adminsSnap.empty) {
            await notifBatch.commit();
          }
          // Push notifications to admins (best effort)
          await Promise.all(
            adminIds.map((aid) =>
              sendPushToUser(aid, 'Post flagged for review', 'A post was auto-flagged and needs your review.', {
                type: 'post_flagged',
                post_id: postId,
                post_owner_uid: postOwnerUid,
              })
            )
          );
        } catch (notifyErr) {
          console.warn('Failed to notify admins for flagged post', notifyErr);
        }
      }

      return null;
    } catch (err) {
      console.error('checkPostToxicity failed', err);
      return null;
    }
  });

// Callable: upload media from base64 (avoids Blob/ArrayBuffer issues in React Native). Body: { base64, contentType, path }. Returns { path }; client uses getDownloadURL (no signBlob IAM needed).
exports.uploadMedia = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    const { base64, contentType, path } = data || {};
    if (!base64 || typeof base64 !== 'string' || !path || typeof path !== 'string' || !path.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'base64 and path are required.');
    }
    const mime = (contentType && typeof contentType === 'string') ? contentType.trim() : 'application/octet-stream';
    try {
      const buffer = Buffer.from(base64, 'base64');
      const bucket = admin.storage().bucket('spillll.firebasestorage.app');
      const file = bucket.file(path.trim());
      await file.save(buffer, { metadata: { contentType: mime } });
      return { path: path.trim() };
    } catch (err) {
      console.error('uploadMedia failed', err);
      throw new functions.https.HttpsError('internal', err.message || 'Upload failed.');
    }
  });

// Admin-only callable: approve a flagged post as safe so it shows on the feed with a "might be dangerous or toxic" badge. Body: { postId }; optionally pass reportId to resolve that report.
exports.approvePostAsSafe = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    const adminUid = context.auth.uid;
    const adminDoc = await db.collection('users').doc(adminUid).get();
    if (!adminDoc.exists || !adminDoc.data().is_admin) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can approve posts.');
    }
    const { postId, reportId } = data || {};
    if (!postId || typeof postId !== 'string' || !postId.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'postId is required.');
    }
    const postRef = db.collection('posts').doc(postId.trim());
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Post not found.');
    }
    const postData = postSnap.data() || {};
    const postOwnerUid = postData.user_id || null;
    const now = new Date().toISOString();
    await postRef.update({ approved_safe_at: now });
    if (reportId && typeof reportId === 'string' && reportId.trim()) {
      await db.collection('reports').doc(reportId.trim()).update({
        status: 'resolved',
        resolved_at: now,
        resolved_by: adminUid,
      });
    } else {
      const reportsSnap = await db.collection('reports').where('post_id', '==', postId.trim()).where('status', '==', 'pending').get();
      const batch = db.batch();
      reportsSnap.docs.forEach((d) => {
        batch.update(d.ref, { status: 'resolved', resolved_at: now, resolved_by: adminUid });
      });
      if (!reportsSnap.empty) await batch.commit();
    }

    // Notify post owner that their post was approved as safe
    if (postOwnerUid && typeof postOwnerUid === 'string') {
      try {
        await db.collection('notifications').add({
          recipient_id: postOwnerUid,
          type: 'post_approved_safe',
          post_id: postId.trim(),
          created_at: now,
          read: false,
        });
        console.log('approvePostAsSafe: created in-app notification for post owner', {
          postId: postId.trim(),
          postOwnerUid,
        });
        // Push notification to post owner (best effort)
        await sendPushToUser(
          postOwnerUid,
          'Your post was approved',
          'An admin reviewed your flagged post and marked it as safe.',
          { type: 'post_approved_safe', post_id: postId.trim() }
        );
      } catch (notifyErr) {
        console.warn('approvePostAsSafe: failed to notify user for post approval', {
          postId: postId.trim(),
          postOwnerUid,
          error: notifyErr,
        });
      }
    }
    return { ok: true, postId: postId.trim() };
  });

// Admin-only callable: create staff user with emailVerified true. Body: { staffEmail, staffPassword, staffDisplayName? }; caller must be admin.
exports.createStaffUser = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }
  const adminUid = context.auth.uid;
  const adminDoc = await admin.firestore().collection('users').doc(adminUid).get();
  if (!adminDoc.exists || !adminDoc.data().is_admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can add staff.');
  }

  const { staffEmail, staffPassword, staffDisplayName } = data || {};
  if (!staffEmail || typeof staffEmail !== 'string' || !staffEmail.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Staff email is required.');
  }
  if (!staffPassword || typeof staffPassword !== 'string' || staffPassword.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Staff password must be at least 6 characters.');
  }

  try {
    const staffUser = await admin.auth().createUser({
      email: staffEmail.trim(),
      password: staffPassword,
      emailVerified: true,
    });

    await admin.firestore().collection('users').doc(staffUser.uid).set({
      display_name: (staffDisplayName && typeof staffDisplayName === 'string') ? staffDisplayName.trim() || null : null,
      anonymous_username: null,
      avatar_url: null,
      is_premium: false,
      premium_activated_at: null,
      premium_expires_at: null,
      is_admin: false,
      is_staff: true,
      created_at: new Date().toISOString(),
    });

    return { ok: true, uid: staffUser.uid };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'That email is already registered.');
    }
    if (err.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email address.');
    }
    throw new functions.https.HttpsError('internal', err.message || 'Failed to create staff user.');
  }
});

// Public callable: submit a therapist onboarding request. No auth required.
// Body: { name, email, specialization, note }
exports.submitTherapistRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const { name, email, specialization, note } = data || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedSpec = typeof specialization === 'string' ? specialization.trim() : '';
    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    if (!trimmedName || !trimmedEmail) {
      throw new functions.https.HttpsError('invalid-argument', 'Name and email are required.');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      const docRef = await db.collection('therapist_onboarding_requests').add({
        name: trimmedName,
        email: trimmedEmail.toLowerCase(),
        specialization: trimmedSpec || null,
        note: trimmedNote || null,
        status: 'pending',
        therapist_code: null,
        created_at: now,
        updated_at: now,
        processed_by: null,
      });

      // Optional internal email to notify admin of new request.
      if (gmailTransport && gmailUser) {
        try {
          await gmailTransport.sendMail({
            from: `"Spill" <${gmailUser}>`,
            to: gmailUser,
            subject: 'New therapist onboarding request',
            text: [
              `New therapist request received:`,
              ``,
              `Name: ${trimmedName}`,
              `Email: ${trimmedEmail}`,
              trimmedSpec ? `Specialization: ${trimmedSpec}` : '',
              trimmedNote ? `Note: ${trimmedNote}` : '',
              ``,
              `Request ID: ${docRef.id}`,
            ]
              .filter(Boolean)
              .join('\n'),
          });
        } catch (mailErr) {
          console.warn('submitTherapistRequest: failed to send internal email', mailErr);
        }
      }

      return { ok: true, requestId: docRef.id };
    } catch (err) {
      console.error('submitTherapistRequest failed', err);
      throw new functions.https.HttpsError('internal', err.message || 'Failed to submit request.');
    }
  });

// Admin-only callable: generate a therapist code and send invite email.
// Body: { requestId, customMessage }
exports.sendTherapistInvite = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    const adminUid = context.auth.uid;
    const adminDoc = await db.collection('users').doc(adminUid).get();
    if (!adminDoc.exists || !adminDoc.data().is_admin) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can send therapist invites.');
    }

    const { requestId, customMessage } = data || {};
    if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');
    }

    if (!gmailTransport || !gmailUser) {
      console.warn('sendTherapistInvite: Gmail transport not configured.');
      throw new functions.https.HttpsError('failed-precondition', 'Email sending is not configured.');
    }

    const trimmedId = requestId.trim();

    try {
      const reqRef = db.collection('therapist_onboarding_requests').doc(trimmedId);
      const reqSnap = await reqRef.get();
      if (!reqSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Request not found.');
      }

      const reqData = reqSnap.data() || {};
      const email = typeof reqData.email === 'string' ? reqData.email.trim() : '';
      const name = typeof reqData.name === 'string' ? reqData.name.trim() : '';
      const currentStatus = reqData.status || 'pending';

      if (!email) {
        throw new functions.https.HttpsError('failed-precondition', 'Request is missing email.');
      }

      // Generate a new code if there isn't one yet.
      let code =
        typeof reqData.therapist_code === 'string' && reqData.therapist_code.trim()
          ? reqData.therapist_code.trim()
          : randomUUID().toUpperCase();

      const nowTs = admin.firestore.FieldValue.serverTimestamp();

      await reqRef.update({
        therapist_code: code,
        status: 'invited',
        updated_at: nowTs,
        processed_by: adminUid,
      });

      const custom = typeof customMessage === 'string' && customMessage.trim() ? customMessage.trim() : '';

      const lines = [
        name ? `Hi ${name},` : 'Hi,',
        '',
        'Thanks for applying to join Spill as a therapist.',
        '',
        'Here is your one‑time therapist onboarding code (long‑press to copy):',
        '',
        '────────────────────',
        code,
        '────────────────────',
        '',
        'To continue your onboarding:',
        '1. Open the Spill app.',
        '2. On the login screen, tap \"I have a therapist code\".',
        '3. Paste this code and follow the steps to upload your documents.',
      ];

      if (custom) {
        lines.push('', 'Additional note from the team:', custom);
      }

      lines.push(
        '',
        'If you did not request this, you can ignore this email.',
        '',
        'With care,',
        'The Spill team'
      );

      await gmailTransport.sendMail({
        from: `"Spill" <${gmailUser}>`,
        to: email,
        subject: 'Your Spill therapist onboarding code',
        text: lines.join('\n'),
      });

      console.log('sendTherapistInvite: sent invite email', {
        requestId: trimmedId,
        email,
        statusBefore: currentStatus,
      });

      return { ok: true, requestId: trimmedId, code };
    } catch (err) {
      console.error('sendTherapistInvite failed', err);
      throw new functions.https.HttpsError('internal', err.message || 'Failed to send invite.');
    }
  });

// Public callable: verify a therapist code before signup.
// Body: { code }
exports.verifyTherapistCode = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const { code } = data || {};
    const trimmedCode = typeof code === 'string' ? code.trim() : '';
    if (!trimmedCode) {
      throw new functions.https.HttpsError('invalid-argument', 'Code is required.');
    }

    try {
      const snap = await db
        .collection('therapist_onboarding_requests')
        .where('therapist_code', '==', trimmedCode)
        .where('status', '==', 'invited')
        .limit(1)
        .get();

      if (snap.empty) {
        throw new functions.https.HttpsError('not-found', 'Invalid or expired code.');
      }

      const doc = snap.docs[0];
      const dataOut = doc.data() || {};

      return {
        ok: true,
        requestId: doc.id,
        email: dataOut.email || null,
        name: dataOut.name || null,
      };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      console.error('verifyTherapistCode failed', err);
      throw new functions.https.HttpsError('internal', err.message || 'Failed to verify code.');
    }
  });

async function sendPushToUser(recipientId, title, body, payload) {
  const userId = recipientId.trim();
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    console.warn('sendPushToUser: user not found', { recipientId: userId });
    return { ok: false, error: 'User not found' };
  }
  const expoPushToken = userSnap.data().expo_push_token;
  if (!expoPushToken || typeof expoPushToken !== 'string' || !expoPushToken.startsWith('ExponentPushToken[')) {
    console.warn('sendPushToUser: missing or invalid expo_push_token', {
      recipientId: userId,
      expoPushToken,
    });
    return { ok: false, error: 'No push token' };
  }
  const recipientIdTrimmed = recipientId.trim();
  let badge = 0;
  try {
    const unreadSnap = await db
      .collection('notifications')
      .where('recipient_id', '==', recipientIdTrimmed)
      .where('read', '==', false)
      .limit(500)
      .get();
    badge = unreadSnap.size;
  } catch (e) {
    // ignore badge count failure
  }
  try {
    console.log('sendPushToUser: sending push', {
      recipientId: recipientIdTrimmed,
      title,
      body,
      hasPayload: !!payload,
    });
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: expoPushToken,
        title: title.substring(0, 100),
        body: (body || '').substring(0, 200),
        data: payload || {},
        sound: 'default',
        channelId: 'default',
        badge,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('sendPushToUser: Expo push error', res.status, text);
      return { ok: false, error: text };
    }
    console.log('sendPushToUser: push sent successfully', { recipientId: recipientIdTrimmed });
    return { ok: true };
  } catch (err) {
    console.error('sendPushToUser failed', { recipientId: recipientIdTrimmed, error: err });
    return { ok: false, error: err.message || 'Failed to send push.' };
  }
}

// Callable: send an Expo push notification to a user (used for game invites, match accepted, etc.)
exports.sendExpoPush = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    const { recipientId, title, body, data: payload } = data || {};
    if (!recipientId || typeof recipientId !== 'string' || !title || typeof title !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'recipientId and title are required.');
    }
    const res = await sendPushToUser(recipientId, title, body, payload);
    if (!res.ok) {
      throw new functions.https.HttpsError('internal', res.error || 'Failed to send push.');
    }
    return res;
  });
