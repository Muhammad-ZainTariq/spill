/**
 * Multi-game server for Spill: Tic-Tac-Toe, Chess.
 * All games use ?room= (matchId). Routes: / (ttt), /chess.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // Longer timeouts help Render free tier (cold start) + mobile networks
  connectTimeout: 60_000,
  pingTimeout: 60_000,
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chess', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chess.html')));

// ----- Tic-Tac-Toe (default namespace) -----
const tttRooms = new Map();
const tttGames = new Map();
const tttSocketToRoom = new Map();

function tttSocketLive(ioServer, socketId) {
  return !!(socketId && ioServer.sockets.sockets.has(socketId));
}

function resyncTttRoom(ioServer, roomCode, room) {
  if (!room?.p1 || !room?.p2) return;
  if (!tttSocketLive(ioServer, room.p1.id) || !tttSocketLive(ioServer, room.p2.id)) return;
  ioServer.to(room.p1.id).emit('start', { role: 'X', opponent: room.p2.name });
  ioServer.to(room.p2.id).emit('start', { role: 'O', opponent: room.p1.name });
  const game = tttGames.get(roomCode);
  if (game) {
    ioServer.to(roomCode).emit('state', { board: game.board, turn: game.turn, winner: game.winner });
  }
}

io.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = (name && name.trim().slice(0, 20)) || 'Player';
    let room = tttRooms.get(roomCode);

    if (room) {
      if (room.p1 && !tttSocketLive(io, room.p1.id)) room.p1 = null;
      if (room.p2 && !tttSocketLive(io, room.p2.id)) room.p2 = null;
      if (!room.p1 && !room.p2) {
        tttRooms.delete(roomCode);
        tttGames.delete(roomCode);
        room = undefined;
      }
    }

    if (!room) {
      tttRooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
      socket.join(roomCode);
      tttSocketToRoom.set(socket.id, roomCode);
      socket.emit('waiting', { roomCode });
      return;
    }

    if (room.p1?.id === socket.id || room.p2?.id === socket.id) {
      socket.join(roomCode);
      tttSocketToRoom.set(socket.id, roomCode);
      if (room.p1 && room.p2) resyncTttRoom(io, roomCode, room);
      else socket.emit('waiting', { roomCode });
      return;
    }

    const p1ok = room.p1 && tttSocketLive(io, room.p1.id);
    const p2ok = room.p2 && tttSocketLive(io, room.p2.id);

    if (p1ok && p2ok) {
      socket.emit('roomFull');
      return;
    }

    if (!p1ok && p2ok) {
      room.p1 = { id: socket.id, name: n };
    } else if (p1ok && !p2ok) {
      room.p2 = { id: socket.id, name: n };
    } else if (!p1ok && !p2ok) {
      room.p1 = { id: socket.id, name: n };
      room.p2 = null;
    } else {
      socket.emit('roomFull');
      return;
    }

    socket.join(roomCode);
    tttSocketToRoom.set(socket.id, roomCode);

    if (room.p1 && room.p2) {
      let game = tttGames.get(roomCode);
      if (!game) {
        game = { board: Array(9).fill(''), turn: 'X', winner: null };
        tttGames.set(roomCode, game);
      }
      room.started = true;
      io.to(room.p1.id).emit('start', { role: 'X', opponent: room.p2.name });
      io.to(room.p2.id).emit('start', { role: 'O', opponent: room.p1.name });
      io.to(roomCode).emit('state', { board: game.board, turn: game.turn, winner: game.winner });
    } else {
      socket.emit('waiting', { roomCode });
      const other = room.p1 || room.p2;
      if (other) io.to(other.id).emit('waiting', { roomCode });
    }
  });

  socket.on('move', (data) => {
    const { roomCode, index, mark } = data;
    const game = tttGames.get(roomCode);
    if (!game || game.winner || game.board[index]) return;
    game.board[index] = mark;
    const win = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].find(([a,b,c]) => game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]);
    if (win) game.winner = game.board[win[0]];
    else if (game.board.every(Boolean)) game.winner = 'draw';
    else game.turn = mark === 'X' ? 'O' : 'X';
    io.to(roomCode).emit('state', { board: game.board, turn: game.turn, winner: game.winner });
  });

  socket.on('requestReplay', (data) => {
    const { roomCode } = data;
    if (!roomCode) return;
    const room = tttRooms.get(roomCode);
    const game = tttGames.get(roomCode);
    if (!room || !room.p1 || !room.p2 || !game || !game.winner) return;
    room.replayRequested = room.replayRequested || {};
    const isP1 = room.p1.id === socket.id;
    if (isP1) room.replayRequested.p1 = true;
    else room.replayRequested.p2 = true;
    const other = isP1 ? room.p2 : room.p1;
    if (room.replayRequested.p1 && room.replayRequested.p2) {
      room.replayRequested = { p1: false, p2: false };
      tttGames.set(roomCode, { board: Array(9).fill(''), turn: 'X', winner: null });
      io.to(room.p1.id).emit('start', { role: 'X', opponent: room.p2.name });
      io.to(room.p2.id).emit('start', { role: 'O', opponent: room.p1.name });
      io.to(roomCode).emit('state', { board: Array(9).fill(''), turn: 'X', winner: null });
    } else {
      io.to(other.id).emit('replayRequested');
    }
  });

  socket.on('replayDeclined', (data) => {
    const { roomCode } = data;
    if (!roomCode) return;
    const room = tttRooms.get(roomCode);
    if (!room || !room.p1 || !room.p2) return;
    const other = room.p1.id === socket.id ? room.p2 : room.p1;
    io.to(other.id).emit('replayDeclined');
  });

  socket.on('disconnect', () => {
    const roomCode = tttSocketToRoom.get(socket.id);
    if (!roomCode) return;
    tttSocketToRoom.delete(socket.id);
    const room = tttRooms.get(roomCode);
    if (!room) return;
    if (room.p1?.id === socket.id) room.p1 = null;
    if (room.p2?.id === socket.id) room.p2 = null;
    if (!room.p1 && !room.p2) {
      tttRooms.delete(roomCode);
      tttGames.delete(roomCode);
      return;
    }
    const other = room.p1 || room.p2;
    if (other) {
      if (room.started || tttGames.has(roomCode)) {
        io.to(other.id).emit('opponentLeft', { roomCode });
      } else {
        io.to(other.id).emit('waiting', { roomCode });
      }
    }
  });
});

// ----- Chess (namespace /chess) -----
const chessIo = io.of('/chess');
const chessRooms = new Map();
const chessGames = new Map();
const chessSocketToRoom = new Map();

function chessSocketLive(ns, socketId) {
  return !!(socketId && ns.sockets.has(socketId));
}

function startOrResumeChessGame(roomCode, room) {
  let g = chessGames.get(roomCode);
  if (!g) {
    const game = new Chess();
    g = { chess: game, fen: game.fen(), turn: 'w', result: null };
    chessGames.set(roomCode, g);
  }
  room.started = true;
  chessIo.to(room.p1.id).emit('start', { color: 'w', opponent: room.p2.name });
  chessIo.to(room.p2.id).emit('start', { color: 'b', opponent: room.p1.name });
  chessIo.to(roomCode).emit('gameStart', {
    p1: { id: room.p1.id, name: room.p1.name },
    p2: { id: room.p2.id, name: room.p2.name },
  });
  chessIo.to(roomCode).emit('state', { fen: g.fen, turn: g.turn, result: g.result });
}

chessIo.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = (name && name.trim().slice(0, 20)) || 'Player';
    let room = chessRooms.get(roomCode);

    if (room) {
      if (room.p1 && !chessSocketLive(chessIo, room.p1.id)) room.p1 = null;
      if (room.p2 && !chessSocketLive(chessIo, room.p2.id)) room.p2 = null;
      if (!room.p1 && !room.p2) {
        chessRooms.delete(roomCode);
        chessGames.delete(roomCode);
        room = undefined;
      }
    }

    if (!room) {
      chessRooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
      socket.join(roomCode);
      chessSocketToRoom.set(socket.id, roomCode);
      socket.emit('waiting', { roomCode });
      return;
    }

    if (room.p1?.id === socket.id || room.p2?.id === socket.id) {
      socket.join(roomCode);
      chessSocketToRoom.set(socket.id, roomCode);
      if (room.p1 && room.p2) startOrResumeChessGame(roomCode, room);
      else socket.emit('waiting', { roomCode });
      return;
    }

    const p1ok = room.p1 && chessSocketLive(chessIo, room.p1.id);
    const p2ok = room.p2 && chessSocketLive(chessIo, room.p2.id);

    if (p1ok && p2ok) {
      socket.emit('roomFull');
      return;
    }

    if (!p1ok && p2ok) {
      room.p1 = { id: socket.id, name: n };
    } else if (p1ok && !p2ok) {
      room.p2 = { id: socket.id, name: n };
    } else if (!p1ok && !p2ok) {
      room.p1 = { id: socket.id, name: n };
      room.p2 = null;
    } else {
      socket.emit('roomFull');
      return;
    }

    socket.join(roomCode);
    chessSocketToRoom.set(socket.id, roomCode);

    if (room.p1 && room.p2) {
      startOrResumeChessGame(roomCode, room);
    } else {
      socket.emit('waiting', { roomCode });
      const other = room.p1 || room.p2;
      if (other) chessIo.to(other.id).emit('waiting', { roomCode });
    }
  });

  socket.on('getMoves', (data) => {
    const { roomCode, square } = data;
    if (!roomCode || !square) return;
    const g = chessGames.get(roomCode);
    if (!g || g.result) return;
    try {
      const moves = g.chess.moves({ square, verbose: true });
      socket.emit('validMoves', { square, moves: moves.map(m => ({ to: m.to, capture: !!m.captured })) });
    } catch (_) {
      socket.emit('validMoves', { square, moves: [] });
    }
  });

  socket.on('move', (data) => {
    const { roomCode, from, to, promotion } = data;
    const g = chessGames.get(roomCode);
    if (!g || g.result) return;
    try {
      const move = g.chess.move({ from, to, promotion: promotion || 'q' });
      if (move) {
        g.fen = g.chess.fen();
        g.turn = g.chess.turn();
        if (g.chess.isGameOver()) g.result = g.chess.isCheckmate() ? (g.turn === 'w' ? 'b' : 'w') : 'draw';
        chessIo.to(roomCode).emit('state', { fen: g.fen, turn: g.turn, result: g.result, lastMove: { from: move.from, to: move.to } });
      }
    } catch (_) {}
  });

  socket.on('disconnect', () => {
    const roomCode = chessSocketToRoom.get(socket.id);
    if (!roomCode) return;
    chessSocketToRoom.delete(socket.id);
    const room = chessRooms.get(roomCode);
    if (!room) return;
    if (room.p1?.id === socket.id) room.p1 = null;
    if (room.p2?.id === socket.id) room.p2 = null;
    if (!room.p1 && !room.p2) {
      chessRooms.delete(roomCode);
      chessGames.delete(roomCode);
      return;
    }
    const other = room.p1 || room.p2;
    if (other) {
      if (room.started || chessGames.has(roomCode)) {
        chessIo.to(other.id).emit('opponentLeft', { roomCode });
      } else {
        chessIo.to(other.id).emit('waiting', { roomCode });
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Games server listening on 0.0.0.0:' + PORT + ' (/, /chess)');
});
