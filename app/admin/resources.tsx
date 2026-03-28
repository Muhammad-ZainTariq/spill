import {
  createTherapistResource,
  deleteTherapistResource,
  extractYoutubeId,
  listTherapistResources,
  getResourceCategoryLabel,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  RESOURCE_TYPES,
  resolvePickerCategoryId,
  TherapistResource,
  updateTherapistResource,
  uploadTherapistResourceCoverPng,
  uploadTherapistResourcePdf,
  youtubeThumbnailUrl,
} from '@/app/therapist/_marketplace';
import {
  isResourceAiConfigured,
  suggestResourceAuthor,
  suggestResourceCategory,
  suggestResourceDescription,
} from '@/app/admin/resourceAiFill';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { BookCoverImage } from '@/app/components/LearningResourceWidgets';
import { MAX_PDF_BASE64_CHARS_FOR_COVER, PdfCoverWebView } from '@/app/components/PdfCoverWebView';

const TYPE_LABELS: Record<string, string> = {
  video: 'YouTube video',
  book: 'Book (PDF)',
  article: 'Article (PDF)',
};

/** Turn a filename into a readable title: strip extension, spaces for _/-, fix glued "and", then CamelCase. */
function titleFromFileName(fileName: string): string {
  let base = fileName.replace(/\.[^/.]+$/, '').trim();
  if (!base) return '';
  base = base.replace(/[_-]+/g, ' ');
  // "RepeatingandWorking" -> "Repeating and Working" before splitting on caps
  base = base.replace(/([a-z])and([A-Z])/g, '$1 and $2');
  base = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  base = base.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return base.replace(/\s+/g, ' ').trim();
}

