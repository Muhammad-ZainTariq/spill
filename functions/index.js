const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const TOXICITY_THRESHOLD = 0.7; // 0-1; above this we flag for admin review

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

      if (toxicityScore < TOXICITY_THRESHOLD) return null;

      const now = new Date().toISOString();

      await snap.ref.update({
        flagged_for_toxicity: true,
        toxicity_score: Math.round(toxicityScore * 100) / 100,
        flagged_at: now,
      });

      await admin.firestore().collection('reports').add({
        post_id: postId,
        post_owner_uid: postOwnerUid,
        reporter_uid: 'system',
        reason: `Auto-flagged: toxicity score ${(toxicityScore * 100).toFixed(0)}% (Perspective API)`,
        created_at: now,
        status: 'pending',
      });

      if (postOwnerUid) {
        const userRef = admin.firestore().collection('users').doc(postOwnerUid);
        await userRef.update({
          reports_received_count: admin.firestore.FieldValue.increment(1),
        });
      }

      return null;
    } catch (err) {
      console.error('checkPostToxicity failed', err);
      return null;
    }
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
