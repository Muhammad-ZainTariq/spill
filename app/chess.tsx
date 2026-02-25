import { auth, db } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Chess } from 'chess.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';

type Mode = 'multiplayer' | 'bot';
type Color = 'white' | 'black' | 'spectator';

const START_FEN = new Chess().fen();

function clampRoomId(raw: string): string {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
}

function scoreFen(fen: string): number {
  const pieceValues: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const board = (fen.split(' ')[0] || '');
  let score = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const isWhite = ch === ch.toUpperCase();
    const v = pieceValues[ch.toLowerCase()] || 0;
    score += isWhite ? v : -v;
  }
  return score;
}

function pickBotMove(game: Chess, depth = 2): { from: string; to: string; promotion?: string } | null {
  const negamax = (fen: string, d: number, alpha: number, beta: number): number => {
    const g = new Chess(fen);
    if (d === 0 || g.isGameOver()) {
      const s = scoreFen(g.fen());
      return g.turn() === 'w' ? s : -s;
    }
    let best = -Infinity;
    const moves = g.moves({ verbose: true });
    for (const m of moves) {
      const gg = new Chess(fen);
      gg.move(m);
      const val = -negamax(gg.fen(), d - 1, -beta, -alpha);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  };

  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;

  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const gg = new Chess(game.fen());
    gg.move(m);
    const val = -negamax(gg.fen(), depth - 1, -Infinity, Infinity);
    if (val > bestScore) {
      bestScore = val;
      bestMove = m;
    }
  }
  return { from: bestMove.from, to: bestMove.to, promotion: (bestMove as any).promotion };
}

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/chessboard.js/1.0.0/chessboard-1.0.0.min.css" />
  <style>
    html, body { height: 100%; margin: 0; background: #0b1020; color: #e5e7eb; font-family: -apple-system, system-ui; }
    #wrap { height: 100%; display: flex; flex-direction: column; }
    #top { padding: 10px 12px; display:flex; justify-content:space-between; gap: 10px; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.08); }
    #title { font-weight: 700; letter-spacing: 0.2px; }
    #status { font-size: 12px; color: rgba(229,231,235,0.75); text-align: right; }
    #boardWrap { flex: 1; display:flex; align-items:center; justify-content:center; padding: 14px; }
    #board { width: min(92vw, 560px); }
    a { color: #ec4899; }
    .hint { box-shadow: inset 0 0 0 4px rgba(236,72,153,0.55); }
    .captureHint { box-shadow: inset 0 0 0 4px rgba(239,68,68,0.55); }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="top">
      <div id="title">Chess</div>
      <div id="status">Loading…</div>
    </div>
    <div id="boardWrap"><div id="board"></div></div>
  </div>

  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/1.4.0/chess.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/chessboard.js/1.0.0/chessboard-1.0.0.min.js"></script>

  <script>
    (function () {
      var Chess = window.Chess;
      var game = new Chess();
      var myColor = 'spectator';
      var orientation = 'white';

      function setStatus(t) {
        document.getElementById('status').textContent = t;
      }

      function post(obj) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }

      function removeHints() {
        $('#board .square-55d63').removeClass('hint captureHint');
      }

      function hint(square) {
        removeHints();
        var moves = game.moves({ square: square, verbose: true });
        if (!moves.length) return;
        moves.forEach(function(m) {
          var el = $('#board .square-' + m.to);
          el.addClass('hint');
          if (m.flags && m.flags.indexOf('c') !== -1) el.addClass('captureHint');
        });
      }

      var board = Chessboard('board', {
        draggable: true,
        position: 'start',
        orientation: orientation,
        onDragStart: function(source, piece) {
          if (myColor === 'spectator') return false;
          var turn = game.turn() === 'w' ? 'white' : 'black';
          if (turn !== myColor) return false;
          if ((myColor === 'white' && piece.search(/^b/) !== -1) || (myColor === 'black' && piece.search(/^w/) !== -1)) {
            return false;
          }
          return true;
        },
        onDrop: function(source, target) {
          removeHints();
          var move = game.move({ from: source, to: target, promotion: 'q' });
          if (move === null) return 'snapback';
          post({ type: 'move', from: source, to: target, promotion: 'q' });
        },
        onMouseoverSquare: function(square) { hint(square); },
        onMouseoutSquare: function() { removeHints(); },
        onSnapEnd: function() {
          board.position(game.fen());
        }
      });

      window.__setState = function(payload) {
        try {
          if (payload && payload.fen) {
            game.load(payload.fen);
            board.position(payload.fen, true);
          }
          if (payload && payload.myColor) {
            myColor = payload.myColor;
            orientation = payload.myColor === 'black' ? 'black' : 'white';
            board.orientation(orientation);
          }
          if (payload && payload.status) setStatus(payload.status);
        } catch (e) {}
      };

      setStatus('Ready');
      post({ type: 'ready' });
    })();
  </script>
</body>
</html>`;

export default function ChessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { matchId: matchIdParam, mode: modeParam } = useLocalSearchParams<{ matchId?: string; mode?: string }>();

  const mode: Mode = (modeParam === 'bot' ? 'bot' : 'multiplayer');
  const matchId = useMemo(() => (matchIdParam ? clampRoomId(matchIdParam) : ''), [matchIdParam]);

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [myColor, setMyColor] = useState<Color>('spectator');
  const [fen, setFen] = useState<string>(START_FEN);
  const [statusText, setStatusText] = useState<string>('');
  const localGameRef = useRef<Chess | null>(null);
  const pendingBotMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushStateToWeb = useCallback((nextFen: string, nextColor: Color) => {
    const turn = (() => {
      try {
        const g = new Chess(nextFen);
        return g.turn() === 'w' ? 'White to move' : 'Black to move';
      } catch {
        return '';
      }
    })();
    const payload = {
      fen: nextFen,
      myColor: nextColor,
      status: turn,
    };
    const js = `window.__setState(${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  // Multiplayer: join + subscribe to Firestore doc
  useEffect(() => {
    if (mode !== 'multiplayer') return;
    const uid = auth.currentUser?.uid;
    if (!uid || !matchId) return;

    const ref = doc(db, 'chess_games', matchId);
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const color = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, {
            fen: START_FEN,
            pgn: '',
            status: 'active',
            white_id: uid,
            black_id: null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });
          return 'white' as Color;
        }
        const d = snap.data() as any;
        if (d.white_id === uid) return 'white' as Color;
        if (d.black_id === uid) return 'black' as Color;
        if (!d.black_id && d.white_id !== uid) {
          tx.update(ref, { black_id: uid, updated_at: serverTimestamp() });
          return 'black' as Color;
        }
        return 'spectator' as Color;
      });
      if (cancelled) return;
      setMyColor(color);

      unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        const nextFen = d.fen || START_FEN;
        setFen(nextFen);
        setStatusText(d.status || '');
        pushStateToWeb(nextFen, color);
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [matchId, mode, pushStateToWeb]);

  // Bot mode: local game only
  useEffect(() => {
    if (mode !== 'bot') return;
    localGameRef.current = new Chess();
    setMyColor('white');
    setFen(localGameRef.current.fen());
    pushStateToWeb(localGameRef.current.fen(), 'white');
    return () => {
      if (pendingBotMoveRef.current) clearTimeout(pendingBotMoveRef.current);
      pendingBotMoveRef.current = null;
      localGameRef.current = null;
    };
  }, [mode, pushStateToWeb]);

  const handleMoveMultiplayer = useCallback(async (from: string, to: string, promotion?: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !matchId) return;
    const ref = doc(db, 'chess_games', matchId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data() as any;
      const whiteId = d.white_id;
      const blackId = d.black_id;
      const color: Color = uid === whiteId ? 'white' : uid === blackId ? 'black' : 'spectator';
      if (color === 'spectator') return;
      const g = new Chess(d.fen || START_FEN);
      const turnColor: Color = g.turn() === 'w' ? 'white' : 'black';
      if (turnColor !== color) return;
      const mv = g.move({ from, to, promotion: promotion || 'q' } as any);
      if (!mv) return;
      tx.update(ref, {
        fen: g.fen(),
        pgn: g.pgn(),
        last_move: { from, to, promotion: promotion || 'q' },
        updated_at: serverTimestamp(),
      });
    });
  }, [matchId]);

  const handleMoveBot = useCallback((from: string, to: string, promotion?: string) => {
    const g = localGameRef.current;
    if (!g) return;
    if (g.isGameOver()) return;
    const mv = g.move({ from, to, promotion: promotion || 'q' } as any);
    if (!mv) {
      // Reject: resync UI
      pushStateToWeb(g.fen(), 'white');
      return;
    }
    setFen(g.fen());
    pushStateToWeb(g.fen(), 'white');

    if (g.isGameOver()) return;

    if (pendingBotMoveRef.current) clearTimeout(pendingBotMoveRef.current);
    pendingBotMoveRef.current = setTimeout(() => {
      const gg = localGameRef.current;
      if (!gg || gg.isGameOver()) return;
      const botMove = pickBotMove(gg, 2);
      if (!botMove) return;
      gg.move({ from: botMove.from, to: botMove.to, promotion: botMove.promotion || 'q' } as any);
      setFen(gg.fen());
      pushStateToWeb(gg.fen(), 'white');
    }, 350);
  }, [pushStateToWeb]);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data || '{}');
      if (msg?.type === 'ready') {
        setLoading(false);
        pushStateToWeb(fen, myColor);
        return;
      }
      if (msg?.type === 'move' && msg.from && msg.to) {
        if (mode === 'multiplayer') handleMoveMultiplayer(msg.from, msg.to, msg.promotion);
        else handleMoveBot(msg.from, msg.to, msg.promotion);
      }
    } catch (_) {}
  }, [fen, myColor, mode, handleMoveBot, handleMoveMultiplayer, pushStateToWeb]);

  const title = mode === 'bot' ? 'Chess vs Bot' : 'Chess';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6, paddingBottom: 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#e5e7eb" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      <WebView
        ref={webRef}
        source={{ html: HTML }}
        originWhitelist={['*']}
        style={styles.webview}
        onMessage={onMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading chess…</Text>
          </View>
        )}
      />

      {(mode === 'multiplayer' && !matchId) && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Missing matchId</Text>
          <Text style={styles.overlayText}>Open Chess from a match chat.</Text>
        </View>
      )}
      {loading ? null : null}
      {statusText ? null : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0b1020',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#e5e7eb', textAlign: 'center', marginHorizontal: 8 },
  webview: { flex: 1, backgroundColor: '#0b1020' },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1020' },
  loadingText: { marginTop: 12, fontSize: 14, color: 'rgba(229,231,235,0.75)' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: '800' },
  overlayText: { color: 'rgba(229,231,235,0.75)', fontSize: 13, marginTop: 4 },
});

