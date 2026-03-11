import {
  createTherapistResource,
  deleteTherapistResource,
  extractYoutubeId,
  listTherapistResources,
  youtubeThumbnailUrl,
  RESOURCE_CATEGORIES,
  RESOURCE_TYPES,
  TherapistResource,
  updateTherapistResource,
  uploadTherapistResourcePdf,
} from '@/app/therapist/marketplace';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';

const TYPE_LABELS: Record<string, string> = {
  video: 'YouTube video',
  book: 'Book (PDF)',
  article: 'Article (PDF)',
};

const CAT_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  'self-care': 'Self-care',
  research: 'Research',
  legal: 'Legal / Ethics',
};

export default function AdminResourcesScreen() {
  const router = useRouter();
  const [resources, setResources] = useState<TherapistResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TherapistResource | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [type, setType] = useState<(typeof RESOURCE_TYPES)[number]>('video');
  const [category, setCategory] = useState<(typeof RESOURCE_CATEGORIES)[number]>('clinical');
  const [author, setAuthor] = useState('');
  const [order, setOrder] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const list = await listTherapistResources(200);
      setResources(list);
    } catch (e) {
      console.error(e);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setFileUrl(null);
    setPdfFileName(null);
    setType('video');
    setCategory('clinical');
    setAuthor('');
    setOrder('');
    setEditing(null);
    setShowAdd(false);
  };

  const openEdit = (r: TherapistResource) => {
    setEditing(r);
    setTitle(r.title);
    setDescription(r.description || '');
    setUrl(r.url || '');
    setFileUrl(r.file_url || null);
    setPdfFileName(r.file_url ? 'Uploaded PDF' : null);
    setType(r.type);
    setCategory(r.category);
    setAuthor(r.author || '');
    setOrder(r.order != null ? String(r.order) : '');
    setShowAdd(true);
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setSaving(true);
      const downloadUrl = await uploadTherapistResourcePdf(
        base64,
        file.name || 'resource.pdf',
        file.mimeType || 'application/pdf'
      );
      setFileUrl(downloadUrl);
      setPdfFileName(file.name || 'Uploaded');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not upload PDF.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Enter a title.');
      return;
    }
    if (type === 'video') {
      const yid = extractYoutubeId(url);
      if (!yid) {
        Alert.alert('Invalid YouTube URL', 'Paste a valid YouTube link (e.g. youtube.com/watch?v=... or youtu.be/...)');
        return;
      }
    }
    if ((type === 'book' || type === 'article') && !editing && !fileUrl) {
      Alert.alert('Upload PDF', 'Pick and upload a PDF file for this resource.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        category,
        author: author.trim() || null,
        order: order ? parseInt(order, 10) : null,
      };
      if (type === 'video') {
        payload.url = url.trim();
        payload.youtube_id = extractYoutubeId(url) || null;
        payload.file_url = null;
      } else {
        payload.url = null;
        payload.youtube_id = null;
        payload.file_url = fileUrl || (editing?.file_url ?? null);
      }
      if (editing) {
        await updateTherapistResource(editing.id, payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Updated', 'Resource updated.');
      } else {
        await createTherapistResource(payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Added', 'Resource added. Therapists can now see it.');
      }
      resetForm();
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (r: TherapistResource) => {
    Alert.alert('Delete resource?', `"${r.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTherapistResource(r.id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <Text style={styles.title}>Resources</Text>
        <Pressable
          onPress={() => {
            resetForm();
            setShowAdd(true);
          }}
          style={styles.addBtn}
        >
          <Feather name="plus" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={resources}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.type === 'video' && item.youtube_id ? (
                <Image
                  source={{ uri: youtubeThumbnailUrl(item.youtube_id, false) }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              ) : null}
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.badges}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{TYPE_LABELS[item.type] || item.type}</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeCat]}>
                    <Text style={styles.badgeText}>{CAT_LABELS[item.category] || item.category}</Text>
                  </View>
                </View>
              </View>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {item.url ? (
                <Pressable onPress={() => Linking.openURL(item.url!)} style={styles.linkRow}>
                  <Feather name="external-link" size={14} color={tokens.colors.pink} />
                  <Text style={styles.linkText} numberOfLines={1}>
                    {item.url}
                  </Text>
                </Pressable>
              ) : item.file_url ? (
                <View style={styles.linkRow}>
                  <Feather name="file-text" size={14} color={tokens.colors.pink} />
                  <Text style={styles.linkText} numberOfLines={1}>
                    PDF uploaded
                  </Text>
                </View>
              ) : null}
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={16} color={tokens.colors.textSecondary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(item)} style={[styles.actionBtn, styles.actionDanger]}>
                  <Feather name="trash-2" size={16} color={tokens.colors.danger} />
                  <Text style={[styles.actionText, { color: tokens.colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book-open" size={48} color={tokens.colors.textMuted} />
              <Text style={styles.emptyTitle}>No resources yet</Text>
              <Text style={styles.muted}>Add YouTube videos and PDF books/articles for therapists.</Text>
              <Pressable onPress={() => setShowAdd(true)} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Add first resource</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit resource' : 'Add resource'}</Text>
              <Pressable onPress={resetForm}>
                <Feather name="x" size={24} color={tokens.colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Type</Text>
              <View style={styles.chips}>
                {RESOURCE_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setType(t);
                      if (t === 'video') setFileUrl(null);
                      else setUrl('');
                    }}
                    style={[styles.chip, type === t && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{TYPE_LABELS[t]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Introduction to CBT"
                placeholderTextColor={tokens.colors.textMuted}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Brief summary"
                placeholderTextColor={tokens.colors.textMuted}
                multiline
              />
              {type === 'video' ? (
                <>
                  <Text style={styles.label}>YouTube URL *</Text>
                  <TextInput
                    style={styles.input}
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://youtube.com/watch?v=... or youtu.be/..."
                    placeholderTextColor={tokens.colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>PDF file *</Text>
                  <Pressable
                    style={[styles.uploadBtn, saving && { opacity: 0.6 }]}
                    onPress={pickPdf}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={tokens.colors.pink} />
                    ) : (
                      <>
                        <Feather name="upload" size={20} color={tokens.colors.pink} />
                        <Text style={styles.uploadBtnText}>
                          {pdfFileName || fileUrl ? (pdfFileName || 'Uploaded') : 'Pick PDF to upload'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
              <Text style={styles.label}>Category</Text>
              <View style={styles.chips}>
                {RESOURCE_CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, category === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{CAT_LABELS[c]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Author (optional)</Text>
              <TextInput
                style={styles.input}
                value={author}
                onChangeText={setAuthor}
                placeholder="e.g. Bessel van der Kolk"
                placeholderTextColor={tokens.colors.textMuted}
              />
              <Text style={styles.label}>Display order (lower = first)</Text>
              <TextInput
                style={styles.input}
                value={order}
                onChangeText={setOrder}
                placeholder="0, 1, 2..."
                placeholderTextColor={tokens.colors.textMuted}
                keyboardType="number-pad"
              />
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{editing ? 'Update' : 'Add resource'}</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 12,
  },
  headerBtn: { padding: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '900', color: tokens.colors.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.colors.pink,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  muted: { fontSize: 13, color: tokens.colors.textMuted },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: 120, borderRadius: 12, marginBottom: 12 },
  cardTop: { marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text },
  badges: { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.15)',
  },
  badgeCat: { backgroundColor: 'rgba(16,185,129,0.12)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: tokens.colors.textSecondary },
  cardDesc: { fontSize: 13, color: tokens.colors.textSecondary, lineHeight: 18, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  linkText: { flex: 1, fontSize: 12, color: tokens.colors.pink, fontWeight: '600' },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionDanger: {},
  actionText: { fontSize: 13, fontWeight: '600', color: tokens.colors.textSecondary },

  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text },
  emptyBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.pink,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: tokens.colors.text },
  modalScroll: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tokens.colors.text,
  },
  inputArea: { minHeight: 80, textAlignVertical: 'top' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(244,114,182,0.4)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(244,114,182,0.06)',
  },
  uploadBtnText: { fontSize: 15, fontWeight: '600', color: tokens.colors.pink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  chipActive: { borderColor: tokens.colors.pink, backgroundColor: 'rgba(244,114,182,0.12)' },
  chipText: { fontSize: 13, fontWeight: '600', color: tokens.colors.textSecondary },
  chipTextActive: { color: tokens.colors.pink },
  saveBtn: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: tokens.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
