import { Feather } from '@expo/vector-icons';
import { tokens } from '@/app/ui/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { approvePostAsSafe } from '../functions';

interface FlaggedPost {
  id: string;
  content: string;
  created_at?: string;
  toxicity_score?: number;
  user_id?: string;
  approved_safe_at?: string;
  poster?: {
    display_name?: string | null;
    anonymous_username?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
}

export default function FlaggedScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FlaggedPost[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('flagged_for_toxicity', '==', true),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const list: FlaggedPost[] = (await Promise.all(snap.docs
        .map(async (d) => {
          const data: any = d.data() || {};
          let poster = null;
          if (data.user_id) {
            try {
              const userSnap = await getDoc(doc(db, 'users', String(data.user_id)));
              poster = userSnap.exists() ? (userSnap.data() as any) : null;
            } catch {
              poster = null;
            }
          }
          return {
            id: d.id,
            content: String(data.content || ''),
            created_at: data.created_at,
            toxicity_score: data.toxicity_score,
            user_id: data.user_id,
            approved_safe_at: data.approved_safe_at as string | undefined,
            poster,
          };
        })
      ))
        // Same rule as the feed: approved posts must not stay in the queue even if flagged_for_toxicity was never cleared (legacy / partial writes).
        .filter((p) => !p.approved_safe_at);
      setPosts(list);
    } catch (e: any) {
      console.error('Load flagged posts error', e);
      Alert.alert('Error', e?.message || 'Failed to load flagged posts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (postId: string) => {
    try {
      // Best-effort: call cloud function if wired, otherwise just clear flag field locally
      try {
        await approvePostAsSafe(postId);
      } catch {
        await updateDoc(doc(db, 'posts', postId), {
          approved_safe_at: new Date().toISOString(),
          flagged_for_toxicity: false,
        });
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e: any) {
      console.error('Approve flagged post error', e);
      Alert.alert('Error', e?.message || 'Failed to approve post.');
    }
  };

  const handleDelete = async (post: FlaggedPost) => {
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e: any) {
      console.error('Delete flagged post error', e);
      Alert.alert('Error', e?.message || 'Failed to delete post.');
    }
  };

  const handleWarn = async (post: FlaggedPost) => {
    try {
      const targetUid = String(post.user_id || '').trim();
      if (!targetUid) {
        Alert.alert('No poster found', 'This post does not have a user attached.');
        return;
      }
      await addDoc(collection(db, 'notifications'), {
        recipient_id: targetUid,
        from_user_id: auth.currentUser?.uid || 'admin',
        type: 'moderation_warning',
        title: 'Post warning',
        body: 'One of your posts was flagged by moderation. Please keep posts respectful and safe for the community.',
        post_id: post.id,
        read: false,
        created_at: new Date().toISOString(),
      });
      Alert.alert('Warning sent', 'The poster will see this moderation warning.');
    } catch (e: any) {
      console.error('Send warning error', e);
      Alert.alert('Error', e?.message || 'Failed to send warning.');
    }
  };

  const renderItem = ({ item }: { item: FlaggedPost }) => {
    const posterName =
      item.poster?.display_name ||
      item.poster?.anonymous_username ||
      item.poster?.email ||
      (item.user_id ? `User ${item.user_id.slice(0, 7)}` : 'Unknown poster');
    const score = item.toxicity_score != null ? Math.round(item.toxicity_score * 100) : null;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.posterIcon}>
            <Feather name="user" size={17} color={tokens.colors.pink} />
          </View>
          <View style={styles.posterInfo}>
            <Text style={styles.posterLabel}>Posted by</Text>
            <Text style={styles.posterName} numberOfLines={1}>{posterName}</Text>
            {item.user_id ? <Text style={styles.posterUid} selectable>{item.user_id}</Text> : null}
          </View>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{score != null ? `${score}%` : 'n/a'}</Text>
            <Text style={styles.scoreLabel}>Risk</Text>
          </View>
        </View>

        <View style={styles.postBox}>
          <Text style={styles.content}>{item.content || '(no content)'}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Feather name="clock" size={12} color="#92400e" />
            <Text style={styles.metaPillText}>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown time'}</Text>
          </View>
          <View style={styles.metaPillPink}>
            <Feather name="flag" size={12} color="#BE185D" />
            <Text style={styles.metaPillPinkText}>Auto-flagged</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.safeBtn]}
            onPress={() =>
              Alert.alert('Approve post', 'Mark this as safe and show it in the feed?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Approve', onPress: () => handleApprove(item.id) },
              ])
            }
          >
            <Feather name="check-circle" size={16} color="#047857" />
            <Text style={styles.safeText}>Approve safe</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.warnBtn]}
            onPress={() =>
              Alert.alert('Send warning', 'Send a moderation warning to the person who posted this?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send warning', onPress: () => handleWarn(item) },
              ])
            }
          >
            <Feather name="alert-triangle" size={16} color="#92400e" />
            <Text style={styles.warnText}>Send warning</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() =>
              Alert.alert('Delete post', 'Remove this flagged post permanently?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
              ])
            }
          >
            <Feather name="trash-2" size={16} color="#fff" />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable
            style={styles.headerBackHit}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={24} color="#111827" />
          </Pressable>
        </View>
        <View style={styles.headerCenter} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            Flagged posts
          </Text>
        </View>
        <View style={styles.headerSide} />
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#ec4899" />
          <Text style={styles.loadingText}>Loading flagged posts…</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing flagged</Text>
          <Text style={styles.emptyText}>When moderation flags posts, they’ll show up here for review.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bgSecondary },
  header: {
    minHeight: 44,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  /** Same width as iOS nav bar side — title stays optically centered on screen. */
  headerSide: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: tokens.colors.text, textAlign: 'center', includeFontPadding: false },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: tokens.colors.textMuted, fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: tokens.colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: tokens.colors.textSecondary, textAlign: 'center', lineHeight: 20, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#92400e',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posterIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterInfo: { flex: 1, minWidth: 0 },
  posterLabel: { fontSize: 10, fontWeight: '900', color: '#BE185D', textTransform: 'uppercase', letterSpacing: 0.4 },
  posterName: { marginTop: 2, fontSize: 15, fontWeight: '900', color: tokens.colors.text },
  posterUid: { marginTop: 2, fontSize: 11, fontWeight: '700', color: tokens.colors.textMuted },
  scoreBadge: {
    minWidth: 60,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    paddingVertical: 7,
    paddingHorizontal: 9,
    alignItems: 'center',
  },
  scoreValue: { fontSize: 14, fontWeight: '900', color: '#92400e' },
  scoreLabel: { marginTop: 1, fontSize: 9, fontWeight: '900', color: '#B45309', textTransform: 'uppercase' },
  postBox: {
    marginTop: 13,
    borderRadius: 18,
    backgroundColor: tokens.colors.bgSecondary,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 13,
  },
  content: { fontSize: 15, lineHeight: 21, color: tokens.colors.text, fontWeight: '700' },
  metaRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  metaPillText: { fontSize: 11, fontWeight: '800', color: '#92400e' },
  metaPillPink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#F9A8D4',
  },
  metaPillPinkText: { fontSize: 11, fontWeight: '900', color: '#BE185D' },
  actions: { marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  safeBtn: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
  },
  warnBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  deleteBtn: {
    backgroundColor: tokens.colors.danger,
    flexGrow: 1,
  },
  safeText: { fontSize: 12, fontWeight: '900', color: '#047857' },
  warnText: { fontSize: 12, fontWeight: '900', color: '#92400e' },
  deleteText: { fontSize: 12, fontWeight: '900', color: '#fff' },
});

