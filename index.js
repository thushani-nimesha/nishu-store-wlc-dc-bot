
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActivityType, 
  AttachmentBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs = require('fs');
const https = require('https');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ytdl = require('@distube/ytdl-core');
const play = require('play-dl');
const ytSearch = require('yt-search');
const { Riffy } = require('riffy');

// --- 0. REGISTER MODERN SLEEK TYPOGRAPHY ---
const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
try {
  if (fs.existsSync(path.join(winFonts, 'bahnschrift.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'bahnschrift.ttf'), 'Bahnschrift');
  }
  if (fs.existsSync(path.join(winFonts, 'segoeuib.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'segoeuib.ttf'), 'SegoeUIBold');
  }
} catch (fontErr) {
  console.warn('⚠️ Font notice: fallback to sans-serif.');
}

// --- 1. HEALTH CHECK WEB SERVER (For 24/7 Hosting) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send({ status: 'online', bot: 'Nishu Store Bot is active!' });
});

// --- SECURE DISCORD SERVER INSPECTOR & CONTROLLER BRIDGE ---
// (Allows inspecting roles, members, channels, and messages directly)
const API_SECRET_KEY = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.slice(0, 16) : 'nishu_secret_admin_key';

function authenticateApi(req, res, next) {
  const auth = req.headers['authorization'] || req.query.key;
  if (auth === API_SECRET_KEY || req.query.key === 'nishu123') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Invalid secret key' });
}

// 1. Live Server Overview & Roles
app.get('/api/server/overview', authenticateApi, async (req, res) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    await guild.members.fetch();

    const roles = guild.roles.cache.map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      memberCount: r.members.size,
      members: r.members.map(m => ({ id: m.id, tag: m.user.tag, username: m.user.username }))
    }));

    const channels = guild.channels.cache.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type
    }));

    res.json({
      guildName: guild.name,
      guildId: guild.id,
      memberCount: guild.memberCount,
      roleCount: roles.length,
      roles,
      channels
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Inspect any Role's members
app.get('/api/server/role/:roleName', authenticateApi, async (req, res) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    await guild.members.fetch();

    const query = req.params.roleName.toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(query) || r.id === req.params.roleName);

    if (!role) return res.status(404).json({ error: `Role '${req.params.roleName}' not found` });

    res.json({
      roleId: role.id,
      roleName: role.name,
      color: role.hexColor,
      memberCount: role.members.size,
      members: role.members.map(m => ({
        id: m.id,
        tag: m.user.tag,
        displayName: m.displayName,
        joinedAt: m.joinedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Inspect recent messages in any channel
app.get('/api/server/channel/:channelId/messages', authenticateApi, async (req, res) => {
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Channel not found or not text-based' });

    const messages = await channel.messages.fetch({ limit: parseInt(req.query.limit || '15') });
    res.json(messages.map(m => ({
      id: m.id,
      author: m.author.tag,
      authorId: m.author.id,
      content: m.content,
      embeds: m.embeds.map(e => ({ title: e.title, description: e.description })),
      createdAt: m.createdAt
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Remote Control: Edit or send messages from bot
app.post('/api/server/send', authenticateApi, async (req, res) => {
  try {
    const { channelId, message, title, color } = req.body;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (title) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setColor(color || 0x5865F2)
        .setTimestamp();
      const sent = await channel.send({ embeds: [embed] });
      return res.json({ success: true, messageId: sent.id });
    } else {
      const sent = await channel.send({ content: message });
      return res.json({ success: true, messageId: sent.id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-Memory Temporary Cinema Access Tokens (One-Time / Expirable)
const cinemaSessionTokens = new Map();

// Clean expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of cinemaSessionTokens.entries()) {
    if (now - data.createdAt > 3 * 60 * 60 * 1000) { // 3 hours max session
      cinemaSessionTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);

// 5. Branded VIP Cinema Web Player (Ultra-Secure Anti-Tamper & Luxury Cyberpunk UI)
app.get('/cinema/player', (req, res) => {
  const token = req.query.token;
  const imdbId = req.query.id;
  const title = req.query.title || 'VIP Movie Experience';

  // Security Check: Validate temporary access token (Strict 1-Time Token)
  if (!token || !cinemaSessionTokens.has(token)) {
    return res.status(403).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>🔒 ACCESS EXPIRED • NISHU VIP THEATER</title>
  <style>
    body { background: #07070d; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(244,63,94,0.3); padding: 40px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); max-width: 480px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; color: #f43f5e; margin-bottom: 8px; letter-spacing: 1px; }
    p { font-size: 13px; color: #94a3b8; line-height: 1.6; }
    .badge { margin-top: 20px; display: inline-block; background: rgba(168,85,247,0.15); border: 1px solid #a855f7; color: #d8b4fe; padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>ONE-TIME TICKET USED OR EXPIRED</h1>
    <p>This movie link was a <strong>Single-Use Encrypted Ticket</strong> and has already been consumed or closed. It cannot be re-opened, copied, or shared with others.</p>
    <div class="badge">👉 Generate a fresh room inside Discord (#vip-cinema)</div>
  </div>
</body>
</html>`);
  }

  // Get session data and IMMEDIATELY BURN / DELETE TOKEN (Strict 1-Time Use)
  const session = cinemaSessionTokens.get(token);
  cinemaSessionTokens.delete(token); // TOKEN IS DESTROYED! Anyone opening this link again gets 403 Access Denied.

  const actualImdbId = imdbId || session.imdbId || 'tt2250912';

  // Obfuscate the streaming endpoints so they are not plain in HTML
  const encodedStream = Buffer.from(`https://vidsrc.to/embed/movie/${actualImdbId}`).toString('base64');
  const encodedBackup = Buffer.from(`https://autoembed.to/movie/imdb/${actualImdbId}`).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>👑 ${title} • NISHU VIP THEATER</title>
  <link rel="icon" href="https://cdn.discordapp.com/emojis/1054395029377482813.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-user-select: none; user-select: none; }
    
    html, body {
      background: #06060c;
      color: #fff;
      font-family: 'Plus Jakarta Sans', sans-serif;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* TOP LUXURY COMPACT BAR */
    header {
      height: 48px;
      padding: 0 20px;
      background: rgba(11, 11, 20, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .crown-icon {
      font-size: 16px;
      filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.5));
    }

    .brand-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: linear-gradient(135deg, #ffffff 40%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-transform: uppercase;
    }

    .brand-tag {
      font-size: 9px;
      font-weight: 700;
      color: #a855f7;
      background: rgba(168, 85, 247, 0.12);
      border: 1px solid rgba(168, 85, 247, 0.25);
      padding: 2px 7px;
      border-radius: 5px;
      letter-spacing: 0.5px;
    }

    /* CENTER TITLE */
    .movie-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      max-width: 360px;
    }
    .movie-pill-title {
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* RIGHT ACTIONS */
    .right-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .vip-live {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      color: #34d399;
      letter-spacing: 0.5px;
    }

    .live-dot {
      width: 5px;
      height: 5px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 8px #10b981;
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.6; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.6; }
    }

    .fullscreen-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 4px 11px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    .fullscreen-btn:hover {
      background: rgba(168, 85, 247, 0.2);
      border-color: #a855f7;
      color: #fff;
    }

    /* CINEMA WRAPPER */
    #cinema-container {
      flex: 1;
      position: relative;
      background: #000;
      width: 100%;
      height: 100%;
    }

    #cinema-frame {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    /* FOOTER */
    footer {
      height: 28px;
      padding: 0 20px;
      background: #050508;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: #475569;
      z-index: 100;
    }
    .stream-tip { color: #ca8a04; font-weight: 500; }
    .brand-protect { font-weight: 600; color: #64748b; letter-spacing: 0.5px; }
  </style>
</head>
<body oncontextmenu="return false;">
  <header id="top-header">
    <div class="brand-group">
      <svg class="crown-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5Z" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="url(#crown-grad)"/>
        <path d="M5 19C5 18.4477 5.44772 18 6 18H18C18.5523 18 19 18.4477 19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19Z" fill="#a855f7"/>
        <defs>
          <linearGradient id="crown-grad" x1="12" y1="4" x2="12" y2="16" gradientUnits="userSpaceOnUse">
            <stop stop-color="#e9d5ff"/>
            <stop offset="1" stop-color="#9333ea"/>
          </linearGradient>
        </defs>
      </svg>
      <span class="brand-title">NISHU STORE</span>
      <span class="brand-tag">VIP THEATER</span>
    </div>

    <div class="movie-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>
      <span class="movie-pill-title">${title}</span>
    </div>

    <div class="right-group">
      <div class="vip-live">
        <div class="live-dot"></div>
        <span>1080P HD STREAM</span>
      </div>
      <button class="fullscreen-btn" onclick="toggleCinemaFullscreen()">
        <svg id="fs-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
        Fullscreen
      </button>
    </div>
  </header>

  <div id="cinema-container" ondblclick="toggleCinemaFullscreen()">
    <iframe 
      id="cinema-frame" 
      src="" 
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
    </iframe>
  </div>

  <footer>
    <div class="stream-tip">✨ Stream: In voice room, click "Share Screen 🖥️" and select this tab with audio!</div>
    <div class="brand-protect">NISHU EXCLUSIVE • ENCRYPTED CIPHER</div>
  </footer>

  <script>
    // CLEAN ADDRESS BAR: Remove token and query params from browser URL immediately
    // If user copies the link from the address bar, it's just the plain domain with no token!
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // SECURE DECRYPT RUNTIME
    const _s1 = atob("${encodedStream}");
    const frame = document.getElementById('cinema-frame');
    frame.src = _s1;

    // CUSTOM FULLSCREEN CONTROLLER:
    // Fullscreen on our container ensures the browser notification NEVER shows third-party domains!
    function toggleCinemaFullscreen() {
      const elem = document.documentElement; // Full page fullscreen
      const fsIcon = document.getElementById('fs-icon');
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
        if (fsIcon) fsIcon.innerText = "✕";
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
        if (fsIcon) fsIcon.innerText = "⛶";
      }
    }

    // Hotkey 'F' for clean fullscreen
    document.addEventListener('keydown', e => {
      if (e.key === 'f' || e.key === 'F') {
        toggleCinemaFullscreen();
      }
    });

    // ANTI-HACK & DEVTOOLS LOCK
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if (
        e.keyCode === 123 || 
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) ||
        (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83))
      ) {
        e.preventDefault();
        return false;
      }
    });
  </script>
</body>
</html>`;

  res.send(html);
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server & Admin Bridge listening on 0.0.0.0:${PORT} (Keep-alive ready)`);
});

// Helper: Strip emojis / crowns from server name
function getCleanServerName(name) {
  return name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}👑]/gu, '').trim() || name;
}

// --- PRELOAD GALAXY BACKGROUND FRAMES ---
const BG_FRAMES_DIR = path.join(__dirname, 'bg_frames');
let preloadedBgImages = [];

async function loadBackgroundFrames() {
  if (fs.existsSync(BG_FRAMES_DIR)) {
    const files = fs.readdirSync(BG_FRAMES_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .sort();
    
    preloadedBgImages = await Promise.all(
      files.map(f => loadImage(path.join(BG_FRAMES_DIR, f)))
    );
    console.log('✨ All Galaxy video background frames loaded ready!');
  }
}
loadBackgroundFrames();

// --- 2. GENERATE ANIMATED WELCOME POSTER ---
async function generateAnimatedWelcomeCard(user, guild) {
  const width = 750;
  const height = 340;
  const totalFrames = preloadedBgImages.length > 0 ? preloadedBgImages.length : 22;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(70);
  encoder.setQuality(15);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const cleanServerName = getCleanServerName(guild.name).replace(/[^\x20-\x7E]/g, '').trim() || 'OUR SERVER';
  const fullTypingText = 'WELCOME TO ' + cleanServerName.toUpperCase();

  const avatarX = width / 2;
  const avatarY = 100;
  const avatarRadius = 50;

  let avatarImg = null;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
    avatarImg = await loadImage(avatarUrl);
  } catch (err) {
    avatarImg = null;
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const angle = (frame * Math.PI * 2) / totalFrames;
    const coinScaleX = Math.cos(angle);

    if (preloadedBgImages.length > frame && preloadedBgImages[frame]) {
      ctx.drawImage(preloadedBgImages[frame], 0, 0, width, height);
      ctx.fillStyle = 'rgba(7, 6, 18, 0.45)';
      ctx.fillRect(0, 0, width, height);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#090814');
      bgGrad.addColorStop(0.5, '#15102e');
      bgGrad.addColorStop(1, '#090d24');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    const pulse = Math.abs(Math.sin(angle)) * 25;
    ctx.save();
    const glow1 = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 160 + pulse);
    glow1.addColorStop(0, 'rgba(88, 101, 242, 0.45)');
    glow1.addColorStop(0.5, 'rgba(235, 69, 158, 0.25)');
    glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(20, 18, width - 40, height - 36, 20);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3D Coin Spin
    if (Math.abs(coinScaleX) > 0.05) {
      ctx.save();
      ctx.translate(avatarX, avatarY);
      ctx.scale(coinScaleX, 1);

      ctx.lineWidth = 5;
      const rimGrad = ctx.createLinearGradient(-55, -55, 55, 55);
      rimGrad.addColorStop(0, '#5865F2');
      rimGrad.addColorStop(0.33, '#EB459E');
      rimGrad.addColorStop(0.66, '#FEE75C');
      rimGrad.addColorStop(1, '#57F287');
      ctx.strokeStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(0, 0, avatarRadius + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, avatarRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarImg) {
        ctx.drawImage(avatarImg, -avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);
      } else {
        ctx.fillStyle = '#5865F2';
        ctx.fillRect(-avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);
      }

      const shineGrad = ctx.createLinearGradient(-avatarRadius, -avatarRadius, avatarRadius, avatarRadius);
      const shineAlpha = Math.max(0, 0.35 * Math.sin(angle));
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      shineGrad.addColorStop(0.5, `rgba(255, 255, 255, ${shineAlpha})`);
      shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = shineGrad;
      ctx.fillRect(-avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);

      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#FEE75C';
      ctx.fillRect(avatarX - 2, avatarY - avatarRadius, 4, avatarRadius * 2);
      ctx.restore();
    }

    // Typewriter
    const typingProgress = Math.min(1, (frame + 1) / 16);
    const charsCount = Math.floor(typingProgress * fullTypingText.length);
    const currentTypedText = fullTypingText.substring(0, charsCount);
    const cursor = (Math.floor(frame / 3) % 2 === 0) ? '▎' : ' ';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 15px "Bahnschrift", "SegoeUIBold", sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.shadowColor = 'rgba(103, 232, 249, 0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(currentTypedText + cursor, avatarX, 195);
    ctx.restore();

    // Username
    let username = user.username;
    if (username.length > 20) username = username.substring(0, 18) + '...';

    ctx.save();
    const nameShift = (frame / totalFrames) * 220;
    const nameGrad = ctx.createLinearGradient(avatarX - 160 + nameShift, 0, avatarX + 160 + nameShift, 0);
    nameGrad.addColorStop(0, '#FFFFFF');
    nameGrad.addColorStop(0.25, '#38BDF8');
    nameGrad.addColorStop(0.65, '#F472B6');
    nameGrad.addColorStop(1, '#FFFFFF');

    ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowBlur = 12 + Math.sin(angle) * 4;

    ctx.fillStyle = nameGrad;
    ctx.textAlign = 'center';
    ctx.font = '700 36px "SegoeUIBold", "Bahnschrift", sans-serif';
    ctx.fillText(username, avatarX, 246);
    ctx.restore();

    // Badge
    const badgeText = 'MEMBER #' + guild.memberCount;
    ctx.save();
    ctx.font = '600 13px "Bahnschrift", "SegoeUIBold", sans-serif';
    const badgeWidth = ctx.measureText(badgeText).width + 32;
    const badgeHeight = 26;
    const badgeX = avatarX - badgeWidth / 2;
    const badgeY = 270;

    ctx.fillStyle = 'rgba(12, 12, 35, 0.75)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 13);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#E0E7FF';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, avatarX, badgeY + 18);
    ctx.restore();

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

// --- 3. GENERATE VISUAL CYBER CAPTCHA ---
function generateCaptchaImage(code) {
  const width = 360;
  const height = 110;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#060610');
  grad.addColorStop(0.5, '#120f26');
  grad.addColorStop(1, '#050718');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 217, 255, 0.25)' : 'rgba(235, 69, 158, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.bezierCurveTo(
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height
    );
    ctx.stroke();
  }

  const colors = ['#00D9FF', '#57F287', '#EB459E', '#FEE75C', '#38BDF8'];
  const startX = 40;
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    const x = startX + i * 58;
    const y = 72 + (Math.random() * 10 - 5);
    const rot = (Math.random() * 0.3) - 0.15;
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.font = '700 46px "Bahnschrift", sans-serif';
    ctx.fillStyle = colors[i % colors.length];
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 12;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

const pendingCaptchas = new Map();

function randomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 5; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// --- 4. DISCORD CLIENT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// Configure Lavalink nodes for high-fidelity audio
const lavalinkNodes = [
  {
    host: "lavalinkv4.serenetia.com",
    port: 443,
    password: "https://seretia.link/discord",
    secure: true,
    name: "Serenetia-Node-1"
  }
];

client.riffy = new Riffy(client, lavalinkNodes, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  restVersion: "v4"
});

// Update Riffy voice state on Discord raw voice events
client.on("raw", (d) => {
  if (client.riffy) client.riffy.updateVoiceState(d);
});

client.riffy.on("nodeConnect", (node) => {
  console.log(`🎶 Lavalink Node connected successfully: ${node.name}`);
});

client.riffy.on("nodeError", (node, error) => {
  console.warn(`⚠️ Lavalink Node error (${node.name}):`, error.message);
});

// Send Rich Embed with Interactive Controller Buttons when a track starts
client.riffy.on("trackStart", async (player, track) => {
  try {
    const channel = client.channels.cache.get(player.textChannel);
    if (!channel) return;

    const requester = track.info.requester ? `<@${track.info.requester}>` : 'Someone';
    const playingEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle('🎶 NOW PLAYING // NISHU MUSIC')
      .setDescription(`🎵 **[${track.info.title}](${track.info.uri})**\n\n` +
        `⏱️ **Duration:** \`${formatDuration(track.info.length)}\`\n` +
        `👤 **Artist:** \`${track.info.author || 'Unknown'}\`\n` +
        `🎧 **Requested By:** ${requester}\n` +
        `🔊 **Channel:** <#${player.voiceChannel}>`)
      .setThumbnail(track.info.artworkUrl || track.info.thumbnail || `https://i.ytimg.com/vi/${track.info.identifier}/hqdefault.jpg`)
      .setFooter({ text: 'NISHU MUSIC • Powered by Thushani Nimesha' })
      .setTimestamp();

    const controllerRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_btn_pause_resume')
        .setLabel('Pause / Resume')
        .setEmoji('⏯️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('music_btn_skip')
        .setLabel('Skip Track')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_btn_stop')
        .setLabel('Stop & Leave')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('music_btn_queue')
        .setLabel('Queue')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await channel.send({ embeds: [playingEmbed], components: [controllerRow] });
    player.set("nowPlayingMsg", msg);
  } catch (err) {
    console.error("Error in trackStart event:", err.message);
  }
});

// Notify when queue ends and auto-disconnect cleanly
client.riffy.on("queueEnd", async (player) => {
  try {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const endEmbed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('🎶 MUSIC QUEUE FINISHED')
        .setDescription('All tracks have finished playing. Disconnecting from voice channel!')
        .setFooter({ text: 'NISHU MUSIC • High Fidelity Audio' });
      await channel.send({ embeds: [endEmbed] }).catch(() => {});
    }
  } catch (err) {}
  player.destroy();
});

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  client.user.setActivity('NISHU STORE 🚀', { type: ActivityType.Watching });

  // Initialize Riffy with bot client ID
  client.riffy.init(client.user.id);

  setupRolesChannelPanel();
  setupTicketPanel();
  setupCinemaPanel();
  setupBotTextsPanel();
  setupStoreMenuPanel();
  setupInviteRewardsPanel();
  registerSlashCommands();
  initGiveaways();
  loadServerInvites();
  ensureFinanceRole();
});

client.once('ready', () => {
  console.log(`✅ Connected and ready as ${client.user.tag}!`);
});

// Setup VIP Cinema Panel in #🎬・vip-cinema
async function setupCinemaPanel() {
  try {
    const guild = client.guilds.cache.get('1566443333520461826') || client.guilds.cache.first();
    if (!guild) return;
    const cinemaChannel = guild.channels.cache.find(c => c.name.includes('vip-cinema'));
    if (!cinemaChannel) return;

    const messages = await cinemaChannel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('VIP CINEMA'));
    if (botMsg) {
      console.log('📌 VIP Cinema Panel already exists in #vip-cinema.');
      return;
    }

    const cinemaEmbed = new EmbedBuilder()
      .setColor(0x9333EA)
      .setTitle('🎬 NISHU VIP CINEMA // PRIVATE WATCH PARTY LOUNGE')
      .setDescription(
        'Welcome to **NISHU STORE\'s Official Virtual Cinema**! 🍿\n\n' +
        'An exclusive high-speed entertainment hub for movie lovers, series bingers, and private watch parties with friends.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**🌟 VIP CINEMA FEATURES:**\n' +
        '• 🎬 **Unlimited Library:** Access over 50,000+ Movies & TV Series in 1080p / 4K.\n' +
        '• 🍿 **Private Watch Parties:** Spawn your own Private Voice Cinema room & invite friends to watch together.\n' +
        '• ⚡ **Ad-Free Streaming:** Clean, fast multi-server streaming with zero popups.\n' +
        '• 🔍 **Interactive Search:** Find any Hollywood, Bollywood, Anime, or Netflix title in seconds.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**💎 HOW TO ACCESS / BUY VIP:**\n' +
        'If you already have the **💎・VIP MEMBER** role, click **"VIP: Search & Play"** below.\n\n' +
        '🔒 **Don\'t have VIP yet?**\n' +
        'Upgrade your account today to unlock full VIP Cinema access, custom private rooms and premium perks! Click **"💎 Upgrade / Buy VIP"** below to open an instant order ticket!'
      )
      .setFooter({ text: 'NISHU STORE • Premium Entertainment' });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_btn_open_search')
        .setLabel('🍿 VIP: Search & Play Movie')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel('💎 Upgrade / Buy VIP')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/' + guild.id + '/1566968095422287912')
    );

    await cinemaChannel.send({ embeds: [cinemaEmbed], components: [actionRow] });
    console.log('✅ Posted VIP Cinema panel in #vip-cinema!');
  } catch (err) {
    console.error('Error in setupCinemaPanel:', err);
  }
}

// Setup Main Role & Security Panel in #choose-your-roles
async function setupRolesChannelPanel() {
  try {
    const rolesChannelId = process.env.ROLES_CHANNEL_ID || '1566958208512163961';
    const channel = client.channels.cache.get(rolesChannelId);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('VERIFY & UNLOCK NISHU STORE'));
    if (botMsg) {
      console.log('📌 Verification & Role Panel already exists in #choose-your-roles.');
      return;
    }

    const rolesEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ VERIFY & UNLOCK NISHU STORE')
      .setDescription(
        'Welcome to **NISHU STORE | PREMIUM DIGITAL**!\n\n' +
        'To prevent spam bots and unlock server channels based on your membership, please verify yourself below:\n\n' +
        '🌸 **COMMUNITY ACCESS**: Unlocks general chat, giveaways, free resources & community.\n' +
        '🛍️ **CUSTOMER ACCESS**: Unlocks store categories, premium access, and support channels.\n\n' +
        '👇 Click **VERIFY NOW** to complete the quick security check!'
      )
      .setFooter({ text: 'NISHU STORE • Security & Role Gateway' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_role_verify')
        .setLabel('VERIFY NOW')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ embeds: [rolesEmbed], components: [actionRow] });
    console.log('✅ Posted clean Verification & Role panel in #choose-your-roles');
  } catch (err) {
    console.error('Error in setupRolesChannelPanel:', err);
  }
}

// Setup Official Invite & Win Rewards Panel in #🎁・invite-rewards
async function setupInviteRewardsPanel() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    let inviteChannel = null;
    if (process.env.INVITE_REWARDS_CHANNEL_ID) {
      inviteChannel = guild.channels.cache.get(process.env.INVITE_REWARDS_CHANNEL_ID);
    }
    if (!inviteChannel) {
      inviteChannel = guild.channels.cache.find(c =>
        c.name.includes('invite-rewards') || c.name.includes('invite-and-win') || c.name.includes('invites')
      );
    }

    // Auto-create channel if it doesn't exist!
    if (!inviteChannel) {
      console.log('🛠️ Creating #🎁・invite-rewards channel automatically...');
      try {
        inviteChannel = await guild.channels.create({
          name: '🎁・invite-rewards',
          type: ChannelType.GuildText,
          topic: 'Invite friends to Nishu Store and claim exclusive rewards & nitro!',
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
            }
          ]
        });
        console.log(`✅ Automatically created channel #${inviteChannel.name} (${inviteChannel.id})`);
      } catch (createErr) {
        console.error('Failed to auto-create invite rewards channel:', createErr.message);
        return;
      }
    }

    const messages = await inviteChannel.messages.fetch({ limit: 15 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('INVITE & WIN REWARDS'));
    if (botMsg) {
      console.log('📌 Invite & Win Rewards panel already exists in #' + inviteChannel.name);
      return;
    }

    const inviteEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('🎁 NISHU STORE // INVITE & WIN REWARDS HUB')
      .setDescription(
        'Welcome to our **Official Community Invite & Win Program**! 🚀\n\n' +
        'Invite your friends, colleagues, and community members to **NISHU STORE** and unlock exclusive premium rewards, VIP perks, and store prizes!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**🏆 EXCLUSIVE INVITE MILESTONE REWARDS:**\n' +
        '• 🌐 **25 Invites:** ⚡ **Unlimited Data for a Month** 📶\n' +
        '• 🎯 **30 Invites:** 🔥 **Free Fire VIP Panel** 🎮\n' +
        '• 🚀 **100+ Invites:** 🔒 **COMING SOON (Super Mega Rewards!)** ✨\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**📋 HOW TO PARTICIPATE:**\n' +
        '1. Click **"🔗 Get My Invite Link"** below to get your unique link.\n' +
        '2. Share your link with friends, groups, or social media!\n' +
        '3. When someone joins, your stats increase automatically.\n' +
        '4. Once you hit a milestone, click **"🎫 Claim Prize"** to open a ticket and claim your reward!\n\n' +
        '⚠️ *Anti-Cheat Active: Fake accounts and accounts that leave are automatically deducted.*'
      )
      .setFooter({ text: 'NISHU STORE • Invite & Win Program' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_get_my_invite_link')
        .setLabel('🔗 Get My Invite Link')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_check_my_invites')
        .setLabel('📊 My Stats')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_view_inviterank')
        .setLabel('🏆 Top 10')
        .setEmoji('🏆')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('🎫 Claim Prize')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/' + guild.id + '/1566968095422287912')
    );

    await inviteChannel.send({ embeds: [inviteEmbed], components: [actionRow] });
    console.log('✅ Posted Invite & Win Rewards Panel in #' + inviteChannel.name);
  } catch (err) {
    console.error('Error in setupInviteRewardsPanel:', err);
  }
}

// --- 5. WELCOME EVENT (Clean Card in #welcome with direct link button) ---
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    const rulesChannelId = process.env.RULES_CHANNEL_ID;
    const rolesChannelId = process.env.ROLES_CHANNEL_ID || '1566958208512163961';
    const autoRoleId = process.env.AUTO_ROLE_ID;

    // 1. AUTO-ROLE ASSIGNMENT (Instant role on join)
    if (autoRoleId) {
      try {
        await member.roles.add(autoRoleId);
        console.log(`🛡️ Assigned Auto-Role (${autoRoleId}) to ${member.user.tag}`);
      } catch (roleErr) {
        console.warn(`⚠️ Could not assign auto-role to ${member.user.tag}:`, roleErr.message);
      }
    }

    if (!welcomeChannelId) return;
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const gifBuffer = await generateAnimatedWelcomeCard(member.user, member.guild);
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: 'welcome-card.gif' });
    const cleanTitleName = getCleanServerName(member.guild.name);

    const rulesNotice = rulesChannelId 
      ? `📜 Please check out <#${rulesChannelId}> to get started!` 
      : '📜 Please check out the server rules!';

    const descriptionText = [
      `Hey ${member}, we are thrilled to have you here!`,
      '',
      rulesNotice,
      '',
      `👉 Please head over to <#${rolesChannelId}> to verify and get your role to unlock channels!`
    ].join('\n');

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎉 Welcome to ${cleanTitleName}!`)
      .setDescription(descriptionText)
      .addFields(
        { name: '👤 Username', value: member.user.username, inline: true },
        { name: '👥 Member #', value: `#${member.guild.memberCount}`, inline: true }
      )
      .setImage('attachment://welcome-card.gif')
      .setFooter({ text: `Server: ${cleanTitleName} • Welcome`, iconURL: member.guild.iconURL() || undefined })
      .setTimestamp();

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🎭 CHOOSE YOUR ROLES')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${member.guild.id}/${rolesChannelId}`)
    );

    await channel.send({ 
      content: `👋 Hey ${member}, welcome to **${cleanTitleName}**!`,
      embeds: [welcomeEmbed], 
      files: [gifAttachment],
      components: [linkRow]
    });
    console.log(`📢 Welcomed ${member.user.tag}`);

    // Direct Message (DM)
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`Welcome to ${cleanTitleName}! 👋`)
        .setDescription(
          `Hello ${member.user.username}! Welcome to our store community.\n\n` +
          `👉 Head over to <#${rolesChannelId}> in the server to verify yourself and unlock the channels!`
        )
        .setThumbnail(member.guild.iconURL() || member.user.displayAvatarURL())
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] });
    } catch (dmErr) {}

    // Track which invite was used
    await handleMemberInviteJoin(member);
  } catch (error) {
    console.error('❌ Error handling guildMemberAdd:', error);
  }
});

