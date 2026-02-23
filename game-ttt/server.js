/**
 * Minimal static server for Spill.
 * No custom games. Use ready-made games only: deploy Square Off, Breakout, Space-Shooter
 * at paths /squareoff, /breakout, /spaceshooter (with ?room= support). Set gameBaseUrl in app.json.
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Stub routes so app doesn't 404. Replace with real ready-made games when deployed.
const stubPage = (title) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px;}
.box{max-width:360px;text-align:center;} h1{font-size:1.1rem;color:#0f172a;} p{color:#64748b;font-size:0.9rem;}</style></head>
<body><div class="box"><h1>${title}</h1><p>Deploy the ready-made game here with <code>?room=</code> support. See READY_MADE_GAMES.md in the Spill repo.</p></div></body></html>`;
app.get('/squareoff', (req, res) => res.type('html').send(stubPage('Square Off!')));
app.get('/breakout', (req, res) => res.type('html').send(stubPage('Breakout')));
app.get('/spaceshooter', (req, res) => res.type('html').send(stubPage('Space Shooter')));

app.listen(PORT, () => {
  console.log('Spill games at http://localhost:' + PORT + ' (/, /squareoff, /breakout, /spaceshooter)');
});
