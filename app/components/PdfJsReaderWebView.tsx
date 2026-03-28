import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const PDFJS_VER = '3.11.174';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;

const B64_CHUNK = 65_000;

const READER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes"/>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ece8e1; -webkit-overflow-scrolling: touch; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 10px 88px;
  }
  .page-shell {
    margin: 0 0 16px;
  }
  .page-card {
    position: relative;
    overflow: hidden;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(56, 44, 24, 0.10);
  }
  .page-card.placeholder::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(241,245,249,0.9) 50%, rgba(255,255,255,0) 100%);
    transform: translateX(-100%);
    animation: shimmer 1.4s infinite;
  }
  canvas {
    display: block;
    background: #fff;
    border-radius: 10px;
  }
  @keyframes shimmer {
    100% { transform: translateX(100%); }
  }
</style>
<script src="${CDN}/pdf.min.js"></script>
</head><body>
<div id="pages"></div>
<script>
(function () {
  function send(obj) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    } catch (e) {}
  }
  function fromBase64(b64) {
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  var state = {
    pdf: null,
    pageStates: [],
    queue: [],
    activeRenders: 0,
    maxConcurrent: 1,
    firstPaintSent: false,
    estWidth: 0,
    estHeight: 0,
    resizeTick: 0,
    totalPages: 0,
    currentPage: 0,
    prefetchTimer: 0,
  };

  function getCssMetrics(page) {
    var base = page.getViewport({ scale: 1 });
    var maxCssWidth = Math.max(320, window.innerWidth - 24);
    var cssScale = maxCssWidth / base.width;
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    var renderScale = cssScale * pixelRatio;
    var viewport = page.getViewport({ scale: renderScale });
    return {
      viewport: viewport,
      cssWidth: viewport.width / pixelRatio,
      cssHeight: viewport.height / pixelRatio,
    };
  }

  function setShellPlaceholder(st) {
    st.shell.style.width = Math.ceil(st.cssWidth) + 'px';
    st.shell.style.height = Math.ceil(st.cssHeight) + 'px';
    st.shell.innerHTML =
      '<div class="page-card placeholder" style="width:' +
      Math.ceil(st.cssWidth) +
      'px;height:' +
      Math.ceil(st.cssHeight) +
      'px"></div>';
  }

  function buildShells(numPages) {
    var pagesEl = document.getElementById('pages');
    if (!pagesEl) return;
    pagesEl.innerHTML = '';
    state.pageStates = [];
    for (var i = 0; i < numPages; i++) {
      var shell = document.createElement('div');
      shell.className = 'page-shell';
      var st = {
        pageNum: i + 1,
        shell: shell,
        status: 'idle',
        renderTask: null,
        cssWidth: state.estWidth,
        cssHeight: state.estHeight,
      };
      setShellPlaceholder(st);
      pagesEl.appendChild(shell);
      state.pageStates.push(st);
    }
  }

  function detectCurrentPage() {
    if (!state.pageStates.length) return 1;
    var center = window.scrollY + window.innerHeight / 2;
    var bestPage = 1;
    var bestDistance = Number.POSITIVE_INFINITY;
    for (var i = 0; i < state.pageStates.length; i++) {
      var st = state.pageStates[i];
      var top = st.shell.offsetTop;
      var mid = top + st.cssHeight / 2;
      var distance = Math.abs(mid - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = st.pageNum;
      }
    }
    return bestPage;
  }

  function emitCurrentPage() {
    var page = detectCurrentPage();
    if (page !== state.currentPage) {
      state.currentPage = page;
      send({ type: 'page', page: state.currentPage, pages: state.totalPages });
    }
  }

  function releaseFarPages(viewTop, viewBottom) {
    var farPad = window.innerHeight * 10;
    var current = state.currentPage || detectCurrentPage();
    for (var i = 0; i < state.pageStates.length; i++) {
      var st = state.pageStates[i];
      if (st.status !== 'rendered') continue;
      if (Math.abs(st.pageNum - current) <= 8) continue;
      var top = st.shell.offsetTop;
      var bottom = top + st.cssHeight;
      if (bottom < viewTop - farPad || top > viewBottom + farPad) {
        st.status = 'idle';
        setShellPlaceholder(st);
      }
    }
  }

  function queueVisiblePages() {
    if (!state.pdf || !state.pageStates.length) return;
    var viewTop = window.scrollY;
    var viewBottom = viewTop + window.innerHeight;
    var nearPad = window.innerHeight * 2.75;
    var center = viewTop + window.innerHeight / 2;
    var candidates = [];

    for (var i = 0; i < state.pageStates.length; i++) {
      var st = state.pageStates[i];
      var top = st.shell.offsetTop;
      var bottom = top + st.cssHeight;
      if (bottom >= viewTop - nearPad && top <= viewBottom + nearPad) {
        if (st.status === 'idle') {
          candidates.push({
            pageNum: st.pageNum,
            distance: Math.abs((top + bottom) / 2 - center),
          });
        }
      }
    }

    candidates.sort(function (a, b) { return a.distance - b.distance; });
    for (var j = 0; j < candidates.length; j++) {
      var pageNum = candidates[j].pageNum;
      var ps = state.pageStates[pageNum - 1];
      if (ps.status === 'idle') {
        ps.status = 'queued';
        state.queue.push(pageNum);
      }
    }

    releaseFarPages(viewTop, viewBottom);
    emitCurrentPage();
    pumpQueue();
  }

  function throttleVisibleUpdate() {
    if (state.resizeTick) return;
    state.resizeTick = window.requestAnimationFrame(function () {
      state.resizeTick = 0;
      queueVisiblePages();
    });
  }

  function mountCanvas(st, canvas) {
    st.shell.innerHTML = '';
    st.shell.style.width = Math.ceil(st.cssWidth) + 'px';
    st.shell.style.height = Math.ceil(st.cssHeight) + 'px';
    canvas.style.width = Math.ceil(st.cssWidth) + 'px';
    canvas.style.height = Math.ceil(st.cssHeight) + 'px';
    canvas.className = 'page-card';
    st.shell.appendChild(canvas);
  }

  function scheduleIdlePrefetch() {
    if (state.prefetchTimer) return;
    state.prefetchTimer = window.setTimeout(function () {
      state.prefetchTimer = 0;
      if (!state.pdf || state.activeRenders > 0 || state.queue.length > 0) return;

      var base = state.currentPage || detectCurrentPage();
      var targets = [];
      for (var d = 0; d <= 4; d++) {
        if (base + d <= state.totalPages) targets.push(base + d);
        if (d > 0 && base - d >= 1) targets.push(base - d);
      }

      for (var i = 0; i < targets.length; i++) {
        var st = state.pageStates[targets[i] - 1];
        if (st && st.status === 'idle') {
          st.status = 'queued';
          state.queue.push(st.pageNum);
        }
      }
      pumpQueue();
    }, 120);
  }

  function renderPage(pageNum) {
    var st = state.pageStates[pageNum - 1];
    if (!st || st.status === 'rendering' || st.status === 'rendered') return Promise.resolve();

    st.status = 'rendering';
    state.activeRenders += 1;

    return state.pdf
      .getPage(pageNum)
      .then(function (page) {
        var m = getCssMetrics(page);
        st.cssWidth = m.cssWidth;
        st.cssHeight = m.cssHeight;
        setShellPlaceholder(st);

        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = Math.floor(m.viewport.width);
        canvas.height = Math.floor(m.viewport.height);
        st.renderTask = page.render({ canvasContext: ctx, viewport: m.viewport });
        return st.renderTask.promise.then(function () {
          st.renderTask = null;
          st.status = 'rendered';
          mountCanvas(st, canvas);
          if (!state.firstPaintSent) {
            state.firstPaintSent = true;
            send({ type: 'interactive' });
          }
        });
      })
      .catch(function (e) {
        st.renderTask = null;
        st.status = 'idle';
        throw e;
      })
      .finally(function () {
        state.activeRenders -= 1;
        pumpQueue();
        scheduleIdlePrefetch();
      });
  }

  function pumpQueue() {
    while (state.activeRenders < state.maxConcurrent && state.queue.length > 0) {
      var nextPage = state.queue.shift();
      renderPage(nextPage).catch(function () {
        // Non-fatal page render hiccups should not collapse the whole reader.
        // The page stays idle and can be retried later when it comes back into view.
      });
    }
    if (state.activeRenders === 0 && state.queue.length === 0) {
      scheduleIdlePrefetch();
    }
  }

  function clearState() {
    state.queue = [];
    state.activeRenders = 0;
    state.firstPaintSent = false;
    state.pageStates = [];
    state.totalPages = 0;
    state.currentPage = 0;
    if (state.prefetchTimer) {
      clearTimeout(state.prefetchTimer);
      state.prefetchTimer = 0;
    }
    var pagesEl = document.getElementById('pages');
    if (pagesEl) pagesEl.innerHTML = '';
  }

  window.__pdfReaderB64 = '';
  window.__pdfReaderReset = function () {
    window.__pdfReaderB64 = '';
    clearState();
  };
  window.__pdfReaderAppend = function (chunk) {
    window.__pdfReaderB64 += chunk;
  };
  window.__pdfLoad = function () {
    if (typeof pdfjsLib === 'undefined') {
      send({ type: 'error', err: 'pdfjs_missing' });
      return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${CDN}/pdf.worker.min.js';

    var bytes;
    try {
      bytes = fromBase64(window.__pdfReaderB64 || '');
      window.__pdfReaderB64 = '';
    } catch (e) {
      send({ type: 'error', err: String(e && e.message ? e.message : e) });
      return;
    }

    pdfjsLib
      .getDocument({ data: bytes })
      .promise.then(function (pdf) {
        state.pdf = pdf;
        state.totalPages = pdf.numPages;
        return pdf.getPage(1).then(function (firstPage) {
          var m = getCssMetrics(firstPage);
          state.estWidth = m.cssWidth;
          state.estHeight = m.cssHeight;
          buildShells(pdf.numPages);
          state.currentPage = 1;
          send({ type: 'page', page: 1, pages: pdf.numPages });
          queueVisiblePages();
          scheduleIdlePrefetch();
          send({ type: 'document', pages: pdf.numPages });
        });
      })
      .catch(function (e) {
        send({ type: 'error', err: String(e && e.message ? e.message : e) });
      });
  };

  window.addEventListener('scroll', throttleVisibleUpdate, { passive: true });
  window.addEventListener('resize', throttleVisibleUpdate);
})();
</script>
</body></html>`;

type Props = {
  pdfBase64: string;
  onRenderFailed?: () => void;
  onPageChange?: (page: number, totalPages: number) => void;
};

function escapeForInject(chunk: string): string {
  return JSON.stringify(chunk);
}

async function injectPdfBase64(webView: WebView | null, pdfBase64: string): Promise<void> {
  if (!webView) return;
  await new Promise<void>((r) => setTimeout(r, 250));
  webView.injectJavaScript('window.__pdfReaderReset && window.__pdfReaderReset(); true;');
  await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 50 : 20));

  for (let i = 0; i < pdfBase64.length; i += B64_CHUNK) {
    const part = pdfBase64.slice(i, i + B64_CHUNK);
    webView.injectJavaScript(`window.__pdfReaderAppend(${escapeForInject(part)}); true;`);
    if (i + B64_CHUNK < pdfBase64.length) {
      await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 15 : 5));
    }
  }

  await new Promise<void>((r) => setTimeout(r, 40));
  webView.injectJavaScript('window.__pdfLoad && window.__pdfLoad(); true;');
}

function PdfJsReaderWebViewInner({ pdfBase64, onRenderFailed, onPageChange }: Props) {
  const ref = useRef<WebView>(null);
  const failed = useRef(false);
  const [shellReady, setShellReady] = useState(false);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    failed.current = false;
    setShellReady(false);
    setInteractive(false);
  }, [pdfBase64]);

  useEffect(() => {
    if (!shellReady || !pdfBase64 || failed.current) return;
    const w = ref.current;
    if (!w) return;
    InteractionManager.runAfterInteractions(() => {
      injectPdfBase64(w, pdfBase64).catch(() => {
        if (!failed.current) {
          failed.current = true;
          onRenderFailed?.();
        }
      });
    });
  }, [shellReady, pdfBase64, onRenderFailed]);

  const onMsg = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as { type?: string; page?: number; pages?: number };
        if (data.type === 'ready') {
          setShellReady(true);
          return;
        }
        if (data.type === 'interactive') {
          setInteractive(true);
          return;
        }
        if (data.type === 'page' && typeof data.page === 'number' && typeof data.pages === 'number') {
          onPageChange?.(data.page, data.pages);
          return;
        }
        if (data.type === 'error') {
          if (!interactive) {
            failed.current = true;
            onRenderFailed?.();
          }
        }
      } catch {
        /* ignore */
      }
    },
    [interactive, onPageChange, onRenderFailed]
  );

  return (
    <View style={styles.wrap}>
      <WebView
        ref={ref}
        style={styles.webview}
        source={{ html: READER_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onMessage={onMsg}
        onLoadEnd={() => {
          ref.current?.injectJavaScript(
            `(function(){var n=0;function go(){try{if(typeof window.__pdfReaderReset==='function'&&typeof pdfjsLib!=='undefined'){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));return;}}catch(e){}if(++n>200){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',err:'pdfjs_timeout'}));return;}setTimeout(go,40);}go();})();true;`
          );
        }}
        startInLoadingState
        renderLoading={() => <View style={styles.loading} />}
        {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
      />
      {!interactive ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color="#ec4899" size="large" />
        </View>
      ) : null}
    </View>
  );
}

export const PdfJsReaderWebView = React.memo(PdfJsReaderWebViewInner);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#ece8e1' },
  webview: { flex: 1, backgroundColor: '#ece8e1' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#dfe3ea',
  },
});