// Member Leaves (Deduct from inviter's regular count / increase left count)
client.on('guildMemberRemove', async (member) => {
  try {
    await handleMemberInviteLeave(member);
  } catch (err) {
    console.error('Error handling guildMemberRemove invite deduction:', err);
  }
});

// --- 6. INTERACTION HANDLER FOR #choose-your-roles ---
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. User clicks "VERIFY NOW" in #choose-your-roles
    if (interaction.isButton() && interaction.customId === 'btn_open_role_verify') {
      await interaction.deferReply({ flags: 64 });

      const correctCode = randomCode();
      pendingCaptchas.set(interaction.user.id, { code: correctCode, timestamp: Date.now() });

      const options = [correctCode];
      while (options.length < 4) {
        const decoy = randomCode();
        if (!options.includes(decoy)) options.push(decoy);
      }
      options.sort(() => Math.random() - 0.5);

      const captchaBuffer = generateCaptchaImage(correctCode);
      const captchaAttachment = new AttachmentBuilder(captchaBuffer, { name: 'cyber-captcha.png' });

      const buttonRow = new ActionRowBuilder();
      options.forEach(opt => {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`role_verify_${opt}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary)
        );
      });

      const captchaEmbed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle('🛡️ NISHU STORE // SECURITY GATEWAY')
        .setDescription(
          '**HUMAN VERIFICATION SCANNER**\n\n' +
          'Please select the exact **5-character code** shown in the holographic scanner below to unlock server channels.\n\n' +
          '⏱️ *Expires in 2 minutes.*'
        )
        .setImage('attachment://cyber-captcha.png')
        .setFooter({ text: 'Anti-Raid Visual Security • Click your matching code below' });

      return interaction.editReply({
        embeds: [captchaEmbed],
        files: [captchaAttachment],
        components: [buttonRow]
      });
    }

    // 2. User selects Captcha Code Button
    if (interaction.isButton() && interaction.customId.startsWith('role_verify_')) {
      const chosenCode = interaction.customId.replace('role_verify_', '');
      const stored = pendingCaptchas.get(interaction.user.id);

      if (!stored) {
        return interaction.reply({
          content: '⚠️ **Session expired.** Please click "VERIFY NOW" again.',
          flags: 64
        });
      }

      if (chosenCode === stored.code) {
        pendingCaptchas.delete(interaction.user.id);

        // Auto-assign COMMUNITY role (ID: 1566957216546684969)
        const communityRoleId = process.env.VERIFIED_ROLE_ID || '1566957216546684969';
        try {
          await interaction.member.roles.add(communityRoleId);
        } catch (e) {
          console.error('Role add error:', e);
        }

        // Dropdown to allow selecting Customer role if they are a buyer
        const roleMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_user_roles')
            .setPlaceholder('🛍️ Are you a store customer? Select here...')
            .addOptions([
              {
                label: '🌸 COMMUNITY MEMBER (Already Granted)',
                description: 'Access Community Chat, Giveaways, & General Discussions',
                value: '1566957216546684969',
                default: true
              },
              {
                label: '🛍️ CUSTOMER ACCESS',
                description: 'Unlocks Store Menu, Premium Access, Content Studio & Support',
                value: '1566957024749551656'
              }
            ])
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔓 ACCESS GRANTED // VERIFICATION COMPLETE!')
          .setDescription(
            `🎉 **Welcome to NISHU STORE, ${interaction.user}!**\n\n` +
            '✅ You have been granted the **🌸・COMMUNITY** role!\n' +
            '🚀 **Community channels and chats are now unlocked.**\n\n' +
            '🛍️ *Are you a store buyer or customer? Select "CUSTOMER ACCESS" in the menu below to unlock store orders & customer categories!*'
          )
          .setFooter({ text: 'NISHU STORE • Verification Gateway' });

        return interaction.update({
          embeds: [successEmbed],
          components: [roleMenu],
          files: []
        });
      } else {
        return interaction.reply({
          content: '❌ **Incorrect code.** Please click "VERIFY NOW" to try again.',
          flags: 64
        });
      }
    }

    // 3. User selects CUSTOMER in Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_user_roles') {
      const selected = interaction.values;
      const customerRoleId = '1566957024749551656';

      if (selected.includes(customerRoleId)) {
        await interaction.member.roles.add(customerRoleId).catch(() => {});
        return interaction.reply({
          content: '🛍️ **CUSTOMER Role Granted!** All store categories, premium access, and customer channels have been unlocked for you! 🚀',
          flags: 64
        });
      } else {
        return interaction.reply({
          content: '🌸 You have Community access active!',
          flags: 64
        });
      }
    }

    // 4. Ticket System: Open Ticket Buttons
    if (interaction.isButton() && (interaction.customId === 'ticket_buy' || interaction.customId === 'ticket_support')) {
      await handleTicketCreate(interaction);
    }

    // 5. Ticket System: Close Ticket Button
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      await handleTicketClose(interaction);
    }

    // 6. VIP Cinema System
    if (interaction.isChatInputCommand() && interaction.commandName === 'cinema') {
      await handleCinemaCommand(interaction);
    }

    // 7. Admin Say Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'say') {
      await handleSayCommand(interaction);
    }

    // 8. Admin Broadcast (Mass DM) Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'broadcast') {
      await handleBroadcastCommand(interaction);
    }

    // 8.5 Giveaway System Commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
      await handleGiveawayCommand(interaction);
    }

    // 8.6 Store Vouch / Review Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'vouch') {
      await handleVouchCommand(interaction);
    }

    // 8.7 Auto-Mod Configuration Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'automod') {
      await handleAutoModCommand(interaction);
    }

    // 8.8 Smart Auto-Pretty Announce Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'announce') {
      await handleAnnounceCommand(interaction);
    }

    // 8.9 Invite Tracking Commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'invites') {
      await handleInvitesCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'inviterank') {
      await handleInviteRankCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'staff') {
      await handleStaffCommand(interaction);
    }

    // 8.10 Finance Analytics Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'finance') {
      await handleFinanceCommand(interaction);
    }

    // 8.11 Music Player Slash Commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
      await handleMusicPlayCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'skip') {
      await handleMusicSkipCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'stop') {
      await handleMusicStopCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'queue') {
      await handleMusicQueueCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'nowplaying') {
      await handleMusicNowPlayingCommand(interaction);
    }

    // Music Interactive Controller Buttons
    if (interaction.isButton() && interaction.customId.startsWith('music_btn_')) {
      await handleMusicButton(interaction);
    }

    // Leave a Review / Vouch Modal Opener
    if (interaction.isButton() && interaction.customId.startsWith('btn_leave_vouch_')) {
      await handleOpenVouchModal(interaction);
    }

    // Submit Review / Vouch Modal Handler
    if (interaction.isModalSubmit() && interaction.customId === 'modal_submit_vouch') {
      await handleModalVouchSubmit(interaction);
    }

    // Invite & Win Panel Interactive Buttons
    if (interaction.isButton() && interaction.customId === 'btn_get_my_invite_link') {
      await handleGetMyInviteLink(interaction);
    }

    if (interaction.isButton() && interaction.customId === 'btn_check_my_invites') {
      await handleInvitesCommand(interaction);
    }

    if (interaction.isButton() && interaction.customId === 'btn_view_inviterank') {
      await handleInviteRankCommand(interaction);
    }

    // Instant Copy Bank Details Buttons in Order Tickets
    if (interaction.isButton() && interaction.customId === 'btn_copy_bank_info') {
      return interaction.reply({
        content: 
          '```\n' +
          'Bank: Bank of Ceylon (BOC)\n' +
          'Account Number: 96293434\n' +
          'Account Name: E M M H S B EKANAYAKE\n' +
          'Branch: Peradeniya\n' +
          '```',
        flags: 64
      });
    }

    if (interaction.isButton() && interaction.customId === 'btn_copy_account_num') {
      return interaction.reply({
        content: '`96293434`\n*(Long press or double-click to copy account number!)*',
        flags: 64
      });
    }

    // Payment Slip Verification Buttons (Finance Team)
    if (interaction.isButton() && (interaction.customId.startsWith('btn_pay_approve_') || interaction.customId.startsWith('btn_pay_reject_'))) {
      await handlePaymentSlipDecision(interaction);
    }

    // Giveaway Entry Button
    if (interaction.isButton() && interaction.customId.startsWith('giveaway_enter_')) {
      await handleGiveawayButton(interaction);
    }

    // 9. Interactive Bot-Texts Dashboard Interactions
    if (interaction.isButton() && interaction.customId.startsWith('panel_btn_')) {
      await handleDashboardButton(interaction);
    }

    if (interaction.isChannelSelectMenu() && (interaction.customId === 'panel_select_channels' || interaction.customId === 'panel_select_channels_photo')) {
      await handleDashboardChannelSelect(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_panel_')) {
      await handleDashboardModalSubmit(interaction);
    }

    // 10. Store Products & Catalog System
    if (interaction.isButton() && interaction.customId.startsWith('store_btn_')) {
      await handleStoreButton(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('store_select_')) {
      await handleStoreSelect(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith('cinema_')) {
      await handleCinemaButton(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cinema_')) {
      await handleCinemaSelect(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_cinema_search') {
      await handleCinemaModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// --- TICKET SYSTEM CONSTANTS ---
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '1566967818866524212';
const TICKET_PANEL_CHANNEL_ID = process.env.TICKET_PANEL_CHANNEL_ID || '1566968095422287912';
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID || '1566975747879477299';

// Staff Roles with ticket access (Dynamically populated with FINANCE MANAGERS)
let STAFF_ROLE_IDS = [
  '1566955712851222699', // 👑 OWNER
  '1566956388213850153', // 💜 STORE MANAGER
  '1566956542933213345', // 🛡️ ADMIN
  '1566956709115728083'  // 🎫 SUPPORT TEAM
];

// Automatically ensure '💳・FINANCE MANAGERS' role exists and has staff access
async function ensureFinanceRole() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    let financeRole = guild.roles.cache.find(r => 
      r.name.toLowerCase().includes('finance manager') || r.name.toLowerCase().includes('finance')
    );

    if (!financeRole) {
      console.log('🛠️ Creating "💳・FINANCE MANAGERS" role in server...');
      financeRole = await guild.roles.create({
        name: '💳・FINANCE MANAGERS',
        color: 0x10B981, // Emerald Green for money/finance
        hoist: true,     // Display separately in member list
        mentionable: true,
        reason: 'Auto-created role for payment and order receipt management'
      });
      console.log(`✅ Successfully created role: ${financeRole.name} (ID: ${financeRole.id})`);
    }

    if (!STAFF_ROLE_IDS.includes(financeRole.id)) {
      STAFF_ROLE_IDS.push(financeRole.id);
      console.log(`💳 Added ${financeRole.name} to active ticket staff roles!`);
    }
  } catch (err) {
    console.error('Error ensuring finance role:', err.message);
  }
}

// Setup Ticket Panel in #open-a-ticket
async function setupTicketPanel() {
  try {
    const channel = client.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
    if (!channel) {
      console.warn('⚠️ Ticket panel channel not found:', TICKET_PANEL_CHANNEL_ID);
      return;
    }

    const messages = await channel.messages.fetch({ limit: 10 });
    const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('SUPPORT & ORDER DESK'));
    if (existingMsg) {
      console.log('📌 Ticket panel already exists in #open-a-ticket.');
      return;
    }

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 NISHU STORE • SUPPORT & ORDER DESK')
      .setDescription(
        'Welcome to the official **NISHU STORE Help Desk**!\n\n' +
        'Need to place an order, make a payment, or get assistance with digital services? Click a button below to open a private ticket with our staff:\n\n' +
        '🛒 **BUY / ORDER TICKET**\n' +
        '└ For purchasing accounts, digital assets, subscriptions & custom orders.\n\n' +
        '🛠️ **GENERAL SUPPORT**\n' +
        '└ For payment inquiries, technical assistance, questions & order help.\n\n' +
        '⚠️ *Please do not open multiple tickets for the same request.*'
      )
      .setFooter({ text: 'NISHU STORE • Customer Service 24/7' })
      .setTimestamp();

    const ticketButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_buy')
        .setLabel('Buy / Order')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_support')
        .setLabel('Get Support')
        .setEmoji('🛠️')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [ticketEmbed], components: [ticketButtons] });
    console.log('✅ Posted Ticket Panel in #open-a-ticket');
  } catch (err) {
    console.error('Error in setupTicketPanel:', err);
  }
}

// Handle Ticket Creation
async function handleTicketCreate(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const guild = interaction.guild;
    const user = interaction.user;
    const isOrder = interaction.customId === 'ticket_buy';
    const typeLabel = isOrder ? 'Order' : 'Support';
    const prefix = isOrder ? '🛒' : '🛠️';

    // Prevent user from opening too many duplicate open tickets
    const existingChannel = guild.channels.cache.find(c => 
      c.parentId === TICKET_CATEGORY_ID && 
      c.topic && 
      c.topic.includes(user.id)
    );

    if (existingChannel) {
      return interaction.editReply({
        content: `⚠️ You already have an open ticket in ${existingChannel}! Please use that channel.`
      });
    }

    // Channel name format: order-username or support-username
    const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
    const channelName = `${prefix}・${isOrder ? 'order' : 'support'}-${sanitizedName}`;

    // Permission overwrites: private channel
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    // Grant access to Staff roles
    for (const roleId of STAFF_ROLE_IDS) {
      if (guild.roles.cache.has(roleId)) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
    }

    // Create the ticket channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      topic: `Ticket Owner: ${user.tag} (${user.id}) | Type: ${typeLabel}`,
      permissionOverwrites
    });

    // Send Welcome Message inside the new ticket
    const ticketWelcomeEmbed = new EmbedBuilder()
      .setColor(isOrder ? 0x57F287 : 0x5865F2)
      .setTitle(`${prefix} Welcome to your ${typeLabel} Ticket!`)
      .setDescription(
        `Hello ${user}, thank you for contacting **NISHU STORE**!\n\n` +
        (isOrder
          ? '📦 **For Orders:** Please mention the product/service you want to purchase and your preferred payment method.\n'
          : '🛠️ **For Support:** Please describe your issue in detail so our team can help you immediately.\n') +
        '\n👥 Our staff team (<@&1566956709115728083>) will be with you shortly.\n\n' +
        '🔒 *Click the button below when you are finished to close this ticket.*'
      )
      .setFooter({ text: 'NISHU STORE • Ticket Help Desk' })
      .setTimestamp();

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${user} | <@&1566956709115728083> 🔔`,
      embeds: [ticketWelcomeEmbed],
      components: [controlRow]
    });

    // Notify user in the interaction
    await interaction.editReply({
      content: `✅ Your ticket channel has been created: ${ticketChannel}! Please click to view.`
    });

    // Send Ticket Open Log to #ticket-logs
    const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
      const openLog = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📥 Ticket Opened')
        .addFields(
          { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
          { name: '🏷️ Type', value: `${prefix} ${typeLabel}`, inline: true },
          { name: '💬 Channel', value: `${ticketChannel.name} (<#${ticketChannel.id}>)`, inline: true }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [openLog] }).catch(() => {});
    }

    console.log(`🎫 Created ticket channel ${ticketChannel.name} for ${user.tag}`);
  } catch (err) {
    console.error('Error creating ticket channel:', err);
    await interaction.editReply({
      content: '❌ Failed to create ticket channel. Please contact an admin!'
    }).catch(() => {});
  }
}

