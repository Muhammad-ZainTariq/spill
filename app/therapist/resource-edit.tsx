import { MAX_PDF_BASE64_CHARS_FOR_COVER, PdfCoverWebView } from '@/app/components/PdfCoverWebView';
import { BookCoverImage } from '@/app/components/LearningResourceWidgets';
import {
  createTherapistResource,
  deleteTherapistResource,
  extractYoutubeId,
  isResourceVisibleInTherapistLibrary,
  isResourceVisibleToAppUsers,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  RESOURCE_TYPES,
  resolvePickerCategoryId,
  TherapistResource,
  updateTherapistResource,
  uploadTherapistResourceCoverPng,
  uploadTherapistResourcePdf,
} from '@/app/therapist/_marketplace';
import { auth, db } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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

/** Same helper as admin — readable title from PDF filename. */
function titleFromFileName(fileName: string): string {
  let base = fileName.replace(/\.[^/.]+$/, '').trim();
  if (!base) return '';
  base = base.replace(/[_-]+/g, ' ');
  base = base.replace(/([a-z])and([A-Z])/g, '$1 and $2');
  base = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  base = base.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return base.replace(/\s+/g, ' ').trim();
}

export default function TherapistResourceEditScreen() {
  const router = useRouter();
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const editId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loadingDoc, setLoadingDoc] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [type, setType] = useState<(typeof RESOURCE_TYPES)[number]>('video');
  const [category, setCategory] = useState(() => RESOURCE_CATEGORIES[0] || 'psychotherapy');
  const [author, setAuthor] = useState('');
  const [visibleToAppUsers, setVisibleToAppUsers] = useState(true);
  const [visibleInTherapistLibrary, setVisibleInTherapistLibrary] = useState(true);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [pendingCoverPdf, setPendingCoverPdf] = useState<string | null>(null);
  const [coverJobKey, setCoverJobKey] = useState(0);
  const coverResolveRef = useRef<((png: string | null) => void) | null>(null);

  const handleCoverWebViewDone = useCallback((png: string | null) => {
    coverResolveRef.current?.(png);
    coverResolveRef.current = null;
    setPendingCoverPdf(null);
  }, []);

  useEffect(() => {
    if (!editId) {
      setLoadingDoc(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'therapist_resources', editId));
        if (!snap.exists()) {
          Alert.alert('Not found', 'This resource is no longer available.');
          router.back();
          return;
        }
        const r = { id: snap.id, ...(snap.data() as any) } as TherapistResource;
        const uid = auth.currentUser?.uid;
        const isOwnTherapistItem =
          r.created_by_role === 'therapist' && !!uid && r.created_by_uid === uid;
        if (!isOwnTherapistItem) {
          Alert.alert('Cannot edit', 'You can only edit learning resources you created.');
          router.back();
          return;
        }
        if (cancelled) return;
        setTitle(r.title);
        setDescription(r.description || '');
        setUrl(r.url || '');
        setFileUrl(r.file_url || null);
        setPdfFileName(r.file_url ? 'Uploaded PDF' : null);
        setCoverUrl(r.cover_url || '');
        setType(r.type);
        setCategory(resolvePickerCategoryId(r.category));
        setAuthor(r.author || '');
        setVisibleToAppUsers(isResourceVisibleToAppUsers(r));
        setVisibleInTherapistLibrary(isResourceVisibleInTherapistLibrary(r));
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load resource.');
        router.back();
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router]);

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
      const pdfResourceType = type === 'article' ? 'article' : 'book';

      const extractCoverPng = () =>
        new Promise<string | null>((resolve) => {
          if (base64.length > MAX_PDF_BASE64_CHARS_FOR_COVER) {
            resolve(null);
            return;
          }
          coverResolveRef.current = resolve;
          setCoverJobKey((k) => k + 1);
          setPendingCoverPdf(base64);
        });

      const uploadPromise = uploadTherapistResourcePdf(
        base64,
        file.name || 'resource.pdf',
        file.mimeType || 'application/pdf',
        pdfResourceType
      );
      const coverPromise = extractCoverPng();
      const [{ fileUrl: uploaded }, coverPngB64] = await Promise.all([uploadPromise, coverPromise]);

      setFileUrl(uploaded);
      let nextCover = '';
      if (coverPngB64) {
        try {
          nextCover = await uploadTherapistResourceCoverPng(coverPngB64, pdfResourceType);
        } catch (coverErr) {
          console.warn('Cover upload failed', coverErr);
        }
      }
      setCoverUrl(nextCover);
      setPdfFileName(file.name || 'Uploaded');
      const fromName = titleFromFileName(file.name || 'resource.pdf');
      if (fromName) setTitle(fromName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not upload PDF.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Sign in required', 'Log in to save resources.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing title', 'Enter a title.');
      return;
    }
    if (type === 'video') {
      const yid = extractYoutubeId(url);
      if (!yid) {
        Alert.alert('Invalid YouTube URL', 'Paste a valid YouTube link.');
        return;
      }
    }
    if ((type === 'book' || type === 'article') && !editId && !fileUrl) {
      Alert.alert('Upload PDF', 'Pick and upload a PDF for this resource.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        category,
        author: author.trim() || null,
        visible_to_app_users: visibleToAppUsers,
        visible_in_therapist_library: visibleInTherapistLibrary,
      };
      if (type === 'video') {
        payload.url = url.trim();
        payload.youtube_id = extractYoutubeId(url) || null;
        payload.file_url = null;
        payload.cover_url = null;
      } else {
        payload.url = null;
        payload.youtube_id = null;
        payload.file_url = fileUrl ?? null;
        payload.cover_url = coverUrl.trim() || null;
      }
      if (editId) {
        await updateTherapistResource(editId, payload as any);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Saved', 'Resource updated.');
      } else {
        await createTherapistResource({
          ...(payload as any),
          created_by_uid: uid,
          created_by_role: 'therapist',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Added', 'Your resource was saved.');
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert('Delete resource?', `"${title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTherapistResource(editId);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  if (loadingDoc) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.pink} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={tokens.colors.text} />
        </Pressable>
        <Text style={styles.title}>{editId ? 'Edit resource' : 'Add resource'}</Text>
        {editId ? (
          <Pressable onPress={handleDelete} style={styles.headerBtn} hitSlop={10}>
            <Feather name="trash-2" size={20} color={tokens.colors.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
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
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={tokens.colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>PDF file *</Text>
            <Pressable style={[styles.uploadBtn, saving && { opacity: 0.6 }]} onPress={pickPdf} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={tokens.colors.pink} />
              ) : (
                <>
                  <Feather name="upload" size={20} color={tokens.colors.pink} />
                  <View style={styles.uploadBtnTextWrap}>
                    <Text style={styles.uploadBtnText} numberOfLines={1} ellipsizeMode="middle">
                      {pdfFileName || fileUrl ? (pdfFileName || 'Uploaded') : 'Pick PDF to upload'}
                    </Text>
                  </View>
                </>
              )}
            </Pressable>
            <Text style={styles.label}>Cover image (optional override)</Text>
            <TextInput
              style={styles.input}
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="Paste image URL to override auto cover"
              placeholderTextColor={tokens.colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
            />
            {fileUrl ? (
              <>
                <Text style={styles.label}>Cover preview</Text>
                <View style={[styles.coverPreviewWrap, styles.thumbWrapFullLight]}>
                  <BookCoverImage coverUrl={coverUrl} />
                </View>
              </>
            ) : null}
          </>
        )}
        <Text style={styles.label}>Category</Text>
        <Pressable
          style={[styles.dropdown, saving && { opacity: 0.6 }]}
          onPress={() => !saving && setCategoryPickerOpen(true)}
          disabled={saving}
        >
          <Text style={styles.dropdownText} numberOfLines={2}>
            {RESOURCE_CATEGORY_LABELS[category] ?? category}
          </Text>
          <Feather name="chevron-down" size={20} color={tokens.colors.textSecondary} />
        </Pressable>
        <Text style={styles.label}>Author (optional)</Text>
        <TextInput
          style={styles.input}
          value={author}
          onChangeText={setAuthor}
          placeholder="e.g. Author name"
          placeholderTextColor={tokens.colors.textMuted}
        />
        <Text style={styles.label}>Visibility</Text>
        <Text style={styles.hintMuted}>Choose whether members and/or therapists can see this in their libraries.</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Member app</Text>
          <Switch
            value={visibleToAppUsers}
            onValueChange={setVisibleToAppUsers}
            trackColor={{ false: '#cbd5e1', true: 'rgba(244,114,182,0.5)' }}
            thumbColor={visibleToAppUsers ? tokens.colors.pink : '#f4f4f5'}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Therapist library</Text>
          <Switch
            value={visibleInTherapistLibrary}
            onValueChange={setVisibleInTherapistLibrary}
            trackColor={{ false: '#cbd5e1', true: 'rgba(244,114,182,0.5)' }}
            thumbColor={visibleInTherapistLibrary ? tokens.colors.pink : '#f4f4f5'}
          />
        </View>
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{editId ? 'Save changes' : 'Add resource'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={categoryPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <View style={styles.categoryModalWrap}>
          <Pressable style={styles.categoryModalBackdrop} onPress={() => setCategoryPickerOpen(false)} />
          <View style={styles.categoryModalSheet}>
            <View style={styles.categoryModalHeader}>
              <Text style={styles.categoryModalTitle}>Category</Text>
              <Pressable onPress={() => setCategoryPickerOpen(false)} hitSlop={12}>
                <Feather name="x" size={22} color={tokens.colors.text} />
              </Pressable>
            </View>
            <FlatList
              data={RESOURCE_CATEGORIES}
              keyExtractor={(c) => c}
              keyboardShouldPersistTaps="handled"
              style={styles.categoryModalList}
              renderItem={({ item: c }) => (
                <Pressable
                  style={[styles.categoryModalRow, category === c && styles.categoryModalRowActive]}
                  onPress={() => {
                    setCategory(c);
                    setCategoryPickerOpen(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.categoryModalRowText, category === c && styles.categoryModalRowTextActive]}>
                    {RESOURCE_CATEGORY_LABELS[c] ?? c}
                  </Text>
                  {category === c ? <Feather name="check" size={18} color={tokens.colors.pink} /> : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {pendingCoverPdf ? (
        <PdfCoverWebView key={coverJobKey} pdfBase64={pendingCoverPdf} onDone={handleCoverWebViewDone} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 13, color: tokens.colors.textMuted },
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
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: tokens.colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary, marginBottom: 8, marginTop: 12 },
  hintMuted: { fontSize: 12, color: tokens.colors.textMuted, marginBottom: 8, marginTop: -4 },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.surface,
  },
  inputArea: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  chipActive: { backgroundColor: 'rgba(244,114,182,0.15)', borderColor: tokens.colors.pink },
  chipText: { fontSize: 14, fontWeight: '600', color: tokens.colors.textSecondary },
  chipTextActive: { color: tokens.colors.pink },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderStyle: 'dashed',
  },
  uploadBtnTextWrap: { flex: 1 },
  uploadBtnText: { fontSize: 15, fontWeight: '600', color: tokens.colors.text },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  dropdownText: { flex: 1, fontSize: 15, fontWeight: '600', color: tokens.colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  switchLabel: { flex: 1, fontSize: 14, color: tokens.colors.text, fontWeight: '600' },
  saveBtn: {
    marginTop: 24,
    backgroundColor: tokens.colors.pink,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  coverPreviewWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#f1f5f9',
  },
  thumbWrapFullLight: {
    backgroundColor: '#f1f5f9',
  },
  categoryModalWrap: { flex: 1, justifyContent: 'flex-end' },
  categoryModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  categoryModalSheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 28,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  categoryModalTitle: { fontSize: 17, fontWeight: '800', color: tokens.colors.text },
  categoryModalList: { maxHeight: 400 },
  categoryModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  categoryModalRowActive: { backgroundColor: 'rgba(244,114,182,0.06)' },
  categoryModalRowText: { flex: 1, fontSize: 16, color: tokens.colors.text, fontWeight: '500' },
  categoryModalRowTextActive: { color: tokens.colors.pink, fontWeight: '700' },
});
