import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const PDFJS_VER = '3.11.174';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;

/** Chunk size for injectJavaScript (stay under RN/WebView string limits). */
const B64_CHUNK = 65_000;

/**
 * Small HTML — no PDF embedded here (that was breaking WebView limits).
 * We inject base64 via injectJavaScript after load.
 */
const SHELL_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<script src="${CDN}/pdf.min.js"></script>
</head><body style="margin:0;background:#f1f5f9;">
<script>
(function(){
  function send(obj) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    } catch (e) {}
  }
  var tries = 0;
  function boot() {
    if (typeof pdfjsLib === 'undefined') {
      if (++tries > 400) { send({ ok: false, err: 'pdfjs_load_timeout' }); return; }
      setTimeout(boot, 40);
      return;
    }
    window.__covb64 = '';
    window.__covAppend = function (chunk) {
      window.__covb64 += chunk;
    };
    window.__covRun = function () {
      var b64 = window.__covb64;
      window.__covb64 = '';
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '${CDN}/pdf.worker.min.js';
        var raw = atob(b64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        pdfjsLib.getDocument({ data: arr }).promise
          .then(function (pdf) { return pdf.getPage(1); })
          .then(function (page) {
            var scale = 2;
            var viewport = page.getViewport({ scale: scale });
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            var task = page.render({ canvasContext: ctx, viewport: viewport });
            return task.promise.then(function () { return canvas.toDataURL('image/png'); });
          })
          .then(function (dataUrl) {
            var parts = dataUrl.split(',');
            var out = parts.length > 1 ? parts[1] : '';
            send({ ok: true, b64: out });
          })
          .catch(function (e) {
            send({ ok: false, err: String(e && e.message ? e.message : e) });
          });
      } catch (e) {
        send({ ok: false, err: String(e && e.message ? e.message : e) });
      }
    };
    send({ ok: true, ready: true });
  }
  boot();
})();
</script>
</body></html>`;

export const MAX_PDF_BASE64_CHARS_FOR_COVER = 12_000_000;

type Props = {
  pdfBase64: string;
  onDone: (pngBase64: string | null) => void;
};

function escapeForInject(chunk: string): string {
  return JSON.stringify(chunk);
}

async function injectPdfBase64(webView: WebView | null, pdfBase64: string): Promise<void> {
  if (!webView) return;
  await new Promise<void>((r) => setTimeout(r, 250));
  // Reset buffer in page
  webView.injectJavaScript('window.__covb64=""; true;');
  await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 50 : 20));

  for (let i = 0; i < pdfBase64.length; i += B64_CHUNK) {
    const part = pdfBase64.slice(i, i + B64_CHUNK);
    webView.injectJavaScript(`window.__covAppend(${escapeForInject(part)}); true;`);
    if (i + B64_CHUNK < pdfBase64.length) {
      await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 15 : 5));
    }
  }
  await new Promise<void>((r) => setTimeout(r, 40));
  webView.injectJavaScript('window.__covRun(); true;');
}

/**
 * Hidden WebView: pdf.js renders page 1 to PNG; base64 is injected in chunks (not embedded in HTML).
 */
export function PdfCoverWebView({ pdfBase64, onDone }: Props) {
  const doneRef = useRef(false);
  const webRef = useRef<WebView>(null);
  const [shellReady, setShellReady] = useState(false);

  const finish = useCallback(
    (png: string | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone(png);
    },
    [onDone]
  );

  useEffect(() => {
    doneRef.current = false;
    setShellReady(false);
  }, [pdfBase64]);

  useEffect(() => {
    const t = setTimeout(() => finish(null), 90_000);
    return () => clearTimeout(t);
  }, [pdfBase64, finish]);

  useEffect(() => {
    if (!shellReady || doneRef.current) return;
    const w = webRef.current;
    if (!w) return;
    InteractionManager.runAfterInteractions(() => {
      injectPdfBase64(w, pdfBase64).catch(() => finish(null));
    });
  }, [shellReady, pdfBase64, finish]);

  const onMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      try {
        const d = JSON.parse(e.nativeEvent.data);
        if (d.ready) {
          setShellReady(true);
          return;
        }
        if (d.ok && typeof d.b64 === 'string' && d.b64.length > 0) finish(d.b64);
        else finish(null);
      } catch {
        finish(null);
      }
    },
    [finish]
  );

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{ html: SHELL_HTML, baseUrl: 'https://localhost' }}
        onMessage={onMessage}
        onError={() => finish(null)}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 280,
    height: 360,
    opacity: 0.02,
    overflow: 'hidden',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  web: { flex: 1, backgroundColor: '#f1f5f9' },
});