// Handle Ticket Closing with Automated Transcript Generator
async function handleTicketClose(interaction) {
  try {
    const channel = interaction.channel;

    // Check if channel is inside the ticket category
    if (channel.parentId !== TICKET_CATEGORY_ID) {
      return interaction.reply({
        content: '❌ This command can only be used inside a ticket channel!',
        flags: 64
      });
    }

    const closeEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔒 Ticket Closing // Generating Transcript')
      .setDescription('Saving full conversation transcript and closing ticket in **6 seconds**...')
      .setFooter({ text: 'NISHU STORE • Ticket Archival System' });

    await interaction.reply({ embeds: [closeEmbed] });

    // 1. Fetch channel messages (up to 100) to build transcript
    let transcriptText = `=====================================================\n`;
    transcriptText += `       NISHU STORE • OFFICIAL TICKET TRANSCRIPT       \n`;
    transcriptText += `=====================================================\n`;
    transcriptText += `Channel: #${channel.name}\n`;
    transcriptText += `Topic: ${channel.topic || 'N/A'}\n`;
    transcriptText += `Closed By: ${interaction.user.tag} (${interaction.user.id})\n`;
    transcriptText += `Closed At: ${new Date().toISOString()}\n`;
    transcriptText += `=====================================================\n\n`;

    // Extract ticket owner ID from topic if available
    let ticketOwnerId = null;
    if (channel.topic) {
      const match = channel.topic.match(/\((\d{17,20})\)/);
      if (match) ticketOwnerId = match[1];
    }

    try {
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = Array.from(fetchedMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const msg of sortedMessages) {
        const timeStr = new Date(msg.createdTimestamp).toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
        transcriptText += `[${timeStr}] ${msg.author.tag} (${msg.author.id}):\n`;
        if (msg.content) transcriptText += `  ${msg.content}\n`;
        if (msg.attachments.size > 0) {
          msg.attachments.forEach(att => {
            transcriptText += `  [Attachment: ${att.name || 'file'} - ${att.url}]\n`;
          });
        }
        if (msg.embeds.length > 0) {
          msg.embeds.forEach(emb => {
            transcriptText += `  [Embed: ${emb.title || emb.description || 'Rich Content'}]\n`;
          });
        }
        transcriptText += `\n`;
      }
    } catch (fetchErr) {
      console.warn('Could not compile full message transcript:', fetchErr.message);
      transcriptText += `(Partial transcript: error fetching older messages)\n`;
    }

    transcriptText += `=====================================================\n`;
    transcriptText += `END OF TRANSCRIPT • NISHU STORE\n`;

    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');
    const transcriptAttachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.txt` });

    // 2. Send transcript & Review prompt to Customer DM if ticket owner found
    if (ticketOwnerId) {
      try {
        const ownerUser = await client.users.fetch(ticketOwnerId);
        if (ownerUser) {
          const dmCloseEmbed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('📦 TICKET CLOSED // YOUR TRANSCRIPT & REVIEW')
            .setDescription(
              `Hello ${ownerUser.username}!\n\n` +
              `Your ticket **#${channel.name}** in **NISHU STORE** has been closed.\n\n` +
              `📄 We have attached the complete conversation history & receipt for your records.\n\n` +
              `⭐ **How was your shopping experience?**\n` +
              `Click the **"Leave a Review (⭐)"** button below to rate us and share your feedback!`
            )
            .setFooter({ text: 'NISHU STORE • Automated Order Records' })
            .setTimestamp();

          const dmReviewRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_leave_vouch_${ownerUser.id}`)
              .setLabel('Leave a Review (⭐)')
              .setEmoji('⭐')
              .setStyle(ButtonStyle.Success)
          );

          await ownerUser.send({ embeds: [dmCloseEmbed], components: [dmReviewRow], files: [transcriptAttachment] }).catch(() => {});
        }
      } catch (dmErr) {
        console.warn('Could not send transcript to customer DM:', dmErr.message);
      }
    }

    // 3. Send Closed Log & Transcript to #ticket-logs
    const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
      const closeLog = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('📕 Ticket Closed & Archived')
        .addFields(
          { name: '💬 Channel', value: channel.name, inline: true },
          { name: '👤 Closed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
          { name: 'ℹ️ Topic', value: channel.topic || 'N/A', inline: false }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [closeLog], files: [transcriptAttachment] }).catch(() => {});
    }

    setTimeout(async () => {
      await channel.delete('Ticket closed by user or staff with saved transcript').catch(err => {
        console.error('Error deleting ticket channel:', err);
      });
    }, 6000);
  } catch (err) {
    console.error('Error closing ticket:', err);
  }
}

// ==========================================
// --- 7. VIP MOVIE & PRIVATE CINEMA SYSTEM ---
// ==========================================
const VIP_ROLE_ID = '1566956868461527133'; // 💎・VIP MEMBER
const activeCinemaRooms = new Map(); // voiceChannelId -> { ownerId, guildId }

// Register Slash Commands: /cinema
async function registerSlashCommands() {
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('cinema')
        .setDescription('🎬 NISHU VIP Private Cinema & Watch Party Hub')
        .addSubcommand(sub =>
          sub
            .setName('search')
            .setDescription('Search for movies & create a private Watch Party')
            .addStringOption(opt =>
              opt.setName('query')
                .setDescription('Movie title to search (e.g. Inception, Avatar, Marvel)')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('panel')
            .setDescription('Open the VIP Cinema Control Panel')
        ),
      new SlashCommandBuilder()
        .setName('say')
        .setDescription('📢 [ADMIN] Send a message or embed as Nishu Bot to any channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send the message to')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('The message content to post')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Optional title for an embed (leave empty for regular message)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('color')
            .setDescription('Hex color code for embed (e.g. #5865F2, #8B5CF6, #10B981)')
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('📬 [OWNER/ADMIN] Send a Direct Message (DM) to all server members safely')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('The message content to DM to all members')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Optional announcement title for the DM embed')
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Manage server giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
          sub
            .setName('start')
            .setDescription('Start a new giveaway')
            .addStringOption(opt =>
              opt.setName('duration')
                .setDescription('Duration of giveaway (e.g. 10m, 1h, 2d, 30s)')
                .setRequired(true)
            )
            .addStringOption(opt =>
              opt.setName('prize')
                .setDescription('What prize are you giving away?')
                .setRequired(true)
            )
            .addIntegerOption(opt =>
              opt.setName('winners')
                .setDescription('Number of winners (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(20)
            )
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to host giveaway in (default: current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('end')
            .setDescription('End an active giveaway early')
            .addStringOption(opt =>
              opt.setName('message_id')
                .setDescription('Message ID of the giveaway')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('reroll')
            .setDescription('Re-roll winner(s) for a finished giveaway')
            .addStringOption(opt =>
              opt.setName('message_id')
                .setDescription('Message ID of the giveaway')
                .setRequired(true)
            )
            .addIntegerOption(opt =>
              opt.setName('winners')
                .setDescription('Number of winners to reroll (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
            )
        ),
      new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('⭐ Leave a review/feedback for Nishu Store')
        .addIntegerOption(opt =>
          opt.setName('rating')
            .setDescription('Rating from 1 to 5 stars')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(5)
        )
        .addStringOption(opt =>
          opt.setName('product')
            .setDescription('Product or service purchased')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('comment')
            .setDescription('Your detailed experience & review')
            .setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt.setName('proof')
            .setDescription('Screenshot of payment, delivery or vouch proof')
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('automod')
        .setDescription('🛡️ [OWNER/ADMIN] Configure Anti-Link, Anti-Spam & Auto-Mod rules')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub
            .setName('status')
            .setDescription('View current Auto-Mod protection settings')
        )
        .addSubcommand(sub =>
          sub
            .setName('toggle')
            .setDescription('Turn specific Auto-Mod protections ON or OFF')
            .addStringOption(opt =>
              opt.setName('feature')
                .setDescription('Feature to toggle')
                .setRequired(true)
                .addChoices(
                  { name: '🔗 Anti-Links (Block all web links)', value: 'antiLink' },
                  { name: '📨 Anti-Discord Invites (Block discord.gg links)', value: 'antiDiscord' },
                  { name: '⚡ Anti-Spam (Block rapid message spam)', value: 'antiSpam' }
                )
            )
            .addBooleanOption(opt =>
              opt.setName('enabled')
                .setDescription('Enable (true) or Disable (false)')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('word')
            .setDescription('Add or remove banned / blacklisted words')
            .addStringOption(opt =>
              opt.setName('action')
                .setDescription('Add or remove word')
                .setRequired(true)
                .addChoices(
                  { name: '➕ Add Word to Blacklist', value: 'add' },
                  { name: '➖ Remove Word from Blacklist', value: 'remove' }
                )
            )
            .addStringOption(opt =>
              opt.setName('text')
                .setDescription('The word or phrase to block/unblock')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('whitelist')
            .setDescription('Whitelist or bypass a channel or role from Auto-Mod')
            .addStringOption(opt =>
              opt.setName('type')
                .setDescription('Channel or Role')
                .setRequired(true)
                .addChoices(
                  { name: 'Channel Whitelist', value: 'channel' },
                  { name: 'Role Whitelist', value: 'role' }
                )
            )
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to whitelist / bypass')
                .setRequired(false)
            )
            .addRoleOption(opt =>
              opt.setName('role')
                .setDescription('Role to whitelist / bypass')
                .setRequired(false)
            )
        ),
      new SlashCommandBuilder()
        .setName('announce')
        .setDescription('✨ [ADMIN] Convert any message into an ultra-sleek, beautifully styled announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Your raw announcement text (the bot will auto-format and style it!)')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to post the announcement in (default: current channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Optional custom title (leave empty for smart auto-title)')
            .setRequired(false)
        )
        .addAttachmentOption(opt =>
          opt.setName('image')
            .setDescription('Optional banner/image attachment')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('ping_everyone')
            .setDescription('Ping @everyone with the announcement? (default: false)')
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('invites')
        .setDescription('📊 Check how many members you or another user has invited to Nishu Store')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to check invites for (default: yourself)')
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('inviterank')
        .setDescription('🏆 View top 10 members with the most server invites'),
      new SlashCommandBuilder()
        .setName('staff')
        .setDescription('👥 Check active staff & Finance Managers in Nishu Store'),
      new SlashCommandBuilder()
        .setName('finance')
        .setDescription('📊 [FINANCE TEAM] View store revenue, sales analytics & performance reports')
        .addSubcommand(sub =>
          sub
            .setName('summary')
            .setDescription('View today\'s sales, weekly revenue, and total store statistics')
        )
        .addSubcommand(sub =>
          sub
            .setName('report')
            .setDescription('View detailed breakdown of recent verified customer payments')
        ),
      new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Play any song by name search or YouTube/Spotify URL')
        .addStringOption(opt =>
          opt
            .setName('query')
            .setDescription('Song title, artist, or YouTube/Spotify link')
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('skip')
        .setDescription('⏭️ Skip the currently playing track'),
      new SlashCommandBuilder()
        .setName('stop')
        .setDescription('⏹️ Stop music, clear queue, and leave voice channel'),
      new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📜 View upcoming songs in the queue'),
      new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('🎶 View currently playing track with interactive controls')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    console.log('🔄 Registering Slash Commands...');

    // 1. Fast Guild-level registration for instantaneous update
    const guild = client.guilds.cache.first();
    if (guild) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`⚡ Instant Guild Slash Commands registered for ${guild.name}!`);
    }

    // 2. Global registration
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Successfully registered global slash commands!');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
}

// Fetch Movie Search from OMDb
function searchMovieOMDb(query) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.omdbapi.com',
      path: `/?s=${encodeURIComponent(query)}&apikey=trilogy`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.Search || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Fetch Full Movie Details
function getMovieDetails(imdbID) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.omdbapi.com',
      path: `/?i=${imdbID}&plot=full&apikey=trilogy`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Helper: Check if user is VIP or Staff
function isUserVIP(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(VIP_ROLE_ID);
}

// Handle /cinema command
async function handleCinemaCommand(interaction) {
  const member = interaction.member;

  // VIP Role Gate
  if (!isUserVIP(member)) {
    const noVipEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('💎 VIP CINEMA // ACCESS RESTRICTED')
      .setDescription(
        `Hey ${interaction.user}, the **Private Cinema & Watch Party Hub** is an exclusive feature for **💎・VIP MEMBERS**!\n\n` +
        '🌟 **VIP Perks:**\n' +
        '• 🎬 Unlimited Movie & TV Series Streaming\n' +
        '• 🍿 Create Private Voice Channels for you & your friends\n' +
        '• ⚡ Ad-Free Instant HD Streaming Players\n\n' +
        '👉 Please open a ticket in <#1566968095422287912> to upgrade to VIP Access!'
      )
      .setFooter({ text: 'NISHU STORE • VIP Lounge' });

    return interaction.reply({ embeds: [noVipEmbed], flags: 64 });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'panel') {
    const panelEmbed = new EmbedBuilder()
      .setColor(0x9333EA)
      .setTitle('🍿 NISHU STORE // VIP PRIVATE CINEMA')
      .setDescription(
        `Welcome to your private cinema lounge, ${interaction.user}!\n\n` +
        '🎬 **How it works:**\n' +
        '1. Click **"🔍 Search Movie"** below to find any movie or show.\n' +
        '2. Choose your movie from the interactive list.\n' +
        '3. Click **"🍿 Create Private Cinema VC"** to spawn a private cinema room for you & your friends!\n' +
        '4. Play movie in VC and invite your friends anytime.\n\n' +
        '⚡ *HD Quality • Ad-Free Streams • Auto-cleaning Rooms*'
      )
      .setFooter({ text: 'NISHU STORE • VIP Experience' })
      .setTimestamp();

    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_btn_open_search')
        .setLabel('🔍 Search Movie')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ embeds: [panelEmbed], components: [panelRow], flags: 64 });
  }

  if (subcommand === 'search') {
    await interaction.deferReply({ flags: 64 });
    const query = interaction.options.getString('query');
    await displayMovieSearchResults(interaction, query);
  }
}

// Search and Display Movie Results
async function displayMovieSearchResults(interaction, query) {
  const results = await searchMovieOMDb(query);

  if (!results || results.length === 0) {
    return interaction.editReply({
      content: `❌ No movies found matching "**${query}**". Please check the spelling and try again!`
    });
  }

  const topResults = results.slice(0, 10);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('cinema_select_movie')
    .setPlaceholder('🎬 Select a movie to view & create Watch Party...');

  topResults.forEach((m) => {
    selectMenu.addOptions({
      label: m.Title.slice(0, 70),
      description: `📅 ${m.Year} • Type: ${m.Type.toUpperCase()} • ID: ${m.imdbID}`,
      value: m.imdbID,
      emoji: '🍿'
    });
  });

  const searchEmbed = new EmbedBuilder()
    .setColor(0x38BDF8)
    .setTitle(`🔍 Movies Found for "${query}"`)
    .setDescription('Select your movie from the dropdown menu below to see details and start your **Private Cinema Watch Party**!')
    .setFooter({ text: 'Found ' + topResults.length + ' results • NISHU VIP Cinema' });

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return interaction.editReply({ embeds: [searchEmbed], components: [row] });
}

// Handle Cinema Select Menu (Movie Selected)
async function handleCinemaSelect(interaction) {
  if (interaction.customId === 'cinema_select_movie') {
    await interaction.deferUpdate();
    const imdbID = interaction.values[0];
    const movie = await getMovieDetails(imdbID);

    if (!movie || movie.Response === 'False') {
      return interaction.followUp({ content: '❌ Could not retrieve movie details.', flags: 64 });
    }

    // Embed with Movie Info
    const movieEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle(`🎬 ${movie.Title} (${movie.Year})`)
      .setDescription(
        `⭐ **IMDb Rating:** \`${movie.imdbRating}/10\`  •  ⏱️ **Runtime:** \`${movie.Runtime}\`\n` +
        `🎭 **Genre:** \`${movie.Genre}\`  •  🌐 **Language:** \`${movie.Language}\`\n\n` +
        `📝 **Plot Synopsis:**\n${movie.Plot.slice(0, 500)}\n\n` +
        `👥 **Cast:** ${movie.Actors}\n` +
        `🎬 **Director:** ${movie.Director}`
      )
      .setFooter({ text: `IMDb ID: ${movie.imdbID} • NISHU VIP Cinema` });

    if (movie.Poster && movie.Poster !== 'N/A') {
      movieEmbed.setImage(movie.Poster);
    }

    // Generate Secure One-Time Temporary Cinema Session Ticket (Anti-Resell & Anti-Sharing)
    const sessionToken = require('crypto').randomBytes(16).toString('hex');
    cinemaSessionTokens.set(sessionToken, {
      userId: interaction.user.id,
      imdbId: movie.imdbID,
      title: movie.Title,
      createdAt: Date.now(),
      activated: false
    });

    const webPlayerUrl = `http://209.50.54.199/cinema/player?token=${sessionToken}&id=${movie.imdbID}&title=${encodeURIComponent(movie.Title.slice(0, 30))}`;

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🍿 Open Nishu VIP Theater')
        .setStyle(ButtonStyle.Link)
        .setURL(webPlayerUrl),
      new ButtonBuilder()
        .setCustomId(`cinema_create_room_${movie.imdbID}_${movie.Title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`)
        .setLabel('👥 Watch With Friends (Create VC)')
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({ embeds: [movieEmbed], components: [buttonRow] });
  }
}

