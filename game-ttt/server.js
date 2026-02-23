/**
 * Spill games server. Ready-made games: Square Off, Breakout, Space Shooter, Chess, Tic-Tac-Toe.
 * App passes ?room= for match ID. Socket.io for Chess (room-based).
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

// ----- Chess (ready-made Web-Chess): Socket.io room logic -----
const chessUsers = [];
function chessUserJoin(id, username, room, piece) {
  const user = { id, username, room, piece };
  chessUsers.push(user);
  return user;
}
function chessGetUser(id) {
  return chessUsers.find(u => u.id === id);
}
const chessNumClients = {};
io.on('connection', (socket) => {
  socket.on('joinRoom', ({ username, room }) => {
    if (!username || !room) return;
    const r = String(room).slice(0, 50);
    const name = String(username).trim().slice(0, 30) || 'Player';
    if (chessNumClients[r] === 2) {
      socket.emit('roomFull', `${r} is full`);
      return;
    }
    if (chessNumClients[r] == null) {
      const user = chessUserJoin(socket.id, name, r, 'w');
      chessNumClients[r] = 1;
      socket.join(r);
      socket.emit('message', `Your color is: ${user.piece}`);
      socket.broadcast.to(r).emit('message', `${name} has joined, piece is ${user.piece}`);
    } else {
      const user = chessUserJoin(socket.id, name, r, 'b');
      socket.join(r);
      socket.emit('message', `Your color is: ${user.piece}`);
      socket.broadcast.to(r).emit('message', `${name} has joined, piece is ${user.piece}`);
      socket.broadcast.to(r).emit('Color', user.piece);
      chessNumClients[r]++;
    }
  });
  socket.on('move', (msg) => {
    const user = chessGetUser(socket.id);
    if (user) io.to(user.room).emit('move', msg);
  });
  socket.on('undoMove', (msg) => { socket.emit('undoMove', msg); });
  socket.on('turn', (turn) => {
    const user = chessGetUser(socket.id);
    if (!user) return;
    socket.emit('turnValidity', user.piece === turn);
  });
  socket.on('disconnect', () => {
    const user = chessGetUser(socket.id);
    if (user) {
      chessNumClients[user.room] = (chessNumClients[user.room] || 1) - 1;
      if (chessNumClients[user.room] <= 0) delete chessNumClients[user.room];
      const idx = chessUsers.findIndex(u => u.id === socket.id);
      if (idx !== -1) chessUsers.splice(idx, 1);
      io.to(user.room).emit('message', 'User left');
    }
  });
});

// ----- Static & routes -----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Chess: serve room.html with ?room= from app; static under /chess
app.get('/chess', (req, res) => {
  const room = (req.query.room || '').toString().trim() || '1';
  const username = (req.query.username || 'Player').toString().trim().slice(0, 30) || 'Player';
  res.redirect(302, `/chess/room.html?room=${encodeURIComponent(room)}&username=${encodeURIComponent(username)}`);
});
app.use('/chess', express.static(path.join(repos, 'chess', 'public')));

// Breakout, Space Shooter
app.get('/breakout', (req, res) => res.sendFile(path.join(repos, 'breakout', 'build', 'index.html')));
app.use('/breakout', express.static(path.join(repos, 'breakout', 'build')));
app.get('/spaceshooter', (req, res) => res.sendFile(path.join(repos, 'spaceshooter', 'build', 'index.html')));
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
