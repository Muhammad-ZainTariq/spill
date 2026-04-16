/**
 * Builds docs/Dissertation_Spill_Notion.html from docs/dissertation_source.md
 * Run: node scripts/build-dissertation-notion-html.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mdPath = path.join(root, 'docs', 'dissertation_source.md');
const outPath = path.join(root, 'docs', 'Dissertation_Spill_Notion.html');

const SPILL_SECTION = `## Spill application: implemented features (artefact)

This section records what the Spill mobile application actually implements, so the dissertation is grounded in your product rather than only generic feed theory.

### Platform and stack

Spill is built with Expo and Expo Router (file-based routes). Firebase provides authentication, Cloud Firestore for data, Storage for user media, Cloud Functions where applicable, and integration with push notifications (device tokens stored on the user record). The client is React Native; real-time listeners update feeds and notifications when data changes.

### Roles and entry routing

After sign-in, the app resolves the user role. Administrators are sent to an admin area with screens for staff, login statistics, therapist management, flagged content, reports, and learning resources. Therapists are routed to a therapist workspace or to a verification flow if not yet verified. Other users enter the main tabbed experience. New or signed-out users see onboarding and authentication screens (signup, login, password reset, and related flows).

### Main navigation (typical user)

The primary interface uses bottom tabs: Home (house icon), Mood (heart), Connections (messages and social graph), and Matches (therapist matching). Home can show an unread notification badge; Connections can show an unread message badge. This structure matters for your evaluation: the feed is one surface among several that compete for attention.

### Home feed: queries, filters, and ranking

The home feed loads posts from Firestore with a global query ordered by creation time, newest first, limited to one hundred fifty documents. That establishes a shared candidate pool before per-user ranking.

Vent posts support an expiry time; expired vents are filtered out. Category filters (for example General, Anxiety Share, Depression Vent) are applied after the fetch when the user selects a category, which can leave far fewer than one hundred fifty candidates in niche views.

Ranking runs on the client. Each post gets a score from: recency (timestamp); a large follow-graph boost when the author is someone the viewer follows; a capped contribution from upvotes and comments; and a severe score penalty when a post is flagged for toxicity and not yet approved as safe. Results are deduplicated by post id, sorted by score descending, and cut to the top one hundred for display. A snapshot subscription reapplies the same logic when moderation fields or engagement counts change.

### Creating posts

The create-post flow supports text, fixed categories, optional image or video from the device library (uploaded to Firebase Storage), optional YouTube URLs with title lookup to help populate text, vent mode with configurable duration (stored in minutes, defaulting to twenty-four hours), and premium checks where your rules require them. Posts are written into Firestore and participate in the same moderation and reporting model as the rest of the app.

### Engagement, voting, and safety

Posts carry engagement statistics. The feed ordering uses flags such as flagged-for-toxicity and approved-safe timestamps so that unapproved flagged material is pushed down in the list. Admin tooling supports reviewing flagged items and user reports. This connects engineering behaviour to moderation policy in your ethics chapter.

### Live audio (podcast rooms)

Spill includes live podcast-style rooms: scheduled, live, ended, or cancelled states; host, co-host, speaker, and listener roles; optional raise-hand and speaker approval; LiveKit for real-time audio; listener counts; optional premium-only visibility; recording and replay-related fields; in-app room UI, overlay, and mini player; and push notifications when a session is starting or imminent. Transcript segments support live subtitling. Mention these features if your research questions cover live social audio as well as the text feed.

### Therapists, marketplace, and sessions

Therapist profiles, verification, marketplace listing, booking, sessions, resources, and reviews are implemented across dedicated routes. The Matches tab connects end users to therapists. Describe the journeys you tested in user research.

### Premium and payments

Premium status is enforced in relevant flows. Payment and premium welcome screens communicate unlocked capability. You can relate this to economic incentives for creators and listeners in your analysis.

### Messaging, games, groups, and challenges

The Connections area combines direct messaging (requests, blocking, reporting), group streaks, official challenges, and game invites that deep-link into in-browser games (for example tic-tac-toe or chess). Notifications route users into the correct conversation or game. These features interact with the same notification surface as the feed.

### Learning resources and documents

Resources can be listed and opened, including PDF-style reading flows for learning materials, with admin-side tooling to manage content.

### Administration

Admin routes cover dashboard entry, therapist oversight, flagged posts, reports, and resource management including assisted tooling for resource creation. Access is gated by server-side role checks in layout loaders in addition to client routing.

`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatInline(raw) {
  let s = String(raw);
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `⟪C${codes.length - 1}⟫`;
  });
  const parts = s.split(/\*\*/);
  let out = '';
  for (let j = 0; j < parts.length; j++) {
    out += j % 2 === 1 ? `<strong>${escapeHtml(parts[j])}</strong>` : escapeHtml(parts[j]);
  }
  out = out.replace(/⟪C(\d+)⟫/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return out;
}

