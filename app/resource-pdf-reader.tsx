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
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={26} color={tokens.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
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
        <PdfJsReaderWebView pdfBase64={pdfBase64 ?? ''} onRenderFailed={() => setReaderFailed(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 8,
  },
  backBtn: {
    padding: 8,
    marginLeft: -4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  headerSpacer: {
    width: 40,
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
