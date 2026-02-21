/**
 * Multi-game server for Spill: Tic-Tac-Toe, Chess, Ludo.
 * All games use ?room= (matchId). Routes: / (ttt), /chess, /ludo.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chess', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chess.html')));
app.get('/ludo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ludo.html')));

// ----- Tic-Tac-Toe (default namespace) -----
const tttRooms = new Map();
const tttGames = new Map();
const tttSocketToRoom = new Map();

io.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = (name && name.trim().slice(0, 20)) || 'Player';
    const room = tttRooms.get(roomCode);
    if (room && !room.p2) {
      room.p2 = { id: socket.id, name: n };
      socket.join(roomCode);
      tttSocketToRoom.set(socket.id, roomCode);
      tttGames.set(roomCode, { board: Array(9).fill(''), turn: 'X', winner: null });
      io.to(room.p1.id).emit('start', { role: 'X', opponent: n });
      socket.emit('start', { role: 'O', opponent: room.p1.name });
      return;
    }
    if (room && room.p2) {
      socket.emit('roomFull');
      return;
    }
    tttRooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
    socket.join(roomCode);
    tttSocketToRoom.set(socket.id, roomCode);
    socket.emit('waiting', { roomCode });
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

  socket.on('disconnect', () => {
    const roomCode = tttSocketToRoom.get(socket.id);
    if (roomCode) {
      const room = tttRooms.get(roomCode);
      if (room) {
        const other = room.p1?.id === socket.id ? room.p2 : room.p1;
        if (other) io.to(other.id).emit('opponentLeft');
        tttRooms.delete(roomCode);
        tttGames.delete(roomCode);
      }
      tttSocketToRoom.delete(socket.id);
    }
  });
});

// ----- Chess (namespace /chess) -----
const chessIo = io.of('/chess');
const chessRooms = new Map();
const chessGames = new Map();
const chessSocketToRoom = new Map();

chessIo.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = (name && name.trim().slice(0, 20)) || 'Player';
    const room = chessRooms.get(roomCode);
    if (room && !room.p2) {
      room.p2 = { id: socket.id, name: n };
      socket.join(roomCode);
      chessSocketToRoom.set(socket.id, roomCode);
      const game = new Chess();
      chessGames.set(roomCode, { chess: game, fen: game.fen(), turn: 'w', result: null });
      chessIo.to(room.p1.id).emit('start', { color: 'w', opponent: n });
      socket.emit('start', { color: 'b', opponent: room.p1.name });
      chessIo.to(roomCode).emit('state', { fen: game.fen(), turn: 'w', result: null });
      return;
    }
    if (room && room.p2) {
      socket.emit('roomFull');
      return;
    }
    chessRooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
    socket.join(roomCode);
    chessSocketToRoom.set(socket.id, roomCode);
    socket.emit('waiting', { roomCode });
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
    if (roomCode) {
      const room = chessRooms.get(roomCode);
      if (room) {
        const other = room.p1?.id === socket.id ? room.p2 : room.p1;
        if (other) chessIo.to(other.id).emit('opponentLeft');
        chessRooms.delete(roomCode);
        chessGames.delete(roomCode);
      }
      chessSocketToRoom.delete(socket.id);
    }
  });
});

// ----- Ludo (namespace /ludo) -----
const ludoIo = io.of('/ludo');
const ludoRooms = new Map();
const ludoGames = new Map();
const ludoSocketToRoom = new Map();
const LUDO_TRACK = 40;

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

ludoIo.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = (name && name.trim().slice(0, 20)) || 'Player';
    const room = ludoRooms.get(roomCode);
    if (room && !room.p2) {
      room.p2 = { id: socket.id, name: n };
      socket.join(roomCode);
      ludoSocketToRoom.set(socket.id, roomCode);
      ludoGames.set(roomCode, {
        positions: [0, 0],
        turn: 0,
        lastDice: 0,
        winner: null,
      });
      ludoIo.to(room.p1.id).emit('start', { playerIndex: 0, opponent: n });
      socket.emit('start', { playerIndex: 1, opponent: room.p1.name });
      ludoIo.to(roomCode).emit('state', ludoGames.get(roomCode));
      return;
    }
    if (room && room.p2) {
      socket.emit('roomFull');
      return;
    }
    ludoRooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
    socket.join(roomCode);
    ludoSocketToRoom.set(socket.id, roomCode);
    socket.emit('waiting', { roomCode });
  });

  socket.on('roll', (data) => {
    const { roomCode } = data;
    const g = ludoGames.get(roomCode);
    if (!g || g.winner !== null) return;
    const dice = rollDice();
    g.lastDice = dice;
    const pos = g.positions[g.turn];
    const newPos = Math.min(LUDO_TRACK, pos + dice);
    g.positions[g.turn] = newPos;
    if (newPos >= LUDO_TRACK) g.winner = g.turn;
    else g.turn = 1 - g.turn;
    ludoIo.to(roomCode).emit('state', { ...g });
  });

  socket.on('disconnect', () => {
    const roomCode = ludoSocketToRoom.get(socket.id);
    if (roomCode) {
      const room = ludoRooms.get(roomCode);
      if (room) {
        const other = room.p1?.id === socket.id ? room.p2 : room.p1;
        if (other) ludoIo.to(other.id).emit('opponentLeft');
        ludoRooms.delete(roomCode);
        ludoGames.delete(roomCode);
      }
      ludoSocketToRoom.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log('Games server at http://localhost:' + PORT + ' (/, /chess, /ludo)');
});