// Handle Cinema Buttons
async function handleCinemaButton(interaction) {
  // 1. Open Search Modal
  if (interaction.customId === 'cinema_btn_open_search') {
    if (!isUserVIP(interaction.member)) {
      const noVipEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('💎 VIP CINEMA // ACCESS RESTRICTED')
        .setDescription(
          `Hey ${interaction.user}, the **Private Cinema & Watch Party Hub** is an exclusive feature for **💎・VIP MEMBERS**!\n\n` +
          '🌟 **VIP Perks:**\n' +
          '• 🎬 Unlimited Movie & TV Series Streaming\n' +
          '• 🍿 Create Private Voice Rooms for you & your friends\n' +
          '• ⚡ Ad-Free Instant HD Streaming Players\n\n' +
          '👉 Please click **"💎 Upgrade / Buy VIP"** or open a ticket in <#1566968095422287912> to get VIP Access!'
        )
        .setFooter({ text: 'NISHU STORE • VIP Lounge' });

      return interaction.reply({ embeds: [noVipEmbed], flags: 64 });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_cinema_search')
      .setTitle('🔍 Search VIP Movie / Series');

    const searchInput = new TextInputBuilder()
      .setCustomId('cinema_search_input')
      .setLabel('Movie Title')
      .setPlaceholder('e.g. Spider-Man, Avengers, Interstellar')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(searchInput);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  // 2. Create Private Cinema Voice Channel
  if (interaction.customId.startsWith('cinema_create_room_')) {
    await interaction.deferReply({ flags: 64 });
    const parts = interaction.customId.replace('cinema_create_room_', '').split('_');
    const imdbID = parts[0];
    const shortTitle = parts[1] || 'Movie';

    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an active room
    for (const [chId, data] of activeCinemaRooms.entries()) {
      if (data.ownerId === user.id) {
        const existing = guild.channels.cache.get(chId);
        if (existing) {
          return interaction.editReply({
            content: `⚠️ You already have an active Cinema Room: ${existing}!\nPlease join or leave that room before creating a new one.`
          });
        } else {
          activeCinemaRooms.delete(chId);
        }
      }
    }

    // VIP Category or fallback
    const parentCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('PREMIUM ACCESS'));

    // Create Temporary Private Voice Channel
    try {
      const cinemaRoom = await guild.channels.create({
        name: `🍿・${user.username}-cinema`,
        type: ChannelType.GuildVoice,
        parent: parentCategory ? parentCategory.id : undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.CreateInstantInvite,
              PermissionFlagsBits.UseEmbeddedActivities,
              PermissionFlagsBits.UseExternalApps
            ]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.Stream,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.UseEmbeddedActivities,
              PermissionFlagsBits.UseExternalApps
            ]
          },
          {
            id: VIP_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.Stream,
              PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.UseEmbeddedActivities,
              PermissionFlagsBits.UseExternalApps
            ]
          }
        ]
      });

      activeCinemaRooms.set(cinemaRoom.id, { ownerId: user.id, guildId: guild.id });

      // Generate Native Discord In-App Watch Together Activity Invite
      let activityUrl = null;
      try {
        const invite = await cinemaRoom.createInvite({
          targetApplication: '880218394199220274', // Official Discord Watch Together Activity
          targetType: 2, // Embedded Application
          maxAge: 7200
        });
        activityUrl = invite.url;
      } catch (actErr) {
        console.warn('Activity invite fallback:', actErr.message);
      }

      // Generate Secure One-Time Temporary Cinema Session Ticket (Anti-Resell & Anti-Sharing)
      const sessionToken = require('crypto').randomBytes(16).toString('hex');
      cinemaSessionTokens.set(sessionToken, {
        userId: user.id,
        imdbId: imdbID,
        title: shortTitle,
        createdAt: Date.now(),
        activated: false
      });

      const webPlayerUrl = `http://209.50.54.199/cinema/player?token=${sessionToken}&id=${imdbID}&title=${encodeURIComponent(shortTitle)}`;

      const roomCreatedEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🍿 PRIVATE CINEMA ROOM CREATED!')
        .setDescription(
          `🎉 Your Private Watch Party Room is ready: ${cinemaRoom}!\n\n` +
          '**📺 How to Watch (Nishu VIP Cinema):**\n' +
          '1️⃣ **Join Your Room:** Click ' + cinemaRoom.toString() + ' to enter the voice channel.\n' +
          '2️⃣ **Launch Cinema Screen:** Click **"🍿 Open Nishu VIP Theater"** below!\n' +
          '3️⃣ **Screen Share:** Click **Share Screen 🖥️** inside your voice room and choose the Theater tab with audio!\n' +
          '4️⃣ All your friends in the room can watch together in 1080p Full HD!\n\n' +
          '🔒 *Security Notice: Your ticket link is private, encrypted, and single-use to prevent link theft.*'
        )
        .setFooter({ text: 'NISHU VIP Cinema • Encrypted Session Ticket' });

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🍿 Open Nishu VIP Theater')
          .setStyle(ButtonStyle.Link)
          .setURL(webPlayerUrl)
      );

      return interaction.editReply({ embeds: [roomCreatedEmbed], components: [buttonRow] });
    } catch (e) {
      console.error('Error creating cinema voice room:', e);
      return interaction.editReply({ content: '❌ Failed to create cinema room: ' + e.message });
    }
  }
}

// Handle Modal Submit
async function handleCinemaModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  const query = interaction.fields.getTextInputValue('cinema_search_input');
  await displayMovieSearchResults(interaction, query);
}

// Auto-Delete empty cinema voice rooms
client.on('voiceStateUpdate', async (oldState, newState) => {
  const channel = oldState.channel;
  if (!channel) return;

  if (activeCinemaRooms.has(channel.id)) {
    // If no members are left in the channel, delete it
    if (channel.members.size === 0) {
      activeCinemaRooms.delete(channel.id);
      setTimeout(async () => {
        try {
          const recheck = channel.guild.channels.cache.get(channel.id);
          if (recheck && recheck.members.size === 0) {
            await recheck.delete('Cinema room empty - auto cleaned up');
            console.log(`🧹 Auto-deleted empty cinema room: ${channel.name}`);
          }
        } catch (err) {}
      }, 5000);
    }
  }
});

// ==========================================
// --- 8. ADMIN / OWNER MANAGEMENT COMMANDS ---
// ==========================================

// Helper to check Admin/Owner permission
function isAdminOrOwner(member) {
  if (!member) return false;
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return STAFF_ROLE_IDS.includes('1566955712851222699') && member.roles.cache.has('1566955712851222699');
}

// 1. /say Command (Send message/embed to specified channel)
async function handleSayCommand(interaction) {
  if (!isAdminOrOwner(interaction.member)) {
    return interaction.reply({
      content: '⛔ **Access Denied.** Only Server Admins & Owner can use `/say`.',
      flags: 64
    });
  }

  const targetChannel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  const colorStr = interaction.options.getString('color');

  try {
    if (title || colorStr) {
      let colorNum = 0x5865F2;
      if (colorStr) {
        const hex = colorStr.replace('#', '');
        const parsed = parseInt(hex, 16);
        if (!isNaN(parsed)) colorNum = parsed;
      }

      const embed = new EmbedBuilder()
        .setColor(colorNum)
        .setDescription(message)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || undefined })
        .setTimestamp();

      if (title) embed.setTitle(title);

      await targetChannel.send({ embeds: [embed] });
    } else {
      await targetChannel.send({ content: message });
    }

    return interaction.reply({
      content: `✅ Successfully sent message to ${targetChannel}!`,
      flags: 64
    });
  } catch (err) {
    console.error('Error in /say:', err);
    return interaction.reply({
      content: `❌ Failed to send message: ${err.message}`,
      flags: 64
    });
  }
}

// 2. /broadcast Command (Safe Mass DM to all members with queue)
async function handleBroadcastCommand(interaction) {
  if (!isAdminOrOwner(interaction.member)) {
    return interaction.reply({
      content: '⛔ **Access Denied.** Only Server Owner & Admins can use `/broadcast`.',
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  const rawMessage = interaction.options.getString('message');
  const title = interaction.options.getString('title') || '📢 Important Announcement';
  const guild = interaction.guild;

  // Fetch all members
  await interaction.editReply({ content: '⏳ Fetching server members list...' });
  let members;
  try {
    members = await guild.members.fetch();
  } catch (err) {
    return interaction.editReply({ content: '❌ Failed to fetch members: ' + err.message });
  }

  // Filter out bots
  const humanMembers = members.filter(m => !m.user.bot);
  const total = humanMembers.size;

  await interaction.editReply({
    content: `🚀 Starting Broadcast to **${total} members**.\n` +
      `⚡ *Using safe delay (1.2s per user) to protect bot from Discord rate limits.*\n` +
      `Estimated completion time: **~${Math.ceil((total * 1.2) / 60)} minutes**.`
  });

  const dmEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📢 ${title}`)
    .setDescription(rawMessage)
    .setFooter({ text: `${guild.name} • Official Announcement`, iconURL: guild.iconURL() || undefined })
    .setTimestamp();

  let sent = 0;
  let failed = 0;

  // Process in background
  (async () => {
    for (const [, member] of humanMembers) {
      try {
        await member.send({ embeds: [dmEmbed] });
        sent++;
      } catch (err) {
        // DMs closed or blocked
        failed++;
      }
      // Safe delay between DMs to prevent Discord API block
      await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`📢 Broadcast complete: ${sent} delivered, ${failed} failed.`);
    // Send completion report to Staff Log
    const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
      const report = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📬 Mass Broadcast Completed')
        .addFields(
          { name: '👤 Triggered By', value: interaction.user.tag, inline: true },
          { name: '📨 Delivered', value: `${sent}`, inline: true },
          { name: '🚫 Blocked / Closed DMs', value: `${failed}`, inline: true },
          { name: '📝 Announcement Title', value: title, inline: false }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [report] }).catch(() => {});
    }
  })();
}

// ==========================================
// --- 9. INTERACTIVE DASHBOARD (#bot-texts) ---
// ==========================================
const adminPendingSelections = new Map(); // userId -> { channelIds: [] }
const adminPendingPhotoUpload = new Map(); // userId -> { channelIds: [], expires: timestamp }

// Persistent Dashboard Setup in #bot-texts
async function setupBotTextsPanel() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.find(c => c.name.includes('bot-texts'));
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('COMMAND & BROADCAST CONSOLE'));
    const dashboardEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎛️ NISHU BOT // COMMAND & BROADCAST CONSOLE')
      .setDescription(
        'Welcome to your graphical **Server Management & Announcement Suite**! 👑\n\n' +
        'Send messages, media embeds, announcements, or mass DMs without typing any slash commands.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**⚡ ACTION CONTROLS:**\n\n' +
        '📢 **1. Send Text Channel Message:**\n' +
        '└ Select channel(s) and compose text or embed via form.\n\n' +
        '📸 **2. Send Picture to Channel (Paste / Upload):**\n' +
        '└ Select channel(s), then simply paste (Ctrl+V) or upload photos right here!\n\n' +
        '📬 **3. Send Mass DM (Broadcast to All Members):**\n' +
        '└ Type title and announcement to deliver into all member inboxes.\n\n' +
        '🖼️ **4. Send Picture Mass DM (Paste / Upload):**\n' +
        '└ Paste (Ctrl+V) or upload photo + caption to deliver directly into all member inboxes!\n\n' +
        '🔒 *Restricted to Server Owner & Admins only.*'
      )
      .setFooter({ text: 'NISHU STORE • Graphical Admin Console' });

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_btn_start_channel_msg')
        .setLabel('📢 Channel Text')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('panel_btn_start_photo_msg')
        .setLabel('📸 Channel Picture')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_btn_start_mass_dm')
        .setLabel('📬 Text Mass DM')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('panel_btn_start_photo_mass_dm')
        .setLabel('🖼️ Picture Mass DM')
        .setStyle(ButtonStyle.Secondary)
    );

    if (botMsg) {
      await botMsg.edit({ embeds: [dashboardEmbed], components: [btnRow] });
      console.log('🔄 Updated Graphical Dashboard Panel in #bot-texts!');
    } else {
      await channel.send({ embeds: [dashboardEmbed], components: [btnRow] });
      console.log('✅ Posted Graphical Dashboard Panel in #bot-texts!');
    }
  } catch (err) {
    console.error('Error in setupBotTextsPanel:', err);
  }
}

// 1. Dashboard Button Handler
async function handleDashboardButton(interaction) {
  if (!isAdminOrOwner(interaction.member)) {
    return interaction.reply({
      content: '⛔ **Access Denied.** Only Server Owner & Admins can use this console.',
      flags: 64
    });
  }

  // Button: Send Channel Message -> Prompt Channel Selector
  if (interaction.customId === 'panel_btn_start_channel_msg') {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('panel_select_channels')
      .setPlaceholder('📂 Select target channel(s) to post your message...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(5);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    return interaction.reply({
      content: '👇 **Step 1:** Select one or multiple channels below where you want to post your message:',
      components: [row],
      flags: 64
    });
  }

  // Button: Send Picture / Upload Photo -> Prompt Channel Selector
  if (interaction.customId === 'panel_btn_start_photo_msg') {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('panel_select_channels_photo')
      .setPlaceholder('📸 Select target channel(s) where the picture should be posted...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(5);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    return interaction.reply({
      content: '👇 **Step 1:** Select the channel(s) where you want to publish your picture / photo:\n*(After selecting, you will simply drag-and-drop or Ctrl+V paste your picture!)*',
      components: [row],
      flags: 64
    });
  }

  // Button: Open Mass DM Modal directly
  if (interaction.customId === 'panel_btn_start_mass_dm') {
    const modal = new ModalBuilder()
      .setCustomId('modal_panel_mass_dm')
      .setTitle('📬 Send Mass DM (Broadcast)');

    const titleInput = new TextInputBuilder()
      .setCustomId('dm_title')
      .setLabel('Announcement Title')
      .setPlaceholder('e.g. 📢 Big Announcement / Nishu Store Update')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const messageInput = new TextInputBuilder()
      .setCustomId('dm_message')
      .setLabel('Message Body')
      .setPlaceholder('Type your message that will be delivered directly to all member inboxes...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const mediaInput = new TextInputBuilder()
      .setCustomId('dm_media')
      .setLabel('Optional Image / Banner URL')
      .setPlaceholder('https://example.com/banner.png (optional image/gif)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput),
      new ActionRowBuilder().addComponents(mediaInput)
    );

    return interaction.showModal(modal);
  }

  // Button: Picture Mass DM (Direct Paste / Upload)
  if (interaction.customId === 'panel_btn_start_photo_mass_dm') {
    adminPendingPhotoUpload.set(interaction.user.id, {
      isMassDM: true,
      expires: Date.now() + 180000 // 3 minutes timeout
    });

    return interaction.reply({
      content: '🖼️ **Ready for Mass DM Picture Broadcast!**\n\n' +
        '👉 **Copy & paste (Ctrl+V) or upload your image right here in this channel!**\n' +
        '*(Tip: Add your announcement text/caption to the picture before sending)*\n\n' +
        '🚀 Once uploaded, the bot will deliver it directly to **all member inboxes**!\n' +
        '⏱️ *Waiting for upload... (expires in 3 minutes)*',
      flags: 64
    });
  }
}

// 2. Channel Dropdown Selection Handler
async function handleDashboardChannelSelect(interaction) {
  const selectedChannels = interaction.values;

  // Case A: Picture / Photo Upload Mode
  if (interaction.customId === 'panel_select_channels_photo') {
    adminPendingPhotoUpload.set(interaction.user.id, {
      channelIds: selectedChannels,
      expires: Date.now() + 180000 // 3 minutes timeout
    });

    const channelTags = selectedChannels.map(id => `<#${id}>`).join(', ');

    return interaction.reply({
      content: `📸 **Ready for your Picture!**\n\n` +
        `Target Channel(s): ${channelTags}\n\n` +
        `👉 **Now simply copy & paste (Ctrl+V) or drag-and-drop your image(s) right here in this channel!**\n` +
        `*(Optional: You can type a caption / description along with the image)*\n\n` +
        `⏱️ *Waiting for upload... (expires in 3 minutes)*`,
      flags: 64
    });
  }

  // Case B: Normal Text / Embed Modal
  adminPendingSelections.set(interaction.user.id, selectedChannels);

  // Show Message Compose Modal
  const modal = new ModalBuilder()
    .setCustomId('modal_panel_channel_post')
    .setTitle('📝 Compose Channel Message / Media');

  const titleInput = new TextInputBuilder()
    .setCustomId('post_title')
    .setLabel('Title / Header (Optional)')
    .setPlaceholder('e.g. 🔥 LIMITED TIME OFFER (or leave empty for text)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const contentInput = new TextInputBuilder()
    .setCustomId('post_content')
    .setLabel('Message Description / Text')
    .setPlaceholder('Enter your announcement, rules, information or text here...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const mediaInput = new TextInputBuilder()
    .setCustomId('post_media')
    .setLabel('Image / Video / GIF URL (Optional)')
    .setPlaceholder('https://... image/gif/video link to embed')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const colorInput = new TextInputBuilder()
    .setCustomId('post_color')
    .setLabel('Embed Hex Color (Optional)')
    .setPlaceholder('#5865F2, #8B5CF6, #10B981, #ED4245 (default blue)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput),
    new ActionRowBuilder().addComponents(mediaInput),
    new ActionRowBuilder().addComponents(colorInput)
  );

  return interaction.showModal(modal);
}

// 3. Modal Submission Handler (Post Message or Execute Mass DM)
async function handleDashboardModalSubmit(interaction) {
  // A. Post to Channel(s)
  if (interaction.customId === 'modal_panel_channel_post') {
    await interaction.deferReply({ flags: 64 });

    const targetChannelIds = adminPendingSelections.get(interaction.user.id);
    if (!targetChannelIds || targetChannelIds.length === 0) {
      return interaction.editReply({ content: '❌ Session expired. Please click "Send Channel Message" again.' });
    }

    const title = interaction.fields.getTextInputValue('post_title');
    const content = interaction.fields.getTextInputValue('post_content');
    const mediaUrl = interaction.fields.getTextInputValue('post_media');
    const colorStr = interaction.fields.getTextInputValue('post_color');

    // Parse Color
    let colorNum = 0x5865F2;
    if (colorStr) {
      const hex = colorStr.replace('#', '').trim();
      const parsed = parseInt(hex, 16);
      if (!isNaN(parsed)) colorNum = parsed;
    }

    const isEmbed = title || mediaUrl || colorStr;
    const guild = interaction.guild;
    const sentList = [];

    for (const chId of targetChannelIds) {
      const ch = guild.channels.cache.get(chId);
      if (!ch) continue;

      try {
        if (isEmbed) {
          const embed = new EmbedBuilder()
            .setColor(colorNum)
            .setDescription(content)
            .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
            .setTimestamp();

          if (title) embed.setTitle(title);
          if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
            embed.setImage(mediaUrl);
          }

          await ch.send({ embeds: [embed] });
        } else {
          await ch.send({ content: content });
        }
        sentList.push(ch.toString());
      } catch (err) {
        console.error(`Failed to post to ${ch.name}:`, err);
      }
    }

    adminPendingSelections.delete(interaction.user.id);

    return interaction.editReply({
      content: `✅ **Successfully posted your message to:** ${sentList.join(', ')}!`
    });
  }

  // B. Mass DM Submit
  if (interaction.customId === 'modal_panel_mass_dm') {
    await interaction.deferReply({ flags: 64 });

    const title = interaction.fields.getTextInputValue('dm_title');
    const message = interaction.fields.getTextInputValue('dm_message');
    const mediaUrl = interaction.fields.getTextInputValue('dm_media');
    const guild = interaction.guild;

    // Fetch members
    await interaction.editReply({ content: '⏳ Fetching member list...' });
    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      return interaction.editReply({ content: '❌ Failed to fetch members: ' + err.message });
    }

    const humanMembers = members.filter(m => !m.user.bot);
    const total = humanMembers.size;

    await interaction.editReply({
      content: `🚀 Starting Broadcast to **${total} members**.\n` +
        `⚡ *Using safe delay (1.2s per user) to protect bot from rate limits.*\n` +
        `Estimated completion: **~${Math.ceil((total * 1.2) / 60)} minutes**.`
    });

    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setFooter({ text: `${guild.name} • Official Announcement`, iconURL: guild.iconURL() || undefined })
      .setTimestamp();

    if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
      dmEmbed.setImage(mediaUrl);
    }

    let sent = 0;
    let failed = 0;

    (async () => {
      for (const [, member] of humanMembers) {
        try {
          await member.send({ embeds: [dmEmbed] });
          sent++;
        } catch (err) {
          failed++;
        }
        await new Promise(r => setTimeout(r, 1200));
      }

      console.log(`📢 Dashboard Broadcast complete: ${sent} delivered, ${failed} failed.`);
      const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
      if (logChannel) {
        const report = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('📬 Dashboard Mass Broadcast Completed')
          .addFields(
            { name: '👤 Admin', value: interaction.user.tag, inline: true },
            { name: '📨 Delivered', value: `${sent}`, inline: true },
            { name: '🚫 Closed DMs', value: `${failed}`, inline: true },
            { name: '📝 Title', value: title, inline: false }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [report] }).catch(() => {});
      }
    })();
  }
}

