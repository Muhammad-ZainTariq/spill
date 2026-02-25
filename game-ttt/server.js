/**
 * Spill games server. Ready-made games: Square Off, Breakout, Space Shooter, Chess, Tic-Tac-Toe.
 * App passes ?room= for match ID. Chess uses Open-Chess (marble UI, legal moves) with Socket.io.
 */
const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const repos = path.join(__dirname, 'repos');

// ----- Chess: Open-Chess protocol (join_room / create_room, make_move, etc.) -----
const ChessGame = require(path.resolve(repos, 'chess', 'public', 'js', 'game.js'));
const chessRooms = new Map();
const DISCONNECT_GRACE = 30000;

function clearChessTimer(room, color) {
  if (room.timers[color]) {
    clearTimeout(room.timers[color]);
    room.timers[color] = null;
  }
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ userId }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    chessRooms.set(roomId, {
      game: new ChessGame(),
      white: { userId, socketId: socket.id },
      black: null,
      spectators: [],
      timers: { white: null, black: null }
    });
    socket.join(roomId);
    socket.emit('room_created', { roomId, color: 'white' });
  });

  socket.on('join_room', ({ roomId, userId }) => {
    roomId = String(roomId || '').trim().slice(0, 64) || 'default';
    roomId = roomId.toUpperCase();
    let room = chessRooms.get(roomId);

    if (!room) {
      room = {
        game: new ChessGame(),
        white: { userId: userId || socket.id, socketId: socket.id },
        black: null,
        spectators: [],
        timers: { white: null, black: null }
      };
      chessRooms.set(roomId, room);
    }

    socket.join(roomId);

    if (room.white && room.white.userId === userId) {
      clearChessTimer(room, 'white');
      room.white.socketId = socket.id;
      socket.emit('game_joined', { roomId, color: 'white', isReconnect: true });
      socket.emit('sync_state', room.game.toJSON());
      io.to(roomId).emit('opponent_status', { status: 'connected', color: 'white' });
      return;
    }
    if (room.black && room.black.userId === userId) {
      clearChessTimer(room, 'black');
      room.black.socketId = socket.id;
      socket.emit('game_joined', { roomId, color: 'black', isReconnect: true });
      socket.emit('sync_state', room.game.toJSON());
      io.to(roomId).emit('opponent_status', { status: 'connected', color: 'black' });
      return;
    }
    if (!room.black) {
      room.black = { userId: userId || socket.id, socketId: socket.id };
      socket.emit('game_joined', { roomId, color: 'black' });
      io.to(room.white.socketId).emit('game_start', { color: 'white' });
      socket.emit('game_start', { color: 'black' });
      io.to(roomId).emit('sync_state', room.game.toJSON());
    } else {
      room.spectators.push(socket.id);
      socket.emit('game_joined', { roomId, color: 'spectator' });
      socket.emit('sync_state', room.game.toJSON());
    }
  });

  socket.on('make_move', ({ roomId, move }) => {
    const room = chessRooms.get(roomId);
    if (!room) return;
    const isWhite = room.white && socket.id === room.white.socketId;
    const isBlack = room.black && socket.id === room.black.socketId;
    const turn = room.game.turn;
    if ((isWhite && turn !== 'white') || (isBlack && turn !== 'black')) return;
    const ok = room.game.movePiece(
      move.fromRow, move.fromCol,
      move.toRow, move.toCol,
      move.promoteTo
    );
    if (ok) {
      move.ply = room.game.ply;
      io.to(roomId).emit('opponent_move', move);
      if (room.game.gameOver) io.to(roomId).emit('sync_state', room.game.toJSON());
    }
  });

  socket.on('offer_draw', ({ roomId }) => {
    const room = chessRooms.get(roomId);
    if (!room || room.game.gameOver) return;
    if (socket.id === room.white.socketId && room.black) io.to(room.black.socketId).emit('draw_offered');
    else if (room.black && socket.id === room.black.socketId) io.to(room.white.socketId).emit('draw_offered');
  });

  socket.on('draw_response', ({ roomId, accepted }) => {
    const room = chessRooms.get(roomId);
    if (!room || room.game.gameOver) return;
    if (accepted) {
      room.game.gameOver = true;
      room.game.status = 'stalemate';
      room.game.winner = 'draw (agreement)';
      io.to(roomId).emit('sync_state', room.game.toJSON());
    } else {
      const target = socket.id === room.white.socketId ? room.black?.socketId : room.white.socketId;
      if (target) io.to(target).emit('draw_declined');
    }
  });

  socket.on('resign', ({ roomId }) => {
    const room = chessRooms.get(roomId);
    if (!room) return;
    let color = null;
    if (room.white && socket.id === room.white.socketId) color = 'white';
    else if (room.black && socket.id === room.black.socketId) color = 'black';
    if (color) {
      room.game.resign(color);
      io.to(roomId).emit('player_resigned', color);
    }
  });

  socket.on('disconnect', () => {
    chessRooms.forEach((room, roomId) => {
      let color = null;
      if (room.white && socket.id === room.white.socketId) color = 'white';
      else if (room.black && socket.id === room.black.socketId) color = 'black';
      if (color) {
        if (room.game.gameOver) return;
        io.to(roomId).emit('opponent_status', { status: 'disconnected', color, timeout: DISCONNECT_GRACE });
        room.timers[color] = setTimeout(() => {
          room.game.gameOver = true;
          room.game.status = 'timeout (disconnect)';
          room.game.winner = color === 'white' ? 'black' : 'white';
          io.to(roomId).emit('game_abandoned', { winner: room.game.winner, reason: 'disconnect' });
          chessRooms.delete(roomId);
        }, DISCONNECT_GRACE);
      } else {
        const i = room.spectators.indexOf(socket.id);
        if (i !== -1) room.spectators.splice(i, 1);
      }
    });
  });
});

