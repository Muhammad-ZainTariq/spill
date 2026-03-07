import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, functions } from '@/lib/firebase';
import { tokens } from '@/app/ui/tokens';
import {
  getTherapistVerificationRequirements,
  TherapistVerificationRequirementItem,
  UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS,
} from '@/app/functions';

type TherapistRequest = {
  id: string;
  name: string;
  email: string;
  specialization?: string | null;
  note?: string | null;
  status?: string | null;
  document_url?: string | null;
  document_urls?: string[] | null;
  document_uploads?: Record<
    string,
    { title?: string | null; url?: string | null; kind?: string | null; mime?: string | null; uploaded_at?: string | null }
  > | null;
  verification_video?: { url?: string | null; uploaded_at?: string | null; mime?: string | null } | null;
  completed_uid?: string | null;
  admin_request_message?: string | null;
  reviewed_note?: string | null;
  requested_item_ids?: string[] | null;
  requirements_template_id?: string | null;
};

type TherapistReview = {
  id: string;
  therapist_uid: string;
  session_id: string;
  reviewer_uid: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  return '';
}

export default function AdminTherapistRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestId = safeString(params?.requestId).trim();

  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<TherapistRequest | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [requirements, setRequirements] = useState<TherapistVerificationRequirementItem[]>(
    UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS
  );
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [reviews, setReviews] = useState<TherapistReview[]>([]);

  const docs = useMemo(() => {
    const list: string[] = [];
    if (req?.document_url) list.push(String(req.document_url));
    if (Array.isArray(req?.document_urls)) {
      for (const u of req.document_urls) if (u && typeof u === 'string') list.push(u);
    }
    return [...new Set(list.filter(Boolean))];
  }, [req]);

  const uploadsMap = useMemo(() => {
    const m = (req as any)?.document_uploads;
    return m && typeof m === 'object' ? (m as Record<string, any>) : {};
  }, [req]);

  const loadReviews = useCallback(async (therapistUid: string) => {
    try {
      const tid = String(therapistUid || '').trim();
      if (!tid) {
        setReviews([]);
        return;
      }
      const q = query(collection(db, 'therapist_reviews'), where('therapist_uid', '==', tid));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TherapistReview[];
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setReviews(list.slice(0, 20));
    } catch {
      setReviews([]);
    }
  }, []);

  const status = String(req?.status || 'pending');
  const isInviteMode = status === 'pending' || status === 'invited';
  const isReviewMode = status === 'completed' || status === 'resubmitted';

  const requestedDefaultIds = useMemo(() => {
    const idsFromReq = Array.isArray(req?.requested_item_ids) ? req?.requested_item_ids.filter(Boolean) : null;
    if (idsFromReq && idsFromReq.length) return idsFromReq;
    return (requirements || [])
      .filter((it) => it && it.requiredForDemo)
      .map((it) => it.id)
      .filter(Boolean);
  }, [req?.requested_item_ids, requirements]);

  const requestedItems = useMemo(() => {
    const byId = new Map((requirements || []).map((it) => [it.id, it]));
    return requestedDefaultIds.map((id) => byId.get(id)).filter(Boolean) as TherapistVerificationRequirementItem[];
  }, [requestedDefaultIds, requirements]);

  const openDoc = useCallback(
    (url: string) => {
      const u = String(url || '').trim();
      if (!u) return;
      router.push({
        pathname: '/document-viewer',
        params: { url: encodeURIComponent(u), title: 'Therapist document' },
      } as any);
    },
    [router]
  );

  const openVideo = useCallback(() => {
    const u = String((req as any)?.verification_video?.url || '').trim();
    if (!u) return;
    router.push({
      pathname: '/document-viewer',
      params: { url: encodeURIComponent(u), title: 'Verification video' },
    } as any);
  }, [router, req]);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'therapist_onboarding_requests', requestId));
      if (!snap.exists()) {
        setReq(null);
      } else {
        const data = { id: snap.id, ...(snap.data() as any) } as TherapistRequest;
        setReq(data);

        // Best effort: load requirements template to help admin request missing docs.
        try {
          const templateId = String(data?.requirements_template_id || 'uk_default');
          const tpl = await getTherapistVerificationRequirements(templateId);
          setRequirements(Array.isArray(tpl.items) && tpl.items.length ? tpl.items : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS);
        } catch {
          setRequirements(UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS);
        }

        // Initialize missing list from request doc (or default "requested" items)
        const initIds = Array.isArray(data?.requested_item_ids) && data.requested_item_ids.length
          ? data.requested_item_ids.filter(Boolean)
          : UK_DEFAULT_THERAPIST_VERIFICATION_REQUIREMENTS.filter((it) => it.requiredForDemo).map((it) => it.id);
        setMissingIds(initIds);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load request.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    // Realtime updates so docs appear as soon as therapist uploads
    const unsub = onSnapshot(doc(db, 'therapist_onboarding_requests', requestId), (snap) => {
      if (!snap.exists()) {
        setReq(null);
        setLoading(false);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as any) } as TherapistRequest;
      setReq(data);
      setLoading(false);
    });
    // Still call load() once to fetch requirements template + init missing list
    load();
    return () => unsub();
  }, [load, requestId]);

  useEffect(() => {
    const tid = String((req as any)?.completed_uid || '').trim();
    if (!tid) {
      setReviews([]);
      return;
    }
    loadReviews(tid);
  }, [req?.completed_uid, loadReviews]);

  const buildMissingDocsMessage = useCallback(
    (ids: string[]) => {
      const name = String(req?.name || '').trim();
      const itemsById = new Map((requirements || []).map((it) => [it.id, it]));
      const titles = ids
        .map((id) => itemsById.get(id))
        .map((it) => (it ? it.title : null))
        .filter((t): t is string => !!t);

      const lines = [
        name ? `Hi ${name},` : 'Hi,',
        '',
        'To continue your therapist verification, please upload the following:',
        ...titles.map((t) => `- ${t}`),
        '',
        'You can upload screenshots or PDFs. For the dissertation/demo version, our admin team will manually review what you provide.',
        '',
        'Additional notes:',
        '',
      ];
      return lines.join('\n');
    },
    [req?.name, requirements]
  );

  const toggleMissing = useCallback((id: string) => {
    setMissingIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleSendInvite = useCallback(async () => {
    if (!req?.id) return;
    if (sendingInvite) return;
    setSendingInvite(true);
    try {
      const sendInvite = httpsCallable<
        { requestId: string; customMessage?: string },
        { ok: boolean; requestId: string; code: string }
      >(functions, 'sendTherapistInvite');
      const res = await sendInvite({
        requestId: req.id,
        customMessage: customMessage.trim() || undefined,
      });
      if (res.data?.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Invite sent', 'We emailed a therapist code to this therapist.');
        setCustomMessage('');
        await load();
      } else {
        Alert.alert('Error', 'Failed to send invite. Please try again.');
      }
    } catch (err: any) {
      const msg =
        err?.code === 'functions/failed-precondition'
          ? 'Email sending is not configured for this project.'
          : err?.message || 'Failed to send invite.';
      Alert.alert('Error', msg);
    } finally {
      setSendingInvite(false);
    }
  }, [req?.id, sendingInvite, customMessage, load]);

  const notifyTherapist = useCallback(
    async (recipientId: string, title: string, body: string, data: Record<string, string>) => {
      try {
        await addDoc(collection(db, 'notifications'), {
          recipient_id: recipientId,
          type: 'therapist_verification',
          created_at: new Date().toISOString(),
          read: false,
          from_user_id: 'admin',
          title,
          body,
          data,
        });
      } catch {}
      try {
        const sendPush = httpsCallable<
          { recipientId: string; title: string; body: string; data?: Record<string, string> },
          { ok: boolean; error?: string }
        >(functions, 'sendExpoPush');
        await sendPush({ recipientId, title, body, data });
      } catch {}
    },
    []
  );

  const setDecision = useCallback(
    async (decision: 'approved' | 'rejected' | 'needs_more_docs') => {
      if (!req?.id) return;
      if (savingDecision) return;
      const therapistUid = String(req.completed_uid || '').trim();
      setSavingDecision(true);
      try {
        const now = new Date().toISOString();
        const note =
          decision === 'needs_more_docs'
            ? (reviewNote.trim() || buildMissingDocsMessage(missingIds))
            : reviewNote.trim();

        await updateDoc(doc(db, 'therapist_onboarding_requests', req.id), {
          status: decision,
          reviewed_at: now,
          reviewed_note: note || null,
        });

        if (therapistUid) {
          await updateDoc(doc(db, 'users', therapistUid), {
            is_therapist_verified: decision === 'approved',
            therapist_verification_status: decision,
            therapist_reviewed_at: now,
          });

          // Keep public therapist profile in sync (used by /therapists marketplace)
          await setDoc(
            doc(db, 'therapist_profiles', therapistUid),
            {
              verified: decision === 'approved',
              display_name: req?.name || null,
              specialization: req?.specialization || null,
              updated_at: now,
            },
            { merge: true }
          );

          if (decision === 'approved') {
            await notifyTherapist(
              therapistUid,
              'Therapist approved',
              'Your documents were approved. Therapist access is now enabled.',
              { type: 'therapist_verification', status: 'approved' }
            );
          } else if (decision === 'rejected') {
            await notifyTherapist(
              therapistUid,
              'Therapist verification rejected',
              note
                ? `Reason: ${note.slice(0, 160)}`
                : 'Your therapist verification was rejected. Please contact support.',
              { type: 'therapist_verification', status: 'rejected' }
            );
          } else {
            await updateDoc(doc(db, 'therapist_onboarding_requests', req.id), {
              admin_request_message: note || 'Please upload additional verification documents.',
              requested_item_ids: missingIds,
              requested_more_at: now,
            });
            await notifyTherapist(
              therapistUid,
              'More documents needed',
              note
                ? note.slice(0, 160)
                : 'Please upload additional verification documents.',
              { type: 'therapist_verification', status: 'needs_more_docs', request_id: req.id }
            );
          }
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Saved', 'Decision saved.');
        setReviewNote('');
        await load();
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to save decision.');
      } finally {
        setSavingDecision(false);
      }
    },
    [req?.id, req?.completed_uid, savingDecision, reviewNote, notifyTherapist, load, buildMissingDocsMessage, missingIds]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={tokens.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Review request
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {requestId ? requestId : 'Therapist onboarding'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.mutedText}>Loading…</Text>
        </View>
      ) : !req ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Request not found</Text>
          <Text style={styles.mutedText}>Go back and pick a request again.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.heroName}>{req.name || 'Therapist'}</Text>
            <Text style={styles.heroMeta}>
              {req.email}
              {req.specialization ? ` • ${req.specialization}` : ''}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{status.replace(/_/g, ' ')}</Text>
            </View>
          </View>

          {req.note ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Note</Text>
              <Text style={styles.noteText}>{req.note}</Text>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Verification checklist</Text>
            <Text style={styles.helpText}>
              Each upload is attached to a specific checklist item, so you can quickly verify what is what.
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              <Pressable onPress={openVideo} style={styles.checklistRow}>
                <Feather
                  name={(req as any)?.verification_video?.url ? 'check-circle' : 'circle'}
                  size={18}
                  color={(req as any)?.verification_video?.url ? tokens.colors.pink : tokens.colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checklistTitle}>ID verification video (5 seconds)</Text>
                  <Text style={styles.checklistText} numberOfLines={2}>
                    {(req as any)?.verification_video?.url ? 'Uploaded — tap to open.' : 'Missing — ask therapist to record it in-app.'}
                  </Text>
                </View>
                {(req as any)?.verification_video?.url ? (
                  <Text style={styles.openChip}>Open</Text>
                ) : (
                  <Text style={styles.missingChip}>Missing</Text>
                )}
              </Pressable>

              {requestedItems.map((it) => {
                const uploaded = uploadsMap?.[it.id];
                const has = !!uploaded?.url;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => (has ? openDoc(String(uploaded.url)) : null)}
                    style={styles.checklistRow}
                  >
                    <Feather
                      name={has ? 'check-circle' : 'circle'}
                      size={18}
                      color={has ? tokens.colors.pink : tokens.colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checklistTitle}>{it.title}</Text>
                      <Text style={styles.checklistText} numberOfLines={2}>
                        {has ? 'Uploaded — tap to open.' : 'Missing'}
                      </Text>
                    </View>
                    {has ? <Text style={styles.openChip}>Open</Text> : <Text style={styles.missingChip}>Missing</Text>}
                  </Pressable>
                );
              })}
            </View>

            {docs.length > 0 ? (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Other uploaded files</Text>
                <View style={{ gap: 8 }}>
                  {docs.slice(0, 8).map((u) => (
                    <Pressable key={u} style={styles.otherDocRow} onPress={() => openDoc(u)}>
                      <Feather name="file" size={16} color="#111827" />
                      <Text style={styles.otherDocText} numberOfLines={1}>
                        {u}
                      </Text>
                      <Text style={styles.otherDocOpen}>Open</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {reviews.length ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Reviews (private)</Text>
              <Text style={styles.helpText}>Only admins and the therapist can see these.</Text>
              <View style={{ marginTop: 10, gap: 10 }}>
                {reviews.slice(0, 8).map((r) => (
                  <View key={r.id} style={styles.reviewRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.reviewStars}>
                        {'★★★★★'.slice(0, Math.max(1, Math.min(5, Number(r.rating || 0))))}
                      </Text>
                      <Text style={styles.reviewDate}>{String(r.created_at || '').slice(0, 10)}</Text>
                    </View>
                    {r.comment ? <Text style={styles.reviewText}>{String(r.comment)}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {isInviteMode ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Invite message (optional)</Text>
              <View style={styles.messageBox}>
                <TextInput
                  style={styles.messageInput}
                  multiline
                  value={customMessage}
                  onChangeText={setCustomMessage}
                  placeholder="Short note to the therapist (optional)."
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <Pressable
                onPress={handleSendInvite}
                disabled={sendingInvite}
                style={[styles.primaryBtn, sendingInvite && { opacity: 0.6 }]}
              >
                <Text style={styles.primaryBtnText}>{sendingInvite ? 'Sending…' : 'Generate code & send invite'}</Text>
              </Pressable>
            </View>
          ) : null}

          {isReviewMode ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Decision</Text>
              <Text style={styles.helpText}>
                Approve enables therapist access. If something is missing, request more documents.
              </Text>

              <View style={[styles.messageBox, { marginTop: 12, padding: 12 }]}>
                <Text style={styles.sectionTitle}>Request missing documents</Text>
                <Text style={styles.helperMuted}>Select what’s missing. Then insert a professional message template.</Text>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {(requirements || []).map((it) => {
                    const selected = missingIds.includes(it.id);
                    return (
                      <Pressable
                        key={it.id}
                        onPress={() => toggleMissing(it.id)}
                        style={[styles.checkRow, selected && styles.checkRowSelected]}
                      >
                        <Feather name={selected ? 'check-square' : 'square'} size={18} color={selected ? '#ec4899' : '#6b7280'} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.checkTitle}>{it.title}</Text>
                          <Text style={styles.checkText} numberOfLines={2}>
                            {it.description}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => setReviewNote(buildMissingDocsMessage(missingIds.length ? missingIds : requestedDefaultIds))}
                  style={styles.templateBtn}
                >
                  <Text style={styles.templateBtnText}>Insert message template</Text>
                </Pressable>
              </View>

              <View style={styles.messageBox}>
                <TextInput
                  style={styles.messageInput}
                  multiline
                  value={reviewNote}
                  onChangeText={setReviewNote}
                  placeholder="Write what’s missing / reason (shown to therapist)."
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={{ marginTop: 12, gap: 10 }}>
                <Pressable
                  disabled={savingDecision}
                  onPress={() => setDecision('approved')}
                  style={[styles.approveBtn, savingDecision && { opacity: 0.6 }]}
                >
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
                <Pressable
                  disabled={savingDecision}
                  onPress={() => setDecision('needs_more_docs')}
                  style={[styles.moreBtn, savingDecision && { opacity: 0.6 }]}
                >
                  <Text style={styles.moreText}>Request more docs</Text>
                </Pressable>
                <Pressable
                  disabled={savingDecision}
                  onPress={() =>
                    Alert.alert('Reject therapist?', 'This will reject the verification.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reject', style: 'destructive', onPress: () => setDecision('rejected') },
                    ])
                  }
                  style={[styles.rejectLink, savingDecision && { opacity: 0.6 }]}
                >
                  <Text style={styles.rejectLinkText}>Reject therapist</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.pink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surface,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#ffffff' },
  subtitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#ffffff' },
  mutedText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 24, gap: 12 },

  hero: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  heroName: { fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  heroMeta: { marginTop: 4, fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  statusPillText: { fontSize: 11, fontWeight: '900', color: tokens.colors.text, textTransform: 'capitalize' },

  sectionCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  helpText: { marginTop: 6, color: tokens.colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  noteText: { marginTop: 10, fontSize: 13, color: tokens.colors.textSecondary, lineHeight: 18, fontWeight: '600' },

  docHero: {
    marginTop: 10,
    width: '100%',
    height: 260,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  docHeroImage: { width: '100%', height: '100%', resizeMode: 'contain', backgroundColor: '#0b0f19' },
  docHeroFile: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  docHeroFileTitle: { fontSize: 14, fontWeight: '900', color: tokens.colors.text, marginTop: 10 },
  docHeroFileSub: { fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary, marginTop: 4 },

  docThumbRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  docThumb: {
    width: 68,
    height: 68,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  docThumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  docThumbFile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  docThumbFileText: { fontSize: 10, fontWeight: '900', color: tokens.colors.text, marginTop: 6 },

  docButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  docBtnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  messageBox: {
    marginTop: 10,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  messageInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
    color: tokens.colors.text,
  },
  helperMuted: { marginTop: 6, color: tokens.colors.textSecondary, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  checkRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    alignItems: 'flex-start',
  },
  checkRowSelected: { borderColor: 'rgba(244,114,182,0.35)', backgroundColor: 'rgba(244,114,182,0.08)' },
  checkTitle: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  checkText: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textSecondary, lineHeight: 16 },

  checklistRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    alignItems: 'flex-start',
  },
  checklistTitle: { fontSize: 13, fontWeight: '900', color: tokens.colors.text },
  checklistText: { marginTop: 2, fontSize: 12, fontWeight: '600', color: tokens.colors.textSecondary, lineHeight: 16 },
  openChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.16)',
    color: tokens.colors.pink,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  missingChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    color: tokens.colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  otherDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  otherDocText: { flex: 1, fontSize: 12, fontWeight: '700', color: tokens.colors.text },
  otherDocOpen: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },

  reviewRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  reviewStars: { fontSize: 12, fontWeight: '900', color: tokens.colors.pink },
  reviewDate: { fontSize: 11, fontWeight: '800', color: tokens.colors.textMuted },
  reviewText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: tokens.colors.text, lineHeight: 16 },
  templateBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: tokens.colors.text,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  approveBtn: { backgroundColor: tokens.colors.success, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  moreBtn: {
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: tokens.colors.text, fontSize: 14, fontWeight: '900' },
  rejectLink: {
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
  },
  rejectLinkText: { color: '#b91c1c', fontSize: 13, fontWeight: '900' },
});