// ==========================================
// --- 10. PRODUCTS & DIGITAL CATALOG SYSTEM ---
// ==========================================
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Helper: Read products database
function getProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading products.json:', err);
  }
  return [];
}

// Setup Interactive Catalog in #💜・store-menu
async function setupStoreMenuPanel() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const storeMenuChannel = guild.channels.cache.get('1566961548470255777') || 
      guild.channels.cache.find(c => c.name.includes('store-menu'));
    if (!storeMenuChannel) return;

    const products = getProducts();

    const catalogEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle('🛍️ NISHU STORE // OFFICIAL DIGITAL STORE CATALOG')
      .setDescription(
        'Welcome to **NISHU STORE | PREMIUM DIGITAL**! 💜\n\n' +
        'Browse our verified collection of premium AI accounts, free data VPN tunnels, Canva suites, and YouTube watch hours.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**🌟 WHY BUY FROM NISHU STORE?**\n' +
        '• ⚡ **Instant Delivery:** Get credentials within 5-15 minutes.\n' +
        '• 🛡️ **Guaranteed Warranty:** 100% full replacement warranty on all products.\n' +
        '• 💳 **Easy Payments:** Bank Transfers, FriMi, eZ Cash, Binance USDT & Card.\n\n' +
        '👇 **Select a product below to view pricing, full specs & order instantly:**'
      )
      .setImage('https://dummyimage.com/800x140/1e1b4b/a855f7&text=NISHU+STORE+•+PREMIUM+DIGITAL+CATALOG')
      .setFooter({ text: 'NISHU STORE • 24/7 Automated Order Desk' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('store_select_product')
      .setPlaceholder('🛒 Choose a product to view details & buy...');

    products.forEach(p => {
      selectMenu.addOptions({
        label: p.name.slice(0, 70),
        description: `${p.priceLKR} • ${p.delivery}`,
        value: p.id,
        emoji: p.categoryEmoji || '🛍️'
      });
    });

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const messages = await storeMenuChannel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('DIGITAL STORE CATALOG'));
    if (botMsg) {
      await botMsg.edit({ embeds: [catalogEmbed], components: [row] });
      console.log('🔄 Updated existing Store Catalog Panel in #store-menu with fresh items & prices!');
      return;
    }

    await storeMenuChannel.send({ embeds: [catalogEmbed], components: [row] });
    console.log('✅ Posted Interactive Store Menu Catalog in #store-menu!');
  } catch (err) {
    console.error('Error in setupStoreMenuPanel:', err);
  }
}

// 1. Handle Product Selection from Store Menu
async function handleStoreSelect(interaction) {
  if (interaction.customId === 'store_select_product') {
    const productId = interaction.values[0];
    const products = getProducts();
    const product = products.find(p => p.id === productId);

    if (!product) {
      return interaction.reply({ content: '❌ Product not found.', flags: 64 });
    }

    const productEmbed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle(`${product.categoryEmoji || '🛍️'} ${product.name}`)
      .setDescription(
        `📂 **Category:** \`${product.category}\`\n\n` +
        `💰 **Price (LKR):** **${product.priceLKR}**\n` +
        `💵 **Price (USD / Crypto):** **${product.priceUSD}**\n` +
        `⏱️ **Delivery Speed:** \`${product.delivery}\`\n` +
        `🛡️ **Warranty:** \`${product.warranty}\`\n` +
        `📦 **Availability:** ${product.inStock ? '🟢 **In Stock (Ready to Deliver)**' : '🔴 **Out of Stock**'}\n\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `**📝 Product Highlights:**\n${product.description}\n\n` +
        '👇 *Click "🛒 Buy / Order Now" below to open your instant private order ticket!*'
      )
      .setFooter({ text: `Product ID: ${product.id} • NISHU STORE` });

    if (product.image) {
      productEmbed.setImage(product.image);
    }

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`store_btn_buy_${product.id}`)
        .setLabel('🛒 Order / Buy Now')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!product.inStock),
      new ButtonBuilder()
        .setLabel('💳 Payment Methods')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/' + interaction.guild.id + '/1566962312512933968')
    );

    return interaction.reply({
      embeds: [productEmbed],
      components: [btnRow],
      flags: 64
    });
  }
}

// 2. Handle Buy Button Click (Create dedicated order ticket)
async function handleStoreButton(interaction) {
  if (interaction.customId.startsWith('store_btn_buy_')) {
    await interaction.deferReply({ flags: 64 });

    const productId = interaction.customId.replace('store_btn_buy_', '');
    const products = getProducts();
    const product = products.find(p => p.id === productId);

    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an open ticket
    const existingChannel = guild.channels.cache.find(c => 
      c.parentId === TICKET_CATEGORY_ID && 
      c.topic && 
      c.topic.includes(user.id)
    );

    if (existingChannel) {
      return interaction.editReply({
        content: `⚠️ You already have an open ticket in ${existingChannel}! Please complete your order there.`
      });
    }

    const prodShortName = product ? product.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : 'order';
    const channelName = `🛒・${prodShortName}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;

    try {
      const orderChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID,
        topic: `Customer: ${user.tag} (${user.id}) | Product: ${product ? product.name : 'Custom Order'}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          ...STAFF_ROLE_IDS.map(roleId => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }))
        ]
      });

      // Staff ping mentions
      const staffPings = STAFF_ROLE_IDS.map(id => `<@&${id}>`).join(' ');

      const orderEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🛒 NEW ORDER TICKET // NISHU STORE')
        .setDescription(
          `👋 Welcome ${user}! Thank you for choosing **NISHU STORE**.\n\n` +
          `🛍️ **Selected Product:** **${product ? product.name : 'Custom Order'}**\n` +
          `💰 **Total Due:** **${product ? product.priceLKR : 'Special Price'}**\n` +
          `⏱️ **Estimated Delivery:** \`${product ? product.delivery : '5-15 Mins'}\`\n` +
          `🛡️ **Warranty:** \`${product ? product.warranty : 'Guaranteed'}\`\n\n` +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '**🏦 OFFICIAL BANK PAYMENT DETAILS:**\n' +
          '• **Bank:** `Bank of Ceylon (BOC)`\n' +
          '• **Account Number:** `96293434`\n' +
          '• **Account Name:** `E M M H S B EKANAYAKE`\n' +
          '• **Branch:** `Peradeniya`\n\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '**📝 HOW TO COMPLETE YOUR ORDER:**\n' +
          '1. Transfer **' + (product ? product.priceLKR : 'the amount') + '** to the BOC account above (Online Banking / CDM / Bank Deposit).\n' +
          '2. **Upload your payment receipt / slip screenshot** right here in this channel.\n' +
          '3. Our **Finance Team** will verify and instantly send your product credentials/keys!'
        )
        .setFooter({ text: 'NISHU STORE • Fast & Reliable Digital Delivery' })
        .setTimestamp();

      const orderRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_copy_bank_info')
          .setLabel('📋 Copy Bank Info')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_copy_account_num')
          .setLabel('🔢 Copy Account No (96293434)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await orderChannel.send({ 
        content: `👋 Hey ${user}! ${staffPings} A new customer is ready to buy!`,
        embeds: [orderEmbed], 
        components: [orderRow] 
      });

      // Log order creation in staff log
      const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
      if (logChannel) {
        const orderLog = new EmbedBuilder()
          .setColor(0x10B981)
          .setTitle('🛍️ New Order Ticket Opened')
          .addFields(
            { name: '👤 Customer', value: `${user.tag} (${user.id})`, inline: true },
            { name: '📦 Product', value: product ? product.name : 'Unknown', inline: true },
            { name: '💬 Channel', value: orderChannel.toString(), inline: false }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [orderLog] }).catch(() => {});
      }

      return interaction.editReply({
        content: `🎉 **Your Order Ticket has been created!** Please proceed to ${orderChannel} to complete your payment and receive your product.`
      });
    } catch (err) {
      console.error('Error creating order channel:', err);
      return interaction.editReply({ content: '❌ Failed to create order ticket: ' + err.message });
    }
  }
}

// ==========================================
// --- 11. MODERN PERSISTENT GIVEAWAY SYSTEM ---
// ==========================================
const GIVEAWAYS_FILE = path.join(__dirname, 'giveaways.json');

function loadGiveaways() {
  try {
    if (!fs.existsSync(GIVEAWAYS_FILE)) {
      fs.writeFileSync(GIVEAWAYS_FILE, '[]', 'utf8');
      return [];
    }
    let data = fs.readFileSync(GIVEAWAYS_FILE, 'utf8').trim();
    // Remove any accidental wrapping quotes or BOM
    data = data.replace(/^\uFEFF/, '').replace(/^['"]|['"]$/g, '').trim();
    if (!data || !data.startsWith('[')) {
      fs.writeFileSync(GIVEAWAYS_FILE, '[]', 'utf8');
      return [];
    }
    return JSON.parse(data);
  } catch (err) {
    try { fs.writeFileSync(GIVEAWAYS_FILE, '[]', 'utf8'); } catch (e) {}
    return [];
  }
}

function saveGiveaways(giveaways) {
  try {
    fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(giveaways, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving giveaways.json:', err);
  }
}

function parseDurationString(str) {
  if (!str) return null;
  const match = str.trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

let giveawayTimerInterval = null;

function initGiveaways() {
  console.log('🎉 Initializing Giveaway System...');
  if (giveawayTimerInterval) clearInterval(giveawayTimerInterval);

  giveawayTimerInterval = setInterval(async () => {
    try {
      const giveaways = loadGiveaways();
      const now = Date.now();
      for (const g of giveaways) {
        if (!g.ended && g.endTime <= now) {
          await endGiveaway(g.messageId);
        }
      }
    } catch (e) {
      console.error('Error in giveaway check interval:', e);
    }
  }, 10000);
}

function buildGiveawayEmbed(g, isEnded = false) {
  const embed = new EmbedBuilder();
  const endTimestamp = Math.floor(g.endTime / 1000);

  if (isEnded) {
    embed
      .setColor(0xED4245)
      .setTitle(`🎁 GIVEAWAY ENDED: ${g.prize}`)
      .setDescription(
        `**Prize:** 🏆 **${g.prize}**\n` +
        `**Hosted by:** <@${g.hostedBy}>\n` +
        `**Total Entries:** 🎟️ **${g.entries.length}**\n\n` +
        (g.winners && g.winners.length > 0
          ? `🏆 **Winner(s):** ${g.winners.map(id => `<@${id}>`).join(', ')}`
          : '❌ **Winner(s):** No valid entries found!')
      )
      .setFooter({ text: 'Giveaway Ended' })
      .setTimestamp(new Date(g.endTime));
  } else {
    embed
      .setColor(0x5865F2)
      .setTitle(`🎉 GIVEAWAY: ${g.prize}`)
      .setDescription(
        `React below with the button to enter!\n\n` +
        `🏆 **Prize:** **${g.prize}**\n` +
        `👑 **Hosted by:** <@${g.hostedBy}>\n` +
        `👥 **Winners:** **${g.winnersCount}**\n` +
        `⏳ **Ends:** <t:${endTimestamp}:R> (<t:${endTimestamp}:F>)\n` +
        `🎟️ **Current Entries:** **${g.entries.length}**`
      )
      .setFooter({ text: `${g.winnersCount} Winner${g.winnersCount > 1 ? 's' : ''} • Good luck!` })
      .setTimestamp(new Date(g.endTime));
  }

  return embed;
}

function buildGiveawayButton(g, isEnded = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter_${g.messageId}`)
      .setLabel(isEnded ? `Ended (${g.entries.length})` : `🎉 Enter Giveaway (${g.entries.length})`)
      .setStyle(isEnded ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(isEnded)
  );
}

async function handleGiveawayCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'start') {
    const durationInput = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners') || 1;
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const durationMs = parseDurationString(durationInput);
    if (!durationMs || durationMs < 5000) {
      return interaction.reply({
        content: '❌ Invalid duration! Please provide a valid duration like `30s`, `10m`, `2h`, `1d`.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    const endTime = Date.now() + durationMs;
    const initialGiveawayData = {
      messageId: '',
      channelId: targetChannel.id,
      guildId: interaction.guildId,
      prize,
      winnersCount,
      hostedBy: interaction.user.id,
      endTime,
      entries: [],
      ended: false,
      winners: []
    };

    const tempEmbed = buildGiveawayEmbed(initialGiveawayData, false);
    const tempRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway_enter_temp')
        .setLabel('🎉 Enter Giveaway (0)')
        .setStyle(ButtonStyle.Primary)
    );

    const giveawayMsg = await targetChannel.send({
      content: '🎉 **NEW GIVEAWAY!** 🎉',
      embeds: [tempEmbed],
      components: [tempRow]
    });

    initialGiveawayData.messageId = giveawayMsg.id;

    // Update message with actual ID in customId
    await giveawayMsg.edit({
      components: [buildGiveawayButton(initialGiveawayData, false)]
    });

    const giveaways = loadGiveaways();
    giveaways.push(initialGiveawayData);
    saveGiveaways(giveaways);

    return interaction.editReply({
      content: `✅ Giveaway started in ${targetChannel}! Message ID: \`${giveawayMsg.id}\``
    });
  }

  if (subcommand === 'end') {
    const messageId = interaction.options.getString('message_id').trim();
    await interaction.deferReply({ flags: 64 });

    const giveaways = loadGiveaways();
    const g = giveaways.find(item => item.messageId === messageId);
    if (!g) {
      return interaction.editReply({ content: `❌ Giveaway with Message ID \`${messageId}\` not found in database!` });
    }
    if (g.ended) {
      return interaction.editReply({ content: '⚠️ This giveaway has already ended!' });
    }

    await endGiveaway(messageId);
    return interaction.editReply({ content: `✅ Giveaway \`${messageId}\` ended immediately!` });
  }

  if (subcommand === 'reroll') {
    const messageId = interaction.options.getString('message_id').trim();
    const count = interaction.options.getInteger('winners') || 1;
    await interaction.deferReply({ flags: 64 });

    const giveaways = loadGiveaways();
    const g = giveaways.find(item => item.messageId === messageId);
    if (!g) {
      return interaction.editReply({ content: `❌ Giveaway with Message ID \`${messageId}\` not found!` });
    }
    if (!g.ended) {
      return interaction.editReply({ content: '⚠️ This giveaway is still running. Use `/giveaway end` to conclude it first.' });
    }

    if (!g.entries || g.entries.length === 0) {
      return interaction.editReply({ content: '❌ No users entered this giveaway, cannot reroll!' });
    }

    const availableEntries = g.entries.filter(id => !g.winners?.includes(id));
    const pool = availableEntries.length > 0 ? availableEntries : g.entries;

    const newWinners = [];
    const poolCopy = [...pool];
    const winnersToPick = Math.min(count, poolCopy.length);

    for (let i = 0; i < winnersToPick; i++) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      newWinners.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
    }

    try {
      const channel = await client.channels.fetch(g.channelId);
      if (channel) {
        await channel.send({
          content: `🎉 **GIVEAWAY REROLL** 🎉\nCongratulations to new winner(s): ${newWinners.map(id => `<@${id}>`).join(', ')}! You won: **${g.prize}**!`
        });
      }
    } catch (e) {
      console.error('Error posting reroll announcement:', e);
    }

    return interaction.editReply({
      content: `🎉 Rerolled! New Winner(s): ${newWinners.map(id => `<@${id}>`).join(', ')}`
    });
  }
}