// ----- Static & routes -----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Chess: Open-Chess (marble UI). Serve index directly (avoid iOS redirect loops)
app.get('/chess', (req, res) => {
  res.sendFile(path.join(repos, 'chess', 'public', 'index.html'));
});
app.use('/chess', express.static(path.join(repos, 'chess', 'public')));

// Breakout, Space Shooter: serve if build exists, else friendly message
const breakoutIndex = path.join(repos, 'breakout', 'build', 'index.html');
const spaceshooterIndex = path.join(repos, 'spaceshooter', 'build', 'index.html');
const gameUnavailable = (name) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:#e2e8f0;padding:20px;text-align:center;}
.box{max-width:320px;} h1{font-size:1.1rem;} p{color:#94a3b8;font-size:0.9rem;margin-top:8px;}</style></head>
<body><div class="box"><h1>${name}</h1><p>Game files not found on this server. Ensure the game repo is deployed and build folders exist.</p></div></body></html>`;
app.get('/breakout', (req, res) => {
  if (fs.existsSync(breakoutIndex)) return res.sendFile(breakoutIndex);
  res.status(200).type('html').send(gameUnavailable('Breakout'));
});
app.use('/breakout', express.static(path.join(repos, 'breakout', 'build')));
app.get('/spaceshooter', (req, res) => {
  if (fs.existsSync(spaceshooterIndex)) return res.sendFile(spaceshooterIndex);
  res.status(200).type('html').send(gameUnavailable('Space Shooter'));
});
app.use('/spaceshooter', express.static(path.join(repos, 'spaceshooter', 'build')));

// Square Off
const squareOffBuild = path.join(repos, 'squareoff', 'build', 'index.html');
app.use('/squareoff', express.static(path.join(repos, 'squareoff', 'build')));
app.get('/squareoff', (req, res) => {
  if (fs.existsSync(squareOffBuild)) return res.sendFile(squareOffBuild);
  res.type('html').send(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Square Off!</title>
<style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px;}
.box{max-width:360px;text-align:center;} h1{font-size:1.1rem;} p{color:#64748b;font-size:0.9rem;}</style></head>
<body><div class="box"><h1>Square Off!</h1><p>Run in game-ttt/repos/squareoff: <code>npm install && npm run build</code>, then restart this server.</p></div></body></html>`);
});

// Tic-Tac-Toe (TacToeTic): serve built app if present
const tttDist = path.join(repos, 'tictactoe', 'App', 'dist');
const tttIndex = path.join(tttDist, 'index.html');
app.get('/tictactoe', (req, res) => {
  if (fs.existsSync(tttIndex)) return res.sendFile(tttIndex);
  res.type('html').send(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tic-Tac-Toe</title>
<style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px;}
.box{max-width:360px;text-align:center;} h1{font-size:1.1rem;} p{color:#64748b;font-size:0.9rem;}</style></head>
<body><div class="box"><h1>Tic-Tac-Toe</h1><p>Run in game-ttt/repos/tictactoe/App: <code>npm install && npm run build</code>, then restart this server.</p></div></body></html>`);
});
app.use('/tictactoe', express.static(tttDist));

server.listen(PORT, () => {
  console.log('Spill games at http://localhost:' + PORT + ' (/, /chess, /tictactoe, /squareoff, /breakout, /spaceshooter)');
});
