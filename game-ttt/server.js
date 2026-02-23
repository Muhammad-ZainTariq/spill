/**
 * Spill games server. Serves ready-made games from cloned repos:
 * /squareoff (Square Off - build in repos/squareoff/build), /breakout, /spaceshooter.
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const repos = path.join(__dirname, 'repos');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Ready-made games: serve static build folders. App passes ?room= for match ID.
app.get('/breakout', (req, res) => res.sendFile(path.join(repos, 'breakout', 'build', 'index.html')));
app.use('/breakout', express.static(path.join(repos, 'breakout', 'build')));

app.get('/spaceshooter', (req, res) => res.sendFile(path.join(repos, 'spaceshooter', 'build', 'index.html')));
app.use('/spaceshooter', express.static(path.join(repos, 'spaceshooter', 'build')));

// Square Off: serve build if present, else stub
const squareOffBuild = path.join(repos, 'squareoff', 'build', 'index.html');
app.use('/squareoff', express.static(path.join(repos, 'squareoff', 'build')));
app.get('/squareoff', (req, res) => {
  const fs = require('fs');
  if (fs.existsSync(squareOffBuild)) return res.sendFile(squareOffBuild);
  res.type('html').send(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Square Off!</title>
<style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px;}
.box{max-width:360px;text-align:center;} h1{font-size:1.1rem;} p{color:#64748b;font-size:0.9rem;}</style></head>
<body><div class="box"><h1>Square Off!</h1><p>Run in game-ttt/repos/squareoff: <code>npm install && npm run build</code>, then restart this server.</p></div></body></html>`);
});

app.listen(PORT, () => {
  console.log('Spill games at http://localhost:' + PORT + ' (/, /squareoff, /breakout, /spaceshooter)');
});
