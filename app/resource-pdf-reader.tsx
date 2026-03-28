import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PdfJsReaderWebView } from '@/app/components/PdfJsReaderWebView';
import { tokens } from '@/app/ui/tokens';
import { auth, getDownloadURL, ref, storage } from '@/lib/firebase';
import { storageObjectPathFromDownloadUrl } from '@/lib/storageDownloadUrl';

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  return '';
}

/**
 * PDF via pdf.js in WebView. Navigation must pass url with encodeURIComponent so ?alt=media&token=... stays intact.
 */
export default function ResourcePdfReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();

  const urlParam = useMemo(() => safeString(params?.url).trim(), [params]);
  const title = useMemo(() => safeString(params?.title) || 'Document', [params]);

  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [preparingPdf, setPreparingPdf] = useState(true);
  const [readerFailed, setReaderFailed] = useState(false);
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number } | null>(null);

  const handleRenderFailed = useCallback(() => {
    setReaderFailed(true);
  }, []);

  const handlePageChange = useCallback((page: number, total: number) => {
    setPageInfo((prev) => {
      if (prev?.page === page && prev.total === total) return prev;
      return { page, total };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReaderFailed(false);

    async function resolve() {
      if (!urlParam) {
        setDisplayUrl(null);
        setResolving(false);
        return;
      }

      setResolving(true);
      setDisplayUrl(null);

      try {
        const path = storageObjectPathFromDownloadUrl(urlParam);
        if (path && auth.currentUser) {
          const fresh = await getDownloadURL(ref(storage, path));
          if (!cancelled) setDisplayUrl(fresh);
        } else {
          if (!cancelled) setDisplayUrl(urlParam);
        }
      } catch {
        if (!cancelled) setDisplayUrl(urlParam);
      } finally {
        if (!cancelled) setResolving(false);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [urlParam]);

  useEffect(() => {
    let cancelled = false;

    async function preparePdf() {
      if (!displayUrl) {
        setPdfBase64(null);
        setPreparingPdf(false);
        return;
      }

      setPreparingPdf(true);
      setPdfBase64(null);

      try {
        const cacheRoot = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!cacheRoot) throw new Error('No cache directory available.');
        const fileUri = `${cacheRoot}resource-pdf-${Date.now()}.pdf`;
        const result = await FileSystem.downloadAsync(displayUrl, fileUri);
        const b64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (!cancelled) setPdfBase64(b64);
      } catch {
        if (!cancelled) {
          setPdfBase64(null);
          setReaderFailed(true);
        }
      } finally {
        if (!cancelled) setPreparingPdf(false);
      }
    }

    void preparePdf();
    return () => {
      cancelled = true;
    };
  }, [displayUrl]);

  const openExternally = useCallback(async () => {
    const u = displayUrl || urlParam;
    if (!u) return;
    try {
      await WebBrowser.openBrowserAsync(u);
    } catch {
      const { Linking } = await import('react-native');
      await Linking.openURL(u);
    }
  }, [displayUrl, urlParam]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.headerShell, { paddingTop: insets.top + 8 }]}>
        <View style={styles.readerBar}>
          <Pressable onPress={() => router.back()} style={styles.floatingBackBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={20} color={tokens.colors.text} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.titleEyebrow}>Book Reader</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>
      </View>

      {!urlParam ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Missing document link.</Text>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.openBtnText}>Go back</Text>
          </Pressable>
        </View>
      ) : resolving || preparingPdf || !displayUrl ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.colors.pink} />
          <Text style={styles.hint}>Preparing PDF…</Text>
        </View>
      ) : readerFailed || !pdfBase64 ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>
            Could not load this PDF in the app (network or storage). You can open it in your browser instead.
          </Text>
          <Pressable style={styles.openBtn} onPress={openExternally}>
            <Text style={styles.openBtnText}>Open in browser</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <PdfJsReaderWebView
            pdfBase64={pdfBase64 ?? ''}
            onRenderFailed={handleRenderFailed}
            onPageChange={handlePageChange}
          />
          {pageInfo ? (
            <View pointerEvents="none" style={styles.bottomOverlay}>
              <View style={styles.pagePill}>
                <Text style={styles.pagePillText}>
                  {pageInfo.page} / {pageInfo.total}
                </Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ece8e1',
  },
  headerShell: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  readerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,250,242,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(120,93,54,0.08)',
    shadowColor: '#5f4b32',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  floatingBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(120,93,54,0.10)',
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  titleEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#8a7356',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2a2117',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  pagePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(33, 24, 12, 0.76)',
  },
  pagePillText: {
    color: '#fffaf2',
    fontSize: 13,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  hint: {
    fontSize: 15,
    color: tokens.colors.textSecondary,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  openBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.pink,
  },
  openBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  backLink: {
    padding: 12,
  },
});