function parseMarkdown(md) {
  const marker = '\n---\n\n## 1. Introduction';
  if (!md.includes(marker)) throw new Error('Could not find divider before ## 1. Introduction');
  md = md.replace(marker, `\n---\n\n${SPILL_SECTION.trim()}\n\n---\n\n## 1. Introduction`);

  const lines = md.split(/\n/);
  const html = [];
  let i = 0;
  let h1Done = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '---') {
      html.push('<hr class="notion-divider" />');
      i++;
      continue;
    }

    if (trimmed.startsWith('# ') && !h1Done) {
      const t = trimmed.slice(2);
      html.push(`<h1>${formatInline(t)}</h1>`);
      h1Done = true;
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const t = trimmed.slice(3);
      const id = slugify(t);
      html.push(`<h2 id="${id}">${formatInline(t)}</h2>`);
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const t = trimmed.slice(4);
      html.push(`<h3>${formatInline(t)}</h3>`);
      i++;
      continue;
    }

    // Table: header | --- |
    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      html.push(parseTable(tableLines));
      continue;
    }

    // LaTeX display \[ ... \]
    if (trimmed === '\\[') {
      const eq = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '\\]') {
        eq.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre class="equation">${escapeHtml(eq.join('\n'))}</pre>`);
      continue;
    }

    if (trimmed === '') {
      i++;
      continue;
    }

    // Block paragraph or list: collect until blank
    const block = [];
    while (i < lines.length && lines[i].trim() !== '') {
      const ln = lines[i];
      if (ln.trim().startsWith('#')) break;
      if (ln.trim() === '---') break;
      if (ln.trim().startsWith('|')) break;
      if (ln.trim() === '\\[') break;
      block.push(ln);
      i++;
    }
    const btext = block.join('\n');
    if (/^[-*]\s/m.test(btext) || btext.trim().startsWith('- ') || btext.trim().startsWith('* ')) {
      const items = btext.split(/\n/).filter((l) => l.trim());
      html.push('<ul>');
      for (const it of items) {
        const m = it.match(/^[-*]\s+(.*)$/);
        if (m) html.push(`<li>${formatInline(m[1])}</li>`);
      }
      html.push('</ul>');
      continue;
    }
    if (/^\d+\.\s/.test(btext.trim())) {
      const items = btext.split(/\n/).filter((l) => l.trim());
      html.push('<ol>');
      for (const it of items) {
        const m = it.match(/^\d+\.\s+(.*)$/);
        if (m) html.push(`<li>${formatInline(m[1])}</li>`);
      }
      html.push('</ol>');
      continue;
    }
    // Multi-line paragraph: split by double space for simplicity join as one p with br - use single p with formatInline per line merged
    const paras = btext.split(/\n\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
    for (const p of paras) {
      html.push(`<p>${formatInline(p)}</p>`);
    }
  }

  return html.join('\n');
}

function parseTable(rows) {
  if (rows.length < 2) return `<p>${formatInline(rows.join(' '))}</p>`;
  const cells = (r) =>
    r
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const header = cells(rows[0]);
  const sep = cells(rows[1]);
  const isSep = sep.every((c) => /^:?-+-?:?$/.test(c.replace(/\s/g, '')) || c === '');
  const bodyRows = isSep ? rows.slice(2) : rows.slice(1);
  let out = '<table><thead><tr>';
  for (const h of header) out += `<th>${formatInline(h)}</th>`;
  out += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    const cs = cells(row);
    if (cs.length === 1 && !cs[0]) continue;
    out += '<tr>';
    for (const c of cs) out += `<td>${formatInline(c)}</td>`;
    out += '</tr>';
  }
  out += '</tbody></table>';
  return out;
}

let bodyInner = parseMarkdown(fs.readFileSync(mdPath, 'utf8'));
bodyInner = bodyInner.replace(/<li>\[([^\]]+)\]\([^)]*\)\s*<\/li>/g, '<li>$1</li>');

const fullHtml = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dissertation — Allocating Attention in Social Feeds (Spill)</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #37352f;
      --muted: #787774;
      --border: #e9e9e7;
      --accent: #2383e2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif;
      font-size: 16px;
      line-height: 1.65;
      color: var(--text);
      background: var(--bg);
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: rgba(255,255,255,0.92);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(8px);
    }
    .toolbar button {
      font: inherit;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #f7f6f3;
      cursor: pointer;
      color: var(--text);
    }
    .toolbar button:hover { background: #efedea; }
    .toolbar span { font-size: 13px; color: var(--muted); }
    #main-content {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 80px;
    }
    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 0.5em;
      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 1.4rem;
      font-weight: 600;
      margin: 2em 0 0.6em;
      padding-top: 0.5em;
      letter-spacing: -0.01em;
    }
    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 1.5em 0 0.5em;
      color: #37352f;
    }
    p { margin: 0 0 0.85em; }
    ul, ol { margin: 0 0 1em 1.25em; padding: 0; }
    li { margin-bottom: 0.35em; }
    strong { font-weight: 600; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88em;
      background: #f7f6f3;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    .notion-divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2em 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
      margin: 1em 0 1.5em;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f7f6f3;
      font-weight: 600;
    }
    pre.equation {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85em;
      background: #f7f6f3;
      padding: 12px 14px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1em 0;
      white-space: pre-wrap;
    }
    @media print {
      .toolbar { display: none; }
      #main-content { padding-top: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" id="copy-all">Copy entire document</button>
    <span>Select all in the page works too (Cmd+A).</span>
  </div>
  <main id="main-content">
${bodyInner}
  </main>
  <script>
    document.getElementById('copy-all').addEventListener('click', async () => {
      const el = document.getElementById('main-content');
      try {
        await navigator.clipboard.writeText(el.innerText);
        const b = document.getElementById('copy-all');
        const t = b.textContent;
        b.textContent = 'Copied';
        setTimeout(() => { b.textContent = t; }, 2000);
      } catch (e) {
        const r = document.createRange();
        r.selectNode(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
        document.execCommand('copy');
        alert('Copied via fallback selection.');
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(outPath, fullHtml, 'utf8');
console.log('Wrote', outPath);