async function fetchYoutubeTitle(videoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`);
    const data = await res.json();
    return data?.title ?? null;
  } catch {
    return null;
  }
}

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
  const [coverUrl, setCoverUrl] = useState('');
  const [type, setType] = useState<(typeof RESOURCE_TYPES)[number]>('video');
  const [category, setCategory] = useState(() => RESOURCE_CATEGORIES[0] || 'psychotherapy');
  const [author, setAuthor] = useState('');
  const [aiField, setAiField] = useState<null | 'description' | 'author' | 'category'>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [pendingCoverPdf, setPendingCoverPdf] = useState<string | null>(null);
  const [coverJobKey, setCoverJobKey] = useState(0);
  const coverResolveRef = useRef<((png: string | null) => void) | null>(null);

  const handleCoverWebViewDone = useCallback((png: string | null) => {
    coverResolveRef.current?.(png);
    coverResolveRef.current = null;
    setPendingCoverPdf(null);
  }, []);

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

  // Auto-fill title from YouTube when URL is valid (new resources only; edit keeps existing title unless URL changes)
  useEffect(() => {
    if (type !== 'video' || !showAdd || editing) return;
    const yid = extractYoutubeId(url);
    if (!yid || !url.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetchYoutubeTitle(url.trim()).then((fetched) => {
        if (!cancelled && fetched) setTitle(fetched);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [url, type, showAdd, editing]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setFileUrl(null);
    setPdfFileName(null);
    setCoverUrl('');
    setType('video');
    setCategory(RESOURCE_CATEGORIES[0] || 'psychotherapy');
    setAuthor('');
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
    setCoverUrl(r.cover_url || '');
    setType(r.type);
    setCategory(resolvePickerCategoryId(r.category));
    setAuthor(r.author || '');
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
      const [{ fileUrl }, coverPngB64] = await Promise.all([uploadPromise, coverPromise]);

      setFileUrl(fileUrl);
      let coverUrl = '';
      if (coverPngB64) {
        try {
          coverUrl = await uploadTherapistResourceCoverPng(coverPngB64, pdfResourceType);
        } catch (coverErr) {
          console.warn('Cover upload failed', coverErr);
        }
      }
      setCoverUrl(coverUrl);
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

  const pdfKind = type === 'article' ? 'article' : 'book';

  const handleAiDescription = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title first', 'Enter the book or article title, then use AI to fill the description.');
      return;
    }
    if (!isResourceAiConfigured()) {
      Alert.alert(
        'AI not configured',
        'Add openaiApiKey to app.json extra (same as other AI features in this app).'
      );
      return;
    }
    setAiField('description');
    try {
      const text = await suggestResourceDescription(title.trim(), pdfKind);
      if (text) {
        setDescription(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Could not generate', 'Try again or write the description yourself.');
      }
    } catch (e: any) {
      Alert.alert('AI failed', e?.message || 'Something went wrong.');
    } finally {
      setAiField(null);
    }
  };

  const handleAiAuthor = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title first', 'Enter the title, then use AI to suggest the author.');
      return;
    }
    if (!isResourceAiConfigured()) {
      Alert.alert(
        'AI not configured',
        'Add openaiApiKey to app.json extra (same as other AI features in this app).'
      );
      return;
    }
    setAiField('author');
    try {
      const text = await suggestResourceAuthor(title.trim(), pdfKind);
      if (text) {
        setAuthor(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Could not guess author', 'Enter the author manually if you know it.');
      }
    } catch (e: any) {
      Alert.alert('AI failed', e?.message || 'Something went wrong.');
    } finally {
      setAiField(null);
    }
  };

  const handleAiCategory = async () => {
    if (!title.trim() && !description.trim()) {
      Alert.alert('Add a title or description', 'AI needs something to read to pick a category.');
      return;
    }
    if (!isResourceAiConfigured()) {
      Alert.alert(
        'AI not configured',
        'Add openaiApiKey to app.json extra (same as other AI features in this app).'
      );
      return;
    }
    setAiField('category');
    try {
      const id = await suggestResourceCategory({
        title: title.trim() || 'Untitled',
        description: description.trim() || null,
        resourceType: type,
      });
      if (id && RESOURCE_CATEGORIES.includes(id)) {
        setCategory(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Could not categorize', 'Pick a category from the list yourself.');
      }
    } catch (e: any) {
      Alert.alert('AI failed', e?.message || 'Something went wrong.');
    } finally {
      setAiField(null);
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
      };
      if (editing) {
        payload.order = null;
      }
      if (type === 'video') {
        payload.url = url.trim();
        payload.youtube_id = extractYoutubeId(url) || null;
        payload.file_url = null;
        payload.cover_url = null;
      } else {
        payload.url = null;
        payload.youtube_id = null;
        payload.file_url = fileUrl || (editing?.file_url ?? null);
        payload.cover_url = coverUrl.trim() || null;
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
          renderItem={({ item }) => {
            const isVideoHero = item.type === 'video' && !!item.youtube_id;
            const isPdfHero =
              (item.type === 'book' || item.type === 'article') && !!item.file_url;
            const isHero = isVideoHero || isPdfHero;

            const body = (
              <>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.badges}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{TYPE_LABELS[item.type] || item.type}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeCat]}>
                      <Text style={styles.badgeText}>{getResourceCategoryLabel(item.category)}</Text>
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
              </>
            );

            return (
              <View style={[styles.card, isHero && styles.cardHero]}>
                {isVideoHero ? (
                  <>
                    <View style={styles.thumbWrapFull}>
                      <Image
                        source={{ uri: youtubeThumbnailUrl(item.youtube_id!, false) }}
                        style={styles.thumbHero}
                        resizeMode="cover"
                      />
                      <View style={styles.playOverlay}>
                        <Feather name="play-circle" size={64} color="rgba(255,255,255,0.95)" />
                      </View>
                    </View>
                    <View style={styles.cardBody}>{body}</View>
                  </>
                ) : isPdfHero ? (
                  <>
                    <View style={[styles.thumbWrapFull, styles.thumbWrapFullLight]}>
                      <BookCoverImage coverUrl={item.cover_url} />
                    </View>
                    <View style={styles.cardBody}>{body}</View>
                  </>
                ) : (
                  body
                )}
              </View>
            );
          }}
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
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Description</Text>
                {(type === 'book' || type === 'article') && (
                  <Pressable
                    onPress={handleAiDescription}
                    disabled={saving || aiField !== null}
                    style={[styles.aiPill, aiField === 'description' && styles.aiPillLoading]}
                  >
                    {aiField === 'description' ? (
                      <ActivityIndicator size="small" color="#ec4899" style={{ marginRight: 4 }} />
                    ) : null}
                    <Text style={styles.aiPillText}>AI</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.inputArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Brief summary (fill title first, then tap AI)"
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
                        <View style={styles.uploadBtnTextWrap}>
                          <Text
                            style={styles.uploadBtnText}
                            numberOfLines={1}
                            ellipsizeMode="middle"
                          >
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
                    placeholder="Auto-filled from first PDF page — paste a different image URL to override"
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
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Category</Text>
                <Pressable
                  onPress={handleAiCategory}
                  disabled={saving || aiField !== null}
                  style={[styles.aiPill, aiField === 'category' && styles.aiPillLoading]}
                >
                  {aiField === 'category' ? (
                    <ActivityIndicator size="small" color="#ec4899" style={{ marginRight: 4 }} />
                  ) : null}
                  <Text style={styles.aiPillText}>AI</Text>
                </Pressable>
              </View>
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
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Author (optional)</Text>
                {(type === 'book' || type === 'article') && (
                  <Pressable
                    onPress={handleAiAuthor}
                    disabled={saving || aiField !== null}
                    style={[styles.aiPill, aiField === 'author' && styles.aiPillLoading]}
                  >
                    {aiField === 'author' ? (
                      <ActivityIndicator size="small" color="#ec4899" style={{ marginRight: 4 }} />
                    ) : null}
                    <Text style={styles.aiPillText}>AI</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                style={styles.input}
                value={author}
                onChangeText={setAuthor}
                placeholder="e.g. Bessel van der Kolk"
                placeholderTextColor={tokens.colors.textMuted}
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

      <Modal
        visible={categoryPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <View style={styles.categoryModalWrap}>
          <Pressable
            style={styles.categoryModalBackdrop}
            onPress={() => setCategoryPickerOpen(false)}
          />
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
                  <Text
                    style={[styles.categoryModalRowText, category === c && styles.categoryModalRowTextActive]}
                  >
                    {RESOURCE_CATEGORY_LABELS[c] ?? c}
                  </Text>
                  {category === c ? (
                    <Feather name="check" size={18} color={tokens.colors.pink} />
                  ) : null}
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
  /** Match therapist learning-resources hero cards (full 16:9 video + full 2:3 book cover). */
  cardHero: {
    padding: 0,
    borderRadius: 18,
  },
  thumbWrapFull: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  thumbWrapFullLight: {
    backgroundColor: '#f1f5f9',
  },
  thumbHero: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  coverPreviewWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#f1f5f9',
  },
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  labelInline: { fontSize: 13, fontWeight: '700', color: tokens.colors.textSecondary },
  // Match feed screen (`app/(tabs)/index.tsx` aiPill)
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  aiPillLoading: {
    opacity: 0.8,
  },
  aiPillText: {
    color: '#ec4899',
    fontSize: 12,
    fontWeight: '700',
  },
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
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(244,114,182,0.4)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(244,114,182,0.06)',
    overflow: 'hidden',
  },
  uploadBtnTextWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  uploadBtnText: { fontSize: 15, fontWeight: '600', color: tokens.colors.pink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 0,
  },
  chipActive: {
    borderWidth: 1,
    borderColor: tokens.colors.pink,
    backgroundColor: 'rgba(244,114,182,0.12)',
  },
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

  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 0,
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  categoryModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  categoryModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  categoryModalSheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    paddingBottom: 24,
    zIndex: 1,
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
  categoryModalList: { maxHeight: 420 },
  categoryModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  categoryModalRowActive: { backgroundColor: 'rgba(244,114,182,0.08)' },
  categoryModalRowText: { flex: 1, fontSize: 16, color: tokens.colors.text, fontWeight: '500' },
  categoryModalRowTextActive: { color: tokens.colors.pink, fontWeight: '700' },
});