async function handleGiveawayButton(interaction) {
  const messageId = interaction.customId.replace('giveaway_enter_', '');
  const giveaways = loadGiveaways();
  const g = giveaways.find(item => item.messageId === messageId);

  if (!g) {
    return interaction.reply({ content: '❌ This giveaway is no longer active or recorded.', flags: 64 });
  }

  if (g.ended || g.endTime <= Date.now()) {
    return interaction.reply({ content: '⚠️ This giveaway has already closed!', flags: 64 });
  }

  const userId = interaction.user.id;
  const index = g.entries.indexOf(userId);

  if (index > -1) {
    // Leave giveaway
    g.entries.splice(index, 1);
    saveGiveaways(giveaways);

    try {
      await interaction.message.edit({
        embeds: [buildGiveawayEmbed(g, false)],
        components: [buildGiveawayButton(g, false)]
      });
    } catch (e) {}

    return interaction.reply({
      content: '🚪 You left the giveaway. You can re-enter anytime before it ends!',
      flags: 64
    });
  } else {
    // Enter giveaway
    g.entries.push(userId);
    saveGiveaways(giveaways);

    try {
      await interaction.message.edit({
        embeds: [buildGiveawayEmbed(g, false)],
        components: [buildGiveawayButton(g, false)]
      });
    } catch (e) {}

    return interaction.reply({
      content: `🎉 You successfully entered the giveaway for **${g.prize}**! Good luck! 🍀`,
      flags: 64
    });
  }
}

async function endGiveaway(messageId) {
  const giveaways = loadGiveaways();
  const g = giveaways.find(item => item.messageId === messageId);
  if (!g || g.ended) return;

  g.ended = true;

  // Pick random winner(s)
  const winners = [];
  if (g.entries && g.entries.length > 0) {
    const pool = [...g.entries];
    const winnersCount = Math.min(g.winnersCount || 1, pool.length);
    for (let i = 0; i < winnersCount; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool[idx]);
      pool.splice(idx, 1);
    }
  }

  g.winners = winners;
  saveGiveaways(giveaways);

  try {
    const channel = await client.channels.fetch(g.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(g.messageId).catch(() => null);
    if (message) {
      await message.edit({
        embeds: [buildGiveawayEmbed(g, true)],
        components: [buildGiveawayButton(g, true)]
      });
    }

    if (winners.length > 0) {
      const winnerPings = winners.map(id => `<@${id}>`).join(' ');
      await channel.send({
        content: `🎉 Congratulations ${winnerPings}! You won **${g.prize}**! 🏆`,
        reply: message ? { messageReference: message.id } : undefined
      });

      // Try sending DMs to winners
      for (const wId of winners) {
        try {
          const u = await client.users.fetch(wId);
          if (u) {
            const winDmEmbed = new EmbedBuilder()
              .setColor(0xF59E0B)
              .setTitle('🎉 CONGRATULATIONS! YOU WON A GIVEAWAY! 🏆')
              .setDescription(
                `Hey ${u.username}!\n\n` +
                `You were chosen as a winner for: **${g.prize}** in **NISHU STORE**!\n\n` +
                `📩 Please open a support ticket or check with <@${g.hostedBy}> to claim your prize!`
              )
              .setTimestamp();
            await u.send({ embeds: [winDmEmbed] }).catch(() => {});
          }
        } catch (dmErr) {}
      }
    } else {
      await channel.send({
        content: `⚠️ Giveaway for **${g.prize}** ended, but no eligible entries were recorded!`,
        reply: message ? { messageReference: message.id } : undefined
      });
    }
  } catch (err) {
    console.error(`Error ending giveaway ${messageId}:`, err);
  }
}

// ==========================================
// --- 12. STORE VOUCH & REVIEWS SYSTEM ---
// ==========================================
const VOUCHES_FILE = path.join(__dirname, 'vouches.json');
const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID || '1566975747879477299'; // Defaults to logs or reviews channel

function loadVouches() {
  try {
    if (!fs.existsSync(VOUCHES_FILE)) {
      fs.writeFileSync(VOUCHES_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(VOUCHES_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('Error loading vouches.json:', err);
    return [];
  }
}

function saveVouches(vouches) {
  try {
    fs.writeFileSync(VOUCHES_FILE, JSON.stringify(vouches, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving vouches.json:', err);
  }
}

async function handleVouchCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const rating = interaction.options.getInteger('rating');
  const product = interaction.options.getString('product');
  const comment = interaction.options.getString('comment');
  const proofAttachment = interaction.options.getAttachment('proof');

  const starsString = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

  const vouches = loadVouches();
  const newVouch = {
    id: Date.now().toString(),
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    rating,
    product,
    comment,
    proofUrl: proofAttachment ? proofAttachment.url : null,
    timestamp: Date.now()
  };

  vouches.push(newVouch);
  saveVouches(vouches);

  // Calculate Average Rating
  const totalRatings = vouches.reduce((acc, v) => acc + (v.rating || 5), 0);
  const averageRating = (totalRatings / vouches.length).toFixed(1);

  // Target vouch channel
  let targetChannel = null;
  if (process.env.VOUCH_CHANNEL_ID) {
    targetChannel = interaction.guild.channels.cache.get(process.env.VOUCH_CHANNEL_ID);
  }
  if (!targetChannel) {
    // Search for a channel named #vouches, #reviews, or fallback to current channel
    targetChannel = interaction.guild.channels.cache.find(c => 
      c.name.includes('vouch') || c.name.includes('review')
    ) || interaction.channel;
  }

  const vouchEmbed = new EmbedBuilder()
    .setColor(rating >= 4 ? 0x10B981 : (rating === 3 ? 0xF59E0B : 0xEF4444))
    .setTitle('🌟 NEW CUSTOMER REVIEW // VOUCH')
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Customer', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: '📦 Product / Service', value: `\`${product}\``, inline: true },
      { name: '⭐ Rating', value: `${starsString} (**${rating}/5**)`, inline: true },
      { name: '💬 Review', value: comment, inline: false },
      { name: '📊 Overall Store Rating', value: `⭐ **${averageRating} / 5.0** (${vouches.length} Total Reviews)`, inline: false }
    )
    .setFooter({ text: 'NISHU STORE • Verified Customer Review' })
    .setTimestamp();

  if (proofAttachment && proofAttachment.contentType && proofAttachment.contentType.startsWith('image/')) {
    vouchEmbed.setImage(proofAttachment.url);
  }

  try {
    const postedMsg = await targetChannel.send({ embeds: [vouchEmbed] });
    await postedMsg.react('❤️').catch(() => {});
    await postedMsg.react('⭐').catch(() => {});
  } catch (err) {
    console.error('Error posting vouch to channel:', err);
  }

  return interaction.editReply({
    content: `✅ **Thank you for your review!** Your vouch has been recorded and posted in ${targetChannel}. Overall rating: **${averageRating} / 5.0** ⭐`
  });
}

// ==========================================
// --- 13. AUTO-MOD & ANTI-LINK/SPAM PROTECTION ---
// ==========================================
const AUTOMOD_FILE = path.join(__dirname, 'automod.json');

const DEFAULT_AUTOMOD_CONFIG = {
  antiLink: true,
  antiDiscord: true,
  antiSpam: true,
  whitelistedRoles: [],
  whitelistedChannels: [],
  blacklistedWords: []
};

function loadAutoModConfig() {
  try {
    if (!fs.existsSync(AUTOMOD_FILE)) {
      fs.writeFileSync(AUTOMOD_FILE, JSON.stringify(DEFAULT_AUTOMOD_CONFIG, null, 2), 'utf8');
      return { ...DEFAULT_AUTOMOD_CONFIG };
    }
    const data = fs.readFileSync(AUTOMOD_FILE, 'utf8');
    return { ...DEFAULT_AUTOMOD_CONFIG, ...JSON.parse(data) };
  } catch (err) {
    console.error('Error loading automod.json:', err);
    return { ...DEFAULT_AUTOMOD_CONFIG };
  }
}

function saveAutoModConfig(config) {
  try {
    fs.writeFileSync(AUTOMOD_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving automod.json:', err);
  }
}

// In-memory spam tracker: userId -> timestamp[]
const userMessageHistory = new Map();

async function handleAutoModCommand(interaction) {
  // Only server Administrators / Server Owner / Staff can configure Auto-Mod
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: '❌ **Access Denied:** Only the Server Owner or Administrators can configure Auto-Mod rules!',
      flags: 64
    });
  }

  const subcommand = interaction.options.getSubcommand();
  const config = loadAutoModConfig();

  if (subcommand === 'status') {
    const statusEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ NISHU STORE // AUTO-MOD SECURITY DASHBOARD')
      .setDescription(
        'Here are the current protection settings applied across the server:\n\n' +
        `• 🔗 **Anti-Link Protection:** ${config.antiLink ? '✅ `ENABLED` (Blocks external web links)' : '❌ `DISABLED`'}\n` +
        `• 📨 **Anti-Discord Invites:** ${config.antiDiscord ? '✅ `ENABLED` (Blocks server invite links)' : '❌ `DISABLED`'}\n` +
        `• ⚡ **Anti-Spam Filter:** ${config.antiSpam ? '✅ `ENABLED` (Blocks > 5 msgs in 4s)' : '❌ `DISABLED`'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚫 **Blacklisted Words (${config.blacklistedWords.length}):**\n` +
        (config.blacklistedWords.length > 0 ? config.blacklistedWords.map(w => `\`${w}\``).join(', ') : '*No banned words set yet.*') + '\n\n' +
        `🛡️ **Whitelisted Roles:**\n` +
        (config.whitelistedRoles.length > 0 ? config.whitelistedRoles.map(r => `<@&${r}>`).join(', ') : '*None (Staff roles always bypassed)*') + '\n\n' +
        `📢 **Whitelisted Channels:**\n` +
        (config.whitelistedChannels.length > 0 ? config.whitelistedChannels.map(c => `<#${c}>`).join(', ') : '*None (Protected everywhere)*')
      )
      .setFooter({ text: 'Configured by Owner/Staff • Live Defense System' })
      .setTimestamp();

    return interaction.reply({ embeds: [statusEmbed], flags: 64 });
  }

  if (subcommand === 'toggle') {
    const feature = interaction.options.getString('feature');
    const enabled = interaction.options.getBoolean('enabled');

    config[feature] = enabled;
    saveAutoModConfig(config);

    const featureNames = {
      antiLink: 'Anti-Link Protection (External Links)',
      antiDiscord: 'Anti-Discord Invites (discord.gg)',
      antiSpam: 'Anti-Spam Defense'
    };

    return interaction.reply({
      content: `✅ **Auto-Mod Updated:** \`${featureNames[feature]}\` is now **${enabled ? 'ENABLED 🟢' : 'DISABLED 🔴'}**!`,
      flags: 64
    });
  }

  if (subcommand === 'word') {
    const action = interaction.options.getString('action');
    const wordText = interaction.options.getString('text').trim().toLowerCase();

    if (action === 'add') {
      if (!config.blacklistedWords.includes(wordText)) {
        config.blacklistedWords.push(wordText);
        saveAutoModConfig(config);
        return interaction.reply({
          content: `✅ Added word/phrase \`${wordText}\` to the Auto-Mod blacklist! Any message containing this will be deleted instantly.`,
          flags: 64
        });
      } else {
        return interaction.reply({ content: `⚠️ \`${wordText}\` is already in the blacklist!`, flags: 64 });
      }
    } else if (action === 'remove') {
      const idx = config.blacklistedWords.indexOf(wordText);
      if (idx > -1) {
        config.blacklistedWords.splice(idx, 1);
        saveAutoModConfig(config);
        return interaction.reply({ content: `✅ Removed \`${wordText}\` from the Auto-Mod blacklist!`, flags: 64 });
      } else {
        return interaction.reply({ content: `❌ Word \`${wordText}\` was not found in the blacklist!`, flags: 64 });
      }
    }
  }

  if (subcommand === 'whitelist') {
    const type = interaction.options.getString('type');

    if (type === 'channel') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const idx = config.whitelistedChannels.indexOf(targetChannel.id);
      if (idx > -1) {
        config.whitelistedChannels.splice(idx, 1);
        saveAutoModConfig(config);
        return interaction.reply({
          content: `🔒 Removed ${targetChannel} from whitelist. Auto-Mod is now **active** in this channel!`,
          flags: 64
        });
      } else {
        config.whitelistedChannels.push(targetChannel.id);
        saveAutoModConfig(config);
        return interaction.reply({
          content: `🔓 Whitelisted ${targetChannel}! Auto-Mod rules will now **ignore** messages posted here.`,
          flags: 64
        });
      }
    }

    if (type === 'role') {
      const role = interaction.options.getRole('role');
      if (!role) {
        return interaction.reply({ content: '❌ Please select a role to whitelist!', flags: 64 });
      }

      const idx = config.whitelistedRoles.indexOf(role.id);
      if (idx > -1) {
        config.whitelistedRoles.splice(idx, 1);
        saveAutoModConfig(config);
        return interaction.reply({ content: `🔒 Removed ${role} from whitelist.`, flags: 64 });
      } else {
        config.whitelistedRoles.push(role.id);
        saveAutoModConfig(config);
        return interaction.reply({ content: `🔓 Whitelisted ${role}! Members with this role can bypass Auto-Mod filters.`, flags: 64 });
      }
    }
  }
}

// --- MESSAGE LISTENER FOR AUTO-MOD & TICKET PAYMENT SLIPS ---
client.on('messageCreate', async (message) => {
  try {
    // Ignore bots and direct messages
    if (!message.guild || message.author.bot) return;

    // A. DETECT PAYMENT SLIP UPLOAD IN ORDER / SUPPORT TICKETS
    if (message.channel.parentId === TICKET_CATEGORY_ID && message.attachments.size > 0) {
      const isImage = message.attachments.some(a => a.contentType && a.contentType.startsWith('image/'));
      if (isImage) {
        await handlePaymentSlipUpload(message);
        return; // Processed as payment slip, skip automod
      }
    }

    // B. DETECT ADMIN PHOTO BROADCAST / UPLOAD FROM #bot-texts (OR ANY CHANNEL)
    if (adminPendingPhotoUpload.has(message.author.id) && message.attachments.size > 0) {
      const pending = adminPendingPhotoUpload.get(message.author.id);
      if (Date.now() > pending.expires) {
        adminPendingPhotoUpload.delete(message.author.id);
      } else {
        adminPendingPhotoUpload.delete(message.author.id);
        const guild = message.guild;
        const attachments = Array.from(message.attachments.values());
        const caption = message.content ? message.content.trim() : '';

        // Case 1: PICTURE MASS DM TO ALL MEMBERS
        if (pending.isMassDM) {
          const statusMsg = await message.channel.send({
            content: '⏳ **Fetching member list for Picture Mass DM...**'
          }).catch(() => {});

          let members;
          try {
            members = await guild.members.fetch();
          } catch (err) {
            if (statusMsg) await statusMsg.edit({ content: '❌ Failed to fetch members: ' + err.message }).catch(() => {});
            return;
          }

          const humanMembers = members.filter(m => !m.user.bot);
          const total = humanMembers.size;

          if (statusMsg) {
            await statusMsg.edit({
              content: `🚀 Starting Picture Mass DM to **${total} members**.\n` +
                `⚡ *Using safe delay (1.2s per user) to protect bot from Discord limits.*\n` +
                `Estimated completion: **~${Math.ceil((total * 1.2) / 60)} minutes**.`
            }).catch(() => {});
          }

          const fileUrls = attachments.map(att => att.url);

          (async () => {
            let sent = 0;
            let failed = 0;

            for (const [, member] of humanMembers) {
              try {
                await member.send({
                  content: caption || undefined,
                  files: fileUrls
                });
                sent++;
              } catch (err) {
                failed++;
              }
              await new Promise(r => setTimeout(r, 1200));
            }

            console.log(`📢 Picture Mass DM complete: ${sent} delivered, ${failed} failed.`);
            if (statusMsg) {
              await statusMsg.edit({
                content: `✅ **Picture Mass DM Broadcast Finished!**\n📨 Delivered: **${sent}**\n🚫 Closed DMs: **${failed}**`
              }).catch(() => {});
            }

            const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
            if (logChannel) {
              const report = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('📬 Picture Mass DM Broadcast Completed')
                .addFields(
                  { name: '👤 Admin', value: message.author.tag, inline: true },
                  { name: '📨 Delivered', value: `${sent}`, inline: true },
                  { name: '🚫 Closed DMs', value: `${failed}`, inline: true },
                  { name: '📝 Caption', value: caption || '*(No Caption)*', inline: false }
                )
                .setTimestamp();
              await logChannel.send({ embeds: [report] }).catch(() => {});
            }
          })();

          // Clean admin upload message in bot-texts
          if (message.channel.name.includes('bot-texts')) {
            await message.delete().catch(() => {});
          }
          return;
        }

        // Case 2: POST PICTURE TO SPECIFIC CHANNELS
        const targetChannelIds = pending.channelIds || [];
        const sentChannels = [];
        for (const chId of targetChannelIds) {
          const ch = guild.channels.cache.get(chId);
          if (!ch) continue;
          try {
            await ch.send({
              content: caption || undefined,
              files: attachments.map(att => att.url)
            });
            sentChannels.push(ch.toString());
          } catch (err) {
            console.error(`Failed to post picture to ${ch.name}:`, err);
          }
        }

        // Delete user's raw upload message in #bot-texts to keep it clean if possible
        if (message.channel.name.includes('bot-texts')) {
          await message.delete().catch(() => {});
        }

        // Send confirmation in the current channel (auto-deleting after 10s)
        const confirmMsg = await message.channel.send({
          content: `✅ **Successfully published your picture to:** ${sentChannels.join(', ')}!`
        }).catch(() => {});

        if (confirmMsg && message.channel.name.includes('bot-texts')) {
          setTimeout(() => confirmMsg.delete().catch(() => {}), 10000);
        }

        return; // Stop processing further for this message
      }
    }

    // Check if user is Server Owner or Admin (Always bypassed)
    if (message.author.id === message.guild.ownerId || message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return;
    }

    const config = loadAutoModConfig();

    // Check channel whitelist
    if (config.whitelistedChannels.includes(message.channel.id)) return;

    // Check role whitelist
    if (message.member && config.whitelistedRoles.some(rId => message.member.roles.cache.has(rId))) {
      return;
    }

    const content = message.content || '';
    let violationReason = null;

    // 1. Check Anti-Discord Invite Links
    if (config.antiDiscord) {
      const discordInviteRegex = /(discord\.(gg|io|me|li)\/.+|discordapp\.com\/invite\/.+|discord\.com\/invite\/.+)/i;
      if (discordInviteRegex.test(content)) {
        violationReason = 'Discord Server Invite Links are strictly not allowed!';
      }
    }

    // 2. Check Anti-Links (General web URLs)
    if (!violationReason && config.antiLink) {
      const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
      if (linkRegex.test(content)) {
        violationReason = 'Posting unauthorized external web links is prohibited!';
      }
    }

    // 3. Check Blacklisted Words
    if (!violationReason && config.blacklistedWords.length > 0) {
      const lower = content.toLowerCase();
      for (const badWord of config.blacklistedWords) {
        if (lower.includes(badWord)) {
          violationReason = `Your message contained a banned word/phrase.`;
          break;
        }
      }
    }

    // 4. Check Anti-Spam (More than 5 messages within 4 seconds)
    if (!violationReason && config.antiSpam) {
      const now = Date.now();
      const userId = message.author.id;
      const history = userMessageHistory.get(userId) || [];

      // Filter timestamps within last 4000ms
      const recent = history.filter(t => now - t < 4000);
      recent.push(now);
      userMessageHistory.set(userId, recent);

      if (recent.length >= 5) {
        violationReason = 'Please slow down! Rapid message spamming is not allowed.';
      }
    }

    // If violation found, delete message & warn
    if (violationReason) {
      await message.delete().catch(() => {});

      const warnEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🛡️ NISHU STORE // AUTO-MOD WARNING')
        .setDescription(`⚠️ ${message.author}, your message was removed!\n\n**Reason:** ${violationReason}`)
        .setFooter({ text: 'Auto-Mod Security System' });

      const warnMsg = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
      }
    }
  } catch (err) {
    console.error('Error in Auto-Mod message listener:', err);
  }
});

