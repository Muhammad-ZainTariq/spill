/**
 * Tic-Tac-Toe multiplayer server for Spill app.
 * Supports ?room= in URL: both players open same URL and get the same game.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// In-memory state: rooms by roomCode (string, from ?room=)
const rooms = new Map(); // roomCode -> { p1: { id, name }, p2: { id, name } }
const games = new Map(); // roomCode -> { board, turn, winner }
const roomBySocket = new Map(); // socket.id -> roomCode

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('joinOrCreate', (data) => {
    const { roomCode, name } = data;
    if (!roomCode || !name) return;
    const n = name.trim().slice(0, 20) || 'Player';
    const room = rooms.get(roomCode);

    if (room && !room.p2) {
      // Second player: join
      room.p2 = { id: socket.id, name: n };
      socket.join(roomCode);
      roomBySocket.set(socket.id, roomCode);
      games.set(roomCode, { board: Array(9).fill(''), turn: 'X', winner: null });
      io.to(room.p1.id).emit('start', { role: 'X', opponent: n });
      socket.emit('start', { role: 'O', opponent: room.p1.name });
      return;
    }
    if (room && room.p2) {
      socket.emit('roomFull');
      return;
    }
    // First player: create
    rooms.set(roomCode, { p1: { id: socket.id, name: n }, p2: null });
    socket.join(roomCode);
    roomBySocket.set(socket.id, roomCode);
    socket.emit('waiting', { roomCode });
  });

  socket.on('move', (data) => {
    const { roomCode, index, mark } = data;
    const game = games.get(roomCode);
    if (!game || game.winner || game.board[index]) return;
    game.board[index] = mark;
    const win = checkWin(game.board);
    if (win) game.winner = win;
    else if (game.board.every(Boolean)) game.winner = 'draw';
    else game.turn = mark === 'X' ? 'O' : 'X';
    io.to(roomCode).emit('state', { board: game.board, turn: game.turn, winner: game.winner });
  });

  socket.on('disconnect', () => {
    const roomCode = roomBySocket.get(socket.id);
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        const other = room.p1?.id === socket.id ? room.p2 : room.p1;
        if (other) io.to(other.id).emit('opponentLeft');
        rooms.delete(roomCode);
        games.delete(roomCode);
      }
      roomBySocket.delete(socket.id);
    }
  });
});

function checkWin(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

server.listen(PORT, () => {
  console.log('Tic-Tac-Toe server at http://localhost:' + PORT);
});
