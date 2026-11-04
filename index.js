require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActivityType, 
  AttachmentBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs = require('fs');

// --- 0. REGISTER MODERN SLEEK TYPOGRAPHY ---
const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
try {
  if (fs.existsSync(path.join(winFonts, 'bahnschrift.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'bahnschrift.ttf'), 'Bahnschrift');
  }
  if (fs.existsSync(path.join(winFonts, 'segoeuib.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'segoeuib.ttf'), 'SegoeUIBold');
  }
  console.log('✅ Sleek fonts (Bahnschrift & Segoe UI Bold) registered successfully!');
} catch (fontErr) {
  console.warn('⚠️ Could not register custom fonts, defaulting to system sans-serif.');
}

// --- 1. HEALTH CHECK WEB SERVER (For 24/7 Hosting) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send({ status: 'online', bot: 'Discord Welcome & Verification Bot is active!' });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT} (Keep-alive ready)`);
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
    
    console.log(`🌌 Preloading ${files.length} Galaxy video frames into memory...`);
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

    // 3D Coin
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

// --- 3. GENERATE VISUAL CYBER CAPTCHA IMAGE ---
function generateCaptchaImage(code) {
  const width = 360;
  const height = 110;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark Cyber Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#060610');
  grad.addColorStop(0.5, '#120f26');
  grad.addColorStop(1, '#050718');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Random neon grid lines
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

// In-memory cache for pending captchas: userId -> { code, timestamp }
const pendingCaptchas = new Map();

// Helper to generate 5-char alphanumeric code
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
  ],
});

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  client.user.setActivity('for new members 🛡️', { type: ActivityType.Watching });
});

client.once('ready', () => {
  console.log(`✅ Connected and ready as ${client.user.tag}!`);
});

// --- 5. WELCOME EVENT ---
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    const rulesChannelId = process.env.RULES_CHANNEL_ID;

    if (!welcomeChannelId) return;
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const gifBuffer = await generateAnimatedWelcomeCard(member.user, member.guild);
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: 'welcome-card.gif' });
    const cleanTitleName = getCleanServerName(member.guild.name);

    const rulesNotice = rulesChannelId 
      ? `📜 Please check out <#${rulesChannelId}> and verify below to unlock channels!` 
      : '📜 Please follow the server rules and verify below to unlock channels!';

    const descriptionText = [
      `Hey ${member}, welcome to **${cleanTitleName}**!`,
      '',
      rulesNotice,
      '',
      '🔒 **Security Protection Active:** Click the button below to complete verification and unlock full access.'
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
      .setFooter({ text: `Server: ${cleanTitleName} • Security Gateway`, iconURL: member.guild.iconURL() || undefined })
      .setTimestamp();

    // Verify Action Button
    const verifyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_start_verify')
        .setLabel('🛡️ VERIFY NOW')
        .setStyle(ButtonStyle.Success)
        
    );

    await channel.send({ 
      content: `👋 Hey ${member}, welcome!`,
      embeds: [welcomeEmbed], 
      files: [gifAttachment],
      components: [verifyRow]
    });
    console.log(`📢 Welcomed ${member.user.tag} with verification button.`);
  } catch (error) {
    console.error('❌ Error handling guildMemberAdd:', error);
  }
});

// --- 6. INTERACTION HANDLER (CYBER CAPTCHA VERIFICATION) ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    // 1. User clicks "VERIFY NOW"
    if (interaction.customId === 'btn_start_verify') {
      await interaction.deferReply({ flags: 64 });
      const verifiedRoleId = process.env.VERIFIED_ROLE_ID || '1566957216546684969';
      
      // Check if already verified
      if (interaction.member.roles.cache.has(verifiedRoleId)) {
        return interaction.reply({
          content: '✅ **You are already verified!** You already have full access to NISHU STORE. 🚀',
          ephemeral: true
        });
      }

      // Generate Captcha Code
      const correctCode = randomCode();
      pendingCaptchas.set(interaction.user.id, { code: correctCode, timestamp: Date.now() });

      // Generate decoy options
      const options = [correctCode];
      while (options.length < 4) {
        const decoy = randomCode();
        if (!options.includes(decoy)) options.push(decoy);
      }
      // Shuffle options
      options.sort(() => Math.random() - 0.5);

      // Render Visual Captcha
      const captchaBuffer = generateCaptchaImage(correctCode);
      const captchaAttachment = new AttachmentBuilder(captchaBuffer, { name: 'cyber-captcha.png' });

      // Create Cyber Choice Buttons
      const buttonRow = new ActionRowBuilder();
      options.forEach(opt => {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_choice_${opt}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary)
        );
      });

      const captchaEmbed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle('🛡️ NISHU STORE // SECURITY GATEWAY')
        .setDescription(
          '**HUMAN VERIFICATION REQUIRED**\n\n' +
          'To prevent spam bots and protect the server, please select the exact **5-character code** shown in the holographic scanner below.\n\n' +
          '⏱️ *This verification expires in 2 minutes.*'
        )
        .setImage('attachment://cyber-captcha.png')
        .setFooter({ text: 'Anti-Raid Visual Security • Click your matching code below' });

      return interaction.editReply({
        embeds: [captchaEmbed],
        files: [captchaAttachment],
        components: [buttonRow]
      });
    }

    // 2. User selects a Captcha Code Button
    if (interaction.customId.startsWith('verify_choice_')) {
      const chosenCode = interaction.customId.replace('verify_choice_', '');
      const stored = pendingCaptchas.get(interaction.user.id);

      if (!stored) {
        return interaction.reply({
          content: '⚠️ **Verification session expired.** Please click "VERIFY NOW" again.',
          ephemeral: true
        });
      }

      if (chosenCode === stored.code) {
        pendingCaptchas.delete(interaction.user.id);
        const verifiedRoleId = process.env.VERIFIED_ROLE_ID || '1566957216546684969';

        try {
          await interaction.member.roles.add(verifiedRoleId);
        } catch (roleErr) {
          console.error('Role add error:', roleErr);
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔓 ACCESS GRANTED // VERIFIED!')
          .setDescription(
            `🎉 **Welcome to NISHU STORE, ${interaction.user}!**\n\n` +
            '✅ You have successfully passed the human verification.\n' +
            '🌸 Role **COMMUNITY** has been granted to your account.\n\n' +
            '🚀 **All store channels, pricing, and chats are now unlocked!**'
          )
          .setFooter({ text: 'NISHU STORE • Verification Complete' })
          .setTimestamp();

        return interaction.update({
          embeds: [successEmbed],
          components: [],
          files: []
        });
      } else {
        // Wrong code clicked
        return interaction.reply({
          content: '❌ **Incorrect Code!** Please try again by clicking "VERIFY NOW".',
          ephemeral: true
        });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// --- 7. START BOT ---
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is missing in your .env file!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);