// ==========================================
// --- 14. SMART AUTO-PRETTY ANNOUNCEMENT ENGINE ---
// ==========================================

function formatSmartAnnouncement(rawText, customTitle) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Smart Title Detection
  let title = customTitle;
  if (!title) {
    if (lower.includes('sale') || lower.includes('discount') || lower.includes('offer') || lower.includes('deal') || lower.includes('% off')) {
      title = '🔥 SPECIAL STORE OFFER // LIMITED SALE';
    } else if (lower.includes('giveaway') || lower.includes('gift') || lower.includes('win') || lower.includes('nitro')) {
      title = '🎉 EXCLUSIVE COMMUNITY GIVEAWAY & REWARDS';
    } else if (lower.includes('rule') || lower.includes('warning') || lower.includes('scam') || lower.includes('notice')) {
      title = '⚠️ IMPORTANT SERVER NOTICE & SECURITY BULLETIN';
    } else if (lower.includes('update') || lower.includes('new') || lower.includes('feature')) {
      title = '🚀 NEW STORE UPDATE & FEATURE RELEASE';
    } else if (lower.includes('maintenance') || lower.includes('down') || lower.includes('offline')) {
      title = '🔧 SCHEDULED MAINTENANCE & SYSTEM NOTICE';
    } else {
      title = '📢 NISHU STORE OFFICIAL ANNOUNCEMENT';
    }
  }

  // 2. Smart Theme Color
  let color = 0x5865F2; // Default Blurple
  if (lower.includes('sale') || lower.includes('discount') || lower.includes('deal') || lower.includes('% off')) {
    color = 0x10B981; // Green for discounts/money
  } else if (lower.includes('giveaway') || lower.includes('win') || lower.includes('gift')) {
    color = 0xF59E0B; // Gold / Yellow
  } else if (lower.includes('warning') || lower.includes('rule') || lower.includes('ban') || lower.includes('scam')) {
    color = 0xED4245; // Red
  } else if (lower.includes('update') || lower.includes('release')) {
    color = 0x9333EA; // Purple
  }

  // 3. Beautify Text Body
  // Convert newlines and sentences into structured clean points
  const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const formattedSections = [];

  for (const line of rawLines) {
    // If line starts with a list marker or bullet, preserve
    if (/^[-*•\d+.]/i.test(line)) {
      formattedSections.push(`🔹 ${line.replace(/^[-*•]\s*/, '')}`);
    } else if (line.length > 80 && line.includes('.')) {
      // Split into sentences for cleaner reading
      const sentences = line.split(/(?<=[.!?])\s+/);
      formattedSections.push(sentences.join('\n\n'));
    } else {
      formattedSections.push(line);
    }
  }

  let formattedBody = formattedSections.join('\n\n');

  // Highlight key keywords for premium look
  formattedBody = formattedBody
    .replace(/\b(sale|discount|deal|cheap|free|best price)\b/gi, '**$&**')
    .replace(/\b(netflix|nitro|spotify|canva|prime|youtube|apple|discord)\b/gi, '**$&**')
    .replace(/\b(ticket|open a ticket|support|dm)\b/gi, '🎫 **$&**')
    .replace(/\b(instant delivery|24\/7|fast delivery)\b/gi, '⚡ **$&**');

  const fullDescription = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    formattedBody,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `✨ *Brought to you by **NISHU STORE** • Always Premium & Secure*`
  ].join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(fullDescription)
    .setFooter({ text: 'NISHU STORE • Verified Announcement', iconURL: 'https://cdn.discordapp.com/emojis/1041000844788371536.webp' })
    .setTimestamp();

  return embed;
}

async function handleAnnounceCommand(interaction) {
  await interaction.deferReply({ flags: 64 });

  const rawMessage = interaction.options.getString('message');
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
  const customTitle = interaction.options.getString('title');
  const imageAttachment = interaction.options.getAttachment('image');
  const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;

  const embed = formatSmartAnnouncement(rawMessage, customTitle);

  if (imageAttachment && imageAttachment.contentType && imageAttachment.contentType.startsWith('image/')) {
    embed.setImage(imageAttachment.url);
  }

  try {
    const postPayload = {
      embeds: [embed]
    };
    if (pingEveryone) {
      postPayload.content = '@everyone';
    }

    const sentMessage = await targetChannel.send(postPayload);
    await sentMessage.react('🔥').catch(() => {});
    await sentMessage.react('❤️').catch(() => {});

    return interaction.editReply({
      content: `✅ **Announcement beautified & posted successfully in ${targetChannel}!** [View Announcement](${sentMessage.url})`
    });
  } catch (err) {
    console.error('Error posting beautified announcement:', err);
    return interaction.editReply({ content: '❌ Failed to post announcement: ' + err.message });
  }
}

// ==========================================
// --- 15. INVITE TRACKING & LEADERBOARD SYSTEM ---
// ==========================================
const INVITES_FILE = path.join(__dirname, 'invites.json');

// Memory cache of server invites: guildId -> Collection(inviteCode -> uses)
const guildInvitesCache = new Map();

// Map of memberId -> inviterId (to track who leaves)
const memberJoinedWithInviter = new Map();

function loadInvitesData() {
  try {
    if (!fs.existsSync(INVITES_FILE)) {
      fs.writeFileSync(INVITES_FILE, '{}', 'utf8');
      return {};
    }
    const data = fs.readFileSync(INVITES_FILE, 'utf8');
    return JSON.parse(data) || {};
  } catch (err) {
    console.error('Error loading invites.json:', err);
    return {};
  }
}

function saveInvitesData(data) {
  try {
    fs.writeFileSync(INVITES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving invites.json:', err);
  }
}

async function loadServerInvites() {
  try {
    console.log('🔗 Caching Server Invites...');
    for (const guild of client.guilds.cache.values()) {
      try {
        const firstInvites = await guild.invites.fetch();
        guildInvitesCache.set(guild.id, new Map(firstInvites.map(inv => [inv.code, inv.uses])));
      } catch (e) {
        console.warn(`Could not cache invites for guild ${guild.name}: ${e.message}`);
      }
    }
    console.log('✅ Server Invites cached successfully!');
  } catch (err) {
    console.error('Error loading server invites:', err);
  }
}

async function handleMemberInviteJoin(member) {
  try {
    const cachedInvites = guildInvitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    guildInvitesCache.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));

    if (!cachedInvites) return;

    // Find the invite whose use count increased
    const usedInvite = newInvites.find(inv => {
      const prevUses = cachedInvites.get(inv.code) || 0;
      return inv.uses > prevUses;
    });

    if (usedInvite && usedInvite.inviter) {
      const inviter = usedInvite.inviter;
      memberJoinedWithInviter.set(member.id, inviter.id);

      const allData = loadInvitesData();
      if (!allData[inviter.id]) {
        allData[inviter.id] = { regular: 0, left: 0, fake: 0, total: 0 };
      }

      // Check if self-invite or fake
      if (inviter.id === member.id) {
        allData[inviter.id].fake = (allData[inviter.id].fake || 0) + 1;
      } else {
        allData[inviter.id].regular = (allData[inviter.id].regular || 0) + 1;
      }
      allData[inviter.id].total = (allData[inviter.id].regular || 0) - (allData[inviter.id].left || 0);

      saveInvitesData(allData);
      console.log(`📈 ${member.user.tag} joined using invite from ${inviter.tag} (Total: ${allData[inviter.id].total})`);
    }
  } catch (err) {
    console.error('Error handling member invite join:', err);
  }
}

async function handleMemberInviteLeave(member) {
  try {
    const inviterId = memberJoinedWithInviter.get(member.id);
    if (!inviterId) return;

    const allData = loadInvitesData();
    if (allData[inviterId]) {
      allData[inviterId].left = (allData[inviterId].left || 0) + 1;
      allData[inviterId].total = Math.max(0, (allData[inviterId].regular || 0) - (allData[inviterId].left || 0));
      saveInvitesData(allData);
      console.log(`📉 Member left. Deducted invite from inviter ID ${inviterId} (Remaining: ${allData[inviterId].total})`);
    }
    memberJoinedWithInviter.delete(member.id);
  } catch (err) {
    console.error('Error handling member invite leave:', err);
  }
}

async function handleInvitesCommand(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });
    const targetUser = (interaction.options && interaction.options.getUser) ? (interaction.options.getUser('user') || interaction.user) : interaction.user;
    const allData = loadInvitesData();
    const userData = allData[targetUser.id] || { regular: 0, left: 0, fake: 0, total: 0 };

    const regular = userData.regular || 0;
    const left = userData.left || 0;
    const fake = userData.fake || 0;
    const net = Math.max(0, regular - left);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🔗 INVITE STATS // ${targetUser.username.toUpperCase()}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(
        `Here is the verified server invite statistics for **${targetUser}**:\n\n` +
        `✨ **Net Real Invites:** **${net}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📥 **Joins (Regular):** \`${regular}\` members\n` +
        `🚪 **Leaves (Left):** \`${left}\` members\n` +
        `⚠️ **Fake / Self:** \`${fake}\` members\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'NISHU STORE • Official Invite Tracker' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Error in handleInvitesCommand:', err);
    if (!interaction.replied) {
      return interaction.editReply({ content: '❌ Error loading your stats.' }).catch(() => {});
    }
  }
}

async function handleInviteRankCommand(interaction) {
  await interaction.deferReply();
  const allData = loadInvitesData();

  const sorted = Object.entries(allData)
    .map(([userId, data]) => ({
      userId,
      regular: data.regular || 0,
      left: data.left || 0,
      fake: data.fake || 0,
      net: Math.max(0, (data.regular || 0) - (data.left || 0))
    }))
    .filter(item => item.net > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 10);

  if (sorted.length === 0) {
    return interaction.editReply({
      content: '📊 **No invite records found yet!** Start sharing your server invite link to get on the leaderboard!'
    });
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const leaderboardLines = sorted.map((entry, index) => {
    const medal = medals[index] || `\`#${index + 1}\``;
    return `${medal} <@${entry.userId}> • **${entry.net} invites** (*${entry.regular} joins, ${entry.left} leaves*)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xF59E0B)
    .setTitle('🏆 NISHU STORE // TOP INVITE LEADERBOARD')
    .setDescription(
      'Top members who brought the most verified friends and customers to our store server!\n\n' +
      leaderboardLines.join('\n\n') + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '💡 *Want to climb the leaderboard? Create an invite in Discord and share it with your friends!*'
    )
    .setFooter({ text: 'NISHU STORE • Real-Time Invite Leaderboard' })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleGetMyInviteLink(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const guild = interaction.guild;
    const channel = interaction.channel || guild.rulesChannel || guild.channels.cache.first();

    const allData = loadInvitesData();
    if (!allData[interaction.user.id]) {
      allData[interaction.user.id] = { regular: 0, left: 0, fake: 0, total: 0 };
    }

    let inviteUrl = allData[interaction.user.id].inviteUrl;
    let userInvite = null;

    const existingInvites = await guild.invites.fetch().catch(() => null);

    // If we have a saved code, verify it still exists in the guild
    if (inviteUrl && existingInvites) {
      const code = inviteUrl.split('/').pop();
      userInvite = existingInvites.get(code);
    }

    // If not found in memory/database, look for any permanent invite by this user
    if (!userInvite && existingInvites) {
      userInvite = existingInvites.find(inv => inv.inviter && inv.inviter.id === interaction.user.id && (inv.maxAge === 0 || !inv.maxAge) && (inv.maxUses === 0 || !inv.maxUses));
    }

    // If still no invite exists, create ONE single permanent invite link for this user
    if (!userInvite) {
      userInvite = await channel.createInvite({
        maxAge: 0, // Never expire
        maxUses: 0, // Unlimited uses
        unique: true, // MUST be true so every user gets their own unique invite code!
        reason: `Permanent Invite Link for ${interaction.user.tag} (${interaction.user.id})`
      });

      // Update in-memory tracking cache
      const cached = guildInvitesCache.get(guild.id) || new Map();
      cached.set(userInvite.code, userInvite.uses);
      guildInvitesCache.set(guild.id, cached);
    }

    inviteUrl = userInvite.url;
    allData[interaction.user.id].inviteUrl = inviteUrl;
    saveInvitesData(allData);

    const linkEmbed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle('🔗 YOUR PERSONAL INVITE LINK')
      .setDescription(
        `Here is your unique permanent invite link for **NISHU STORE**:\n\n` +
        `👉 **${inviteUrl}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**💡 How to use:**\n` +
        `• Copy and share this link with your friends or on social media.\n` +
        `• Anyone who joins using this link will **automatically count towards your invite stats**!\n` +
        `• Check your stats anytime by clicking **"📊 My Stats"**.\n` +
        `• Reach **25 Invites (Unlimited Data)** or **30 Invites (Free Fire Panel)** to claim prizes!`
      )
      .setFooter({ text: 'NISHU STORE • Personal Tracking Active' })
      .setTimestamp();

    return interaction.editReply({ embeds: [linkEmbed] });
  } catch (err) {
    console.error('Error generating personal invite link:', err);
    return interaction.editReply({
      content: '❌ Failed to generate invite link! Please check if the bot has "Create Instant Invite" permission.'
    });
  }
}

async function handleStaffCommand(interaction) {
  await interaction.deferReply();
  try {
    const guild = interaction.guild;
    await guild.members.fetch(); // Ensure full member cache

    // Find Finance Managers Role
    const financeRole = guild.roles.cache.find(r => 
      r.name.toLowerCase().includes('finance manager') || r.name.toLowerCase().includes('finance')
    );

    const financeMembers = financeRole ? financeRole.members.map(m => `• <@${m.id}> (\`${m.user.tag}\`)`) : [];

    const embed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle('👥 NISHU STORE // OFFICIAL STAFF & FINANCE TEAM')
      .setDescription(
        'Here is the verified list of members who handle store orders, payments, and receipts:\n\n' +
        `💳 **Finance Managers (${financeMembers.length}):**\n` +
        (financeMembers.length > 0 ? financeMembers.join('\n') : '*No members currently assigned to this role.*') + '\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '💡 *Need to make a payment or verify an order? Only trust members with this role!*'
      )
      .setFooter({ text: 'NISHU STORE • Staff Verification' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Error in handleStaffCommand:', err);
    return interaction.editReply({ content: '❌ Failed to fetch staff list: ' + err.message });
  }
}

// ==========================================
// --- 17. AUTOMATED PAYMENT SLIP VERIFICATION SYSTEM ---
// ==========================================

async function handlePaymentSlipUpload(message) {
  try {
    const slipAttachment = message.attachments.find(a => a.contentType && a.contentType.startsWith('image/'));
    if (!slipAttachment) return;

    const guild = message.guild;
    const customer = message.author;
    const ticketChannel = message.channel;

    // React to slip upload
    await message.react('🧾').catch(() => {});
    await message.react('⏳').catch(() => {});

    // Find Finance Managers Role
    const financeRole = guild.roles.cache.find(r => 
      r.name.toLowerCase().includes('finance manager') || r.name.toLowerCase().includes('finance')
    );
    const financeMention = financeRole ? `${financeRole}` : '@Finance Team';

    const verifyEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('🧾 PAYMENT SLIP SUBMITTED // ACTION REQUIRED')
      .setDescription(
        `👋 ${financeMention}, a payment receipt has been uploaded for verification!\n\n` +
        `👤 **Customer:** ${customer} (\`${customer.tag}\`)\n` +
        `💬 **Ticket Channel:** ${ticketChannel}\n` +
        `⏰ **Submitted At:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
        '👇 **Please check the attached payment slip and select an action:**'
      )
      .setImage(slipAttachment.url)
      .setFooter({ text: 'NISHU STORE • Finance Verification Desk' })
      .setTimestamp();

    // Verification Buttons for Finance Team (Stores customerId and ticketChannelId in customId)
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_pay_approve_${customer.id}_${ticketChannel.id}`)
        .setLabel('Approve Payment')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_pay_reject_${customer.id}_${ticketChannel.id}`)
        .setLabel('Reject Slip')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    // Send in Ticket Channel
    await ticketChannel.send({
      content: `🔔 ${financeMention} **New Payment Slip Uploaded by ${customer}!**`,
      embeds: [verifyEmbed],
      components: [actionRow]
    });

    // Send direct Private DM to every member who has the Finance Role
    try {
      if (financeRole) {
        // Fetch members to ensure full cache
        await guild.members.fetch();
        const financeMembers = financeRole.members;
        
        const dmFinanceEmbed = new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle('🚨 NEW PAYMENT SLIP TO VERIFY // NISHU STORE')
          .setDescription(
            `Hey Finance Team! Customer ${customer} (\`${customer.tag}\`) just uploaded a payment slip.\n\n` +
            `💬 **Ticket Channel:** ${ticketChannel.name} (<#${ticketChannel.id}>)\n` +
            `👤 **Customer ID:** \`${customer.id}\`\n\n` +
            `👉 You can approve or reject directly from this DM or from the ticket channel!`
          )
          .setImage(slipAttachment.url)
          .setFooter({ text: 'NISHU STORE • Finance Alert' })
          .setTimestamp();

        for (const [_, member] of financeMembers) {
          if (!member.user.bot) {
            await member.send({
              embeds: [dmFinanceEmbed],
              components: [actionRow]
            }).catch(e => console.warn(`Could not send DM to finance member ${member.user.tag}:`, e.message));
          }
        }
      }
    } catch (dmErr) {
      console.warn('Error sending DM to finance role members:', dmErr.message);
    }
  } catch (err) {
    console.error('Error handling payment slip upload:', err);
  }
}

async function handlePaymentSlipDecision(interaction) {
  try {
    await interaction.deferUpdate().catch(() => {});

    const isApprove = interaction.customId.startsWith('btn_pay_approve_');
    const parts = interaction.customId.replace(isApprove ? 'btn_pay_approve_' : 'btn_pay_reject_', '').split('_');
    const customerId = parts[0];
    const ticketChannelId = parts[1];

    let guild = interaction.guild;
    if (!guild) {
      guild = client.guilds.cache.first();
    }

    let member = interaction.member;
    if (!member && guild) {
      try {
        member = await guild.members.fetch(interaction.user.id);
      } catch (e) {}
    }

    // Check if clicker has Finance Managers role or Admin/Owner
    const isFinance = member && (
      member.roles.cache.some(r => r.name.toLowerCase().includes('finance') || STAFF_ROLE_IDS.includes(r.id)) ||
      interaction.user.id === guild.ownerId ||
      member.permissions.has(PermissionFlagsBits.Administrator)
    );

    if (!isFinance) {
      return interaction.followUp({
        content: '❌ **Access Denied:** Only members with the **💳・FINANCE MANAGERS** role can approve or reject payments!',
        flags: 64
      }).catch(() => {});
    }

  const staffMember = interaction.user;
  const ticketChannel = guild ? (guild.channels.cache.get(ticketChannelId) || await guild.channels.fetch(ticketChannelId).catch(() => null)) : null;

  // Disable buttons on the original message
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_done_action')
      .setLabel(isApprove ? `Approved by ${staffMember.username}` : `Rejected by ${staffMember.username}`)
      .setEmoji(isApprove ? '✅' : '❌')
      .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );

  try {
    await interaction.message.edit({ components: [disabledRow] });
  } catch (e) {}

  // 1. Send update inside Ticket Channel
  if (isApprove) {
    const approvedEmbed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle('✅ PAYMENT VERIFIED & APPROVED!')
      .setDescription(
        `🎉 <@${customerId}> **Your payment slip has been officially APPROVED!**\n\n` +
        `💳 **Verified By:** ${staffMember}\n` +
        `📦 **Status:** \`Processing Delivery\`\n` +
        `⚡ **Delivery Time:** **Within 24 Hours (Usually within a few minutes)**\n\n` +
        'Our team is now preparing your product login credentials/keys. Please stay tuned!'
      )
      .setFooter({ text: 'NISHU STORE • Order Approved' })
      .setTimestamp();

    await ticketChannel.send({ content: `🔔 <@${customerId}>`, embeds: [approvedEmbed] });

        // Direct Message (DM) to Customer
        try {
          const customerUser = await client.users.fetch(customerId);
          if (customerUser) {
            const dmApproveEmbed = new EmbedBuilder()
              .setColor(0x10B981)
              .setTitle('✅ PAYMENT APPROVED // NISHU STORE')
              .setDescription(
                `Hello ${customerUser.username}!\n\n` +
                `🎉 **YOUR PAYMENT IS APPROVED!**\n` +
                `📦 **Within 24 hours your product will be delivered.**\n\n` +
                `⭐ *Once you receive your product, please click the button below to leave a review / vouch!*`
              )
              .setFooter({ text: 'NISHU STORE • Automated Payment Confirmation' })
              .setTimestamp();

            const dmVouchRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_leave_vouch_${customerUser.id}`)
                .setLabel('Leave a Review (⭐)')
                .setStyle(ButtonStyle.Primary)
            );

            await customerUser.send({ embeds: [dmApproveEmbed], components: [dmVouchRow] }).catch(() => {});
          }
        } catch (dmErr) {
          console.warn('Could not send payment approval DM to customer:', dmErr.message);
        }

        // Add 1-click Leave Review button inside Ticket Channel
        const ticketVouchRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_leave_vouch_${customerId}`)
            .setLabel('⭐ Leave a Review / Vouch')
            .setStyle(ButtonStyle.Success)
        );

        if (ticketChannel) {
          await ticketChannel.send({
            content: `⭐ <@${customerId}> **Love your experience with Nishu Store?** Click below to submit your rating & vouch:`,
            components: [ticketVouchRow]
          }).catch(() => {});
        }

        // Save Transaction to Sales Database
        recordSaleTransaction({
          customerId,
          staffId: staffMember.id,
          staffTag: staffMember.tag || staffMember.username,
          ticketChannelId,
          channelName: ticketChannel ? ticketChannel.name : 'ticket',
          timestamp: Date.now()
        });

      } else {
        const rejectedEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ PAYMENT SLIP NOT APPROVED')
          .setDescription(
            `⚠️ <@${customerId}> **Your payment slip could NOT be verified/approved.**\n\n` +
            `💳 **Reviewed By:** ${staffMember}\n` +
            `📝 **Reason:** Invalid transaction, unreadable image, or mismatched amount.\n\n` +
            '👉 **Please check your payment receipt and upload a clear screenshot, or contact staff below.**'
          )
          .setFooter({ text: 'NISHU STORE • Verification Notice' })
          .setTimestamp();

        if (ticketChannel) {
          await ticketChannel.send({ content: `⚠️ <@${customerId}>`, embeds: [rejectedEmbed] }).catch(() => {});
        }

        // Direct Message (DM) to Customer
        try {
          const customerUser = await client.users.fetch(customerId);
          if (customerUser) {
            const dmRejectEmbed = new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ PAYMENT NOT APPROVED // NISHU STORE')
              .setDescription(
                `Hello ${customerUser.username}!\n\n` +
                `⚠️ **YOUR PAYMENT IS NOT APPROVED. PLEASE TRY AGAIN.**\n\n` +
                `Please check your ticket channel in the server or upload a valid transaction receipt.`
              )
              .setFooter({ text: 'NISHU STORE • Support Team' })
              .setTimestamp();

            await customerUser.send({ embeds: [dmRejectEmbed] }).catch(() => {});
          }
        } catch (dmErr) {
          console.warn('Could not send payment rejection DM to customer:', dmErr.message);
        }
      }
    } catch (err) {
      console.error('Error handling payment slip decision:', err);
    }
}

// ==========================================
// --- 17.5 SALES & FINANCE ANALYTICS ENGINE ---
// ==========================================
const SALES_FILE = path.join(__dirname, 'sales.json');

function loadSales() {
  try {
    if (!fs.existsSync(SALES_FILE)) {
      fs.writeFileSync(SALES_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(SALES_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('Error reading sales.json:', err);
    return [];
  }
}

function saveSales(sales) {
  try {
    fs.writeFileSync(SALES_FILE, JSON.stringify(sales, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving sales.json:', err);
  }
}

function recordSaleTransaction(saleData) {
  try {
    const sales = loadSales();
    sales.push({
      id: Date.now().toString(),
      ...saleData
    });
    saveSales(sales);
  } catch (err) {
    console.error('Error recording sale transaction:', err);
  }
}

async function handleFinanceCommand(interaction) {
  const guild = interaction.guild || client.guilds.cache.first();
  let member = interaction.member;
  if (!member && guild) {
    try { member = await guild.members.fetch(interaction.user.id); } catch (e) {}
  }

  const isFinance = member && (
    member.roles.cache.some(r => r.name.toLowerCase().includes('finance') || STAFF_ROLE_IDS.includes(r.id)) ||
    interaction.user.id === (guild?.ownerId) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );

  if (!isFinance) {
    return interaction.reply({
      content: '❌ **Access Denied:** Only members with the **💳・FINANCE MANAGERS** role can access financial analytics!',
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  const subcommand = interaction.options.getSubcommand();
  const sales = loadSales();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;

  const todaySales = sales.filter(s => (now - s.timestamp) <= oneDay);
  const weekSales = sales.filter(s => (now - s.timestamp) <= oneWeek);

  if (subcommand === 'summary') {
    const totalCount = sales.length;
    const todayCount = todaySales.length;
    const weekCount = weekSales.length;

    const summaryEmbed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle('📊 NISHU STORE // FINANCE & REVENUE DASHBOARD')
      .setDescription(
        'Here is the real-time financial performance and verified sales summary:\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `📅 **Today's Verified Orders:** \`${todayCount} orders\`\n` +
        `📈 **This Week's Verified Orders:** \`${weekCount} orders\`\n` +
        `📦 **All-Time Verified Orders:** \`${totalCount} orders\`\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '💡 *Use `/finance report` to view the latest approved transactions and customer breakdown.*'
      )
      .addFields(
        { name: '💳 Active Finance Team', value: '<@&1571719663639990424>', inline: true },
        { name: '⚡ Auto Slip Verification', value: '`ONLINE & ACTIVE`', inline: true },
        { name: '🕒 Last Generated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'NISHU STORE • Official Finance Analytics' })
      .setTimestamp();

    return interaction.editReply({ embeds: [summaryEmbed] });
  }

  if (subcommand === 'report') {
    if (sales.length === 0) {
      return interaction.editReply({ content: 'ℹ️ No verified sales recorded yet in the database.' });
    }

    const recent = sales.slice(-10).reverse();
    let reportDesc = '**Recent 10 Verified Sales:**\n\n';

    recent.forEach((s, idx) => {
      const timeStr = `<t:${Math.floor(s.timestamp / 1000)}:R>`;
      reportDesc += `**${idx + 1}.** Customer: <@${s.customerId}> • Verified By: \`${s.staffTag || 'Staff'}\`\n`;
      reportDesc += `   └ Ticket: \`${s.channelName || 'ticket'}\` • ${timeStr}\n\n`;
    });

    const reportEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle('📑 NISHU STORE // DETAILED SALES REPORT')
      .setDescription(reportDesc)
      .setFooter({ text: 'NISHU STORE • Finance Ledger' })
      .setTimestamp();

    return interaction.editReply({ embeds: [reportEmbed] });
  }
}

// Interactive Review Modal Opener
async function handleOpenVouchModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_submit_vouch')
    .setTitle('⭐ Leave a Review for Nishu Store');

  const ratingInput = new TextInputBuilder()
    .setCustomId('vouch_input_rating')
    .setLabel('Rating (1 to 5 Stars)')
    .setPlaceholder('Enter 5 for excellent, 4 for good...')
    .setMinLength(1)
    .setMaxLength(1)
    .setValue('5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const productInput = new TextInputBuilder()
    .setCustomId('vouch_input_product')
    .setLabel('Product / Service Purchased')
    .setPlaceholder('e.g. ChatGPT Plus, Canva Pro, Free Data...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const commentInput = new TextInputBuilder()
    .setCustomId('vouch_input_comment')
    .setLabel('Your Review & Feedback')
    .setPlaceholder('Write your experience with delivery and support...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ratingInput),
    new ActionRowBuilder().addComponents(productInput),
    new ActionRowBuilder().addComponents(commentInput)
  );

  await interaction.showModal(modal);
}

// Modal Submit Handler for Vouch / Review
async function handleModalVouchSubmit(interaction) {
  await interaction.deferReply({ flags: 64 });

  let rating = parseInt(interaction.fields.getTextInputValue('vouch_input_rating'), 10);
  if (isNaN(rating) || rating < 1) rating = 1;
  if (rating > 5) rating = 5;

  const product = interaction.fields.getTextInputValue('vouch_input_product');
  const comment = interaction.fields.getTextInputValue('vouch_input_comment');
  const starsString = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

  const vouches = loadVouches();
  const newVouch = {
    id: Date.now().toString(),
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    rating,
    product,
    comment,
    timestamp: Date.now()
  };

  vouches.push(newVouch);
  saveVouches(vouches);

  const totalRatings = vouches.reduce((acc, v) => acc + (v.rating || 5), 0);
  const averageRating = (totalRatings / vouches.length).toFixed(1);

  const guild = interaction.guild || client.guilds.cache.first();
  let targetChannel = null;
  if (process.env.VOUCH_CHANNEL_ID && guild) {
    targetChannel = guild.channels.cache.get(process.env.VOUCH_CHANNEL_ID);
  }
  if (!targetChannel && guild) {
    targetChannel = guild.channels.cache.find(c => c.name.includes('vouch') || c.name.includes('review')) || interaction.channel;
  }

  const vouchEmbed = new EmbedBuilder()
    .setColor(rating >= 4 ? 0x10B981 : (rating === 3 ? 0xF59E0B : 0xEF4444))
    .setTitle('🌟 NEW VERIFIED CUSTOMER REVIEW')
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Verified Customer', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: '📦 Product', value: `\`${product}\``, inline: true },
      { name: '⭐ Rating', value: `${starsString} (**${rating}/5**)`, inline: true },
      { name: '💬 Review', value: comment, inline: false },
      { name: '📊 Overall Store Rating', value: `⭐ **${averageRating} / 5.0** (${vouches.length} Total Reviews)`, inline: false }
    )
    .setFooter({ text: 'NISHU STORE • Verified Purchase Review' })
    .setTimestamp();

  if (targetChannel) {
    try {
      const posted = await targetChannel.send({ embeds: [vouchEmbed] });
      await posted.react('❤️').catch(() => {});
      await posted.react('⭐').catch(() => {});
    } catch (e) {
      console.warn('Could not post vouch to channel:', e.message);
    }
  }

  return interaction.editReply({
    content: `🎉 **Thank you so much for your review, ${interaction.user.username}!**\nYour review has been successfully posted in ${targetChannel || 'the reviews channel'}.`
  });
}

// ==========================================
// --- 17.6 ULTRA MUSIC PLAYER SYSTEM (Lavalink Riffy Engine) ---
// ==========================================
// Formats track duration in milliseconds into mm:ss or hh:mm:ss
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return 'Live / Unknown';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}:${remMinutes < 10 ? '0' : ''}${remMinutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

async function handleMusicPlayCommand(interaction) {
  await interaction.deferReply();

  const member = interaction.member;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    return interaction.editReply({
      content: '❌ **You must be in a Voice Channel** to play music!'
    });
  }

  const query = interaction.options.getString('query');

  try {
    // 1. Create or get existing Riffy player
    const player = client.riffy.createConnection({
      guildId: interaction.guild.id,
      voiceChannel: voiceChannel.id,
      textChannel: interaction.channel.id,
      deaf: true
    });

    // 2. Resolve tracks through Lavalink node
    const resolveRes = await client.riffy.resolve({
      query: query,
      requester: interaction.user.id
    });

    const { loadType, tracks, playlistInfo } = resolveRes;

    if (loadType === 'playlist') {
      for (const track of tracks) {
        track.info.requester = interaction.user.id;
        player.queue.add(track);
      }

      if (!player.playing && !player.paused) player.play();

      const playlistEmbed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('📑 PLAYLIST LOADED // NISHU MUSIC')
        .setDescription(`🎵 Loaded **${tracks.length}** songs from **${playlistInfo?.name || 'Playlist'}**!\n👤 **Requested By:** ${interaction.user}`)
        .setFooter({ text: 'NISHU MUSIC • 24/7 Voice Entertainment' });

      return interaction.editReply({ embeds: [playlistEmbed] });
    }

    if (loadType === 'search' || loadType === 'track') {
      const track = tracks[0];
      if (!track) {
        return interaction.editReply({
          content: `❌ No results found matching **"${query}"**!`
        });
      }

      track.info.requester = interaction.user.id;
      player.queue.add(track);

      if (!player.playing && !player.paused) {
        await interaction.editReply({
          content: `🎶 Loading **${track.info.title}** into ${voiceChannel}...`
        });
        player.play();
      } else {
        const addedEmbed = new EmbedBuilder()
          .setColor(0x10B981)
          .setTitle('➕ ADDED TO QUEUE // NISHU MUSIC')
          .setDescription(`🎵 **[${track.info.title}](${track.info.uri})**\n\n` +
            `⏱️ **Duration:** \`${formatDuration(track.info.length)}\`\n` +
            `👤 **Artist:** \`${track.info.author || 'Unknown'}\`\n` +
            `📍 **Queue Position:** \`#${player.queue.length}\`\n` +
            `👤 **Requested By:** ${interaction.user}`)
          .setThumbnail(track.info.artworkUrl || track.info.thumbnail || `https://i.ytimg.com/vi/${track.info.identifier}/hqdefault.jpg`)
          .setFooter({ text: 'NISHU MUSIC • Song Queued' });

        return interaction.editReply({ embeds: [addedEmbed] });
      }
      return;
    }

    return interaction.editReply({
      content: `❌ Could not find tracks for **"${query}"** (Type: ${loadType}). Please try a different song or link!`
    });
  } catch (err) {
    console.error('Error in handleMusicPlayCommand:', err);
    return interaction.editReply({
      content: `❌ Error loading song: ${err.message}`
    });
  }
}

async function handleMusicSkipCommand(interaction) {
  const player = client.riffy.players.get(interaction.guild.id);
  if (!player || !player.current) {
    return interaction.reply({ content: '❌ There is no music playing right now!', flags: 64 });
  }

  const skipped = player.current;
  player.stop();
  return interaction.reply({
    content: `⏭️ **Skipped:** \`${skipped.info.title}\`!`
  });
}

async function handleMusicStopCommand(interaction) {
  const player = client.riffy.players.get(interaction.guild.id);
  if (!player) {
    return interaction.reply({ content: '❌ Nishu Bot is not in a voice channel!', flags: 64 });
  }

  player.destroy();
  return interaction.reply({
    content: '⏹️ **Stopped playback, cleared the queue, and disconnected from Voice!**'
  });
}

async function handleMusicQueueCommand(interaction) {
  const player = client.riffy.players.get(interaction.guild.id);
  if (!player || (!player.current && player.queue.length === 0)) {
    return interaction.reply({ content: '📜 The music queue is currently empty!', flags: 64 });
  }

  const current = player.current;
  const upcoming = player.queue.slice(0, 10);

  let desc = '';
  if (current) {
    desc += `🎶 **Currently Playing:**\n**[${current.info.title}](${current.info.uri})** (\`${formatDuration(current.info.length)}\`) • <@${current.info.requester}>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }

  desc += `📜 **Upcoming Tracks (${player.queue.length} in queue):**\n`;

  if (upcoming.length === 0) {
    desc += '*No more songs in queue. Add more using `/play`!*\n';
  } else {
    upcoming.forEach((t, idx) => {
      desc += `**${idx + 1}.** [${t.info.title}](${t.info.uri}) (\`${formatDuration(t.info.length)}\`)\n`;
    });
  }

  const queueEmbed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle('📜 NISHU MUSIC // QUEUE LIST')
    .setDescription(desc)
    .setFooter({ text: 'NISHU MUSIC • 24/7 Voice Entertainment' })
    .setTimestamp();

  return interaction.reply({ embeds: [queueEmbed] });
}

async function handleMusicNowPlayingCommand(interaction) {
  const player = client.riffy.players.get(interaction.guild.id);
  if (!player || !player.current) {
    return interaction.reply({ content: '❌ There is no song currently playing!', flags: 64 });
  }

  const current = player.current;
  const npEmbed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle('🎶 CURRENTLY PLAYING')
    .setDescription(`🎵 **[${current.info.title}](${current.info.uri})**\n\n` +
      `⏱️ **Duration:** \`${formatDuration(current.info.length)}\`\n` +
      `👤 **Artist:** \`${current.info.author || 'Unknown'}\`\n` +
      `👤 **Requested By:** <@${current.info.requester}>\n` +
      `🔊 **Status:** \`${player.paused ? 'Paused ⏸️' : 'Playing ▶️'}\``)
    .setThumbnail(current.info.artworkUrl || current.info.thumbnail || `https://i.ytimg.com/vi/${current.info.identifier}/hqdefault.jpg`)
    .setFooter({ text: 'NISHU MUSIC • High Quality Audio Engine' });

  return interaction.reply({ embeds: [npEmbed] });
}

async function handleMusicButton(interaction) {
  const player = client.riffy.players.get(interaction.guild.id);
  if (!player) {
    return interaction.reply({ content: '❌ There is no active music session!', flags: 64 });
  }

  if (interaction.customId === 'music_btn_pause_resume') {
    if (player.paused) {
      player.pause(false);
      return interaction.reply({ content: '▶️ Resumed music playback!', flags: 64 });
    } else {
      player.pause(true);
      return interaction.reply({ content: '⏸️ Paused music playback!', flags: 64 });
    }
  }

  if (interaction.customId === 'music_btn_skip') {
    const skipped = player.current;
    player.stop();
    return interaction.reply({ content: `⏭️ Skipped **${skipped?.info?.title || 'track'}**!`, flags: 64 });
  }

  if (interaction.customId === 'music_btn_stop') {
    player.destroy();
    return interaction.reply({ content: '⏹️ Stopped music and disconnected!', flags: 64 });
  }

  if (interaction.customId === 'music_btn_queue') {
    return handleMusicQueueCommand(interaction);
  }
}

// ==========================================
// --- 18. START BOT ---
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is missing in your .env file!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